import 'server-only';

/**
 * Extracción de texto de PDF, punto único de entrada del servidor.
 *
 * POR QUÉ SE IMPORTA `pdf-parse/lib/pdf-parse.js` Y NO `pdf-parse`
 * ----------------------------------------------------------------
 * El entry point publicado por `pdf-parse@1.1.1` (`index.js`) trae un arnés de
 * depuración que se ejecuta **al evaluar el módulo**:
 *
 * ```js
 * const Pdf = require('./lib/pdf-parse.js');
 * module.exports = Pdf;
 * let isDebugMode = !module.parent;
 * if (isDebugMode) {
 *     let PDF_FILE = './test/data/05-versions-space.pdf';
 *     let dataBuffer = Fs.readFileSync(PDF_FILE);   // <-- lanza aquí
 *     ...
 * }
 * ```
 *
 * `module.parent` solo tiene valor cuando el módulo lo carga otro módulo CJS
 * mediante `require`. Al llegar desde `await import('pdf-parse')` en contexto
 * ESM —o desde el bundle de servidor de Next— el cargador no rellena
 * `module.parent`, así que `isDebugMode` queda en `true`, se ejecuta el
 * `readFileSync` de la ruta relativa `./test/data/05-versions-space.pdf` contra
 * `process.cwd()` y el módulo lanza `ENOENT` **en tiempo de carga**, antes de
 * parsear un solo byte. Reproducción literal desde la raíz del repo:
 *
 *     Error: ENOENT: no such file or directory, open './test/data/05-versions-space.pdf'
 *         at Object.readFileSync (node:fs:445:35)
 *         at Object.<anonymous> (node_modules/pdf-parse/index.js:15:25)
 *
 * Ese throw viajaba hasta el `catch` del llamante, que lo clasificaba como
 * `TEXT_EXTRACTION_FAILED` (HTTP 422) y le decía al administrador que su
 * archivo estaba dañado. El archivo nunca fue el problema: **todos** los PDF
 * fallaban.
 *
 * `lib/pdf-parse.js` es el parser real y no tiene arnés ni IO en la carga, así
 * que importarlo directamente elude `index.js` por completo. NO SIMPLIFICAR
 * este especificador de vuelta a `'pdf-parse'`: reintroduce el fallo.
 *
 * Complemento en `next.config.ts`: `serverExternalPackages` incluye
 * `pdf-parse` para que Next no lo empaquete y el `require` interno de
 * `lib/pdf.js` se resuelva en runtime.
 */

/** Forma mínima del resultado de `pdf-parse` que consumimos. */
interface PdfParseResult {
  text: string;
}

type PdfParseFn = (buffer: Buffer) => Promise<PdfParseResult>;

/**
 * Texto plano de un PDF.
 *
 * Los errores de parseo **no se capturan aquí**: se propagan tal cual para que
 * cada llamante los clasifique con su propia taxonomía (por ejemplo
 * `TEXT_EXTRACTION_FAILED` en el centro de capacitación, o un 400 en las rutas
 * de parseo). Esta función solo garantiza que el módulo se cargó y expone un
 * parser invocable.
 *
 * @throws Si el módulo de `pdf-parse` no expone una función invocable, o
 *   cualquier error que lance el propio parser.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  // Ver el bloque de cabecera: el especificador apunta al parser interno a
  // propósito. `pdf-parse` (index.js) rompe en tiempo de carga.
  const mod = (await import('pdf-parse/lib/pdf-parse.js')) as unknown as
    | { default?: PdfParseFn }
    | PdfParseFn;

  // El interop CJS→ESM entrega la función directamente en unos runtimes y
  // envuelta en `.default` en otros; se aceptan ambas formas.
  const pdfParse = typeof mod === 'function' ? mod : mod?.default;

  if (typeof pdfParse !== 'function') {
    throw new Error(
      'pdf-parse module did not expose a callable parser (pdf-parse/lib/pdf-parse.js)',
    );
  }

  const parsed = await pdfParse(buffer);

  return parsed.text;
}
