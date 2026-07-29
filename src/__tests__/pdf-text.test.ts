// @vitest-environment node

import { describe, it, expect, vi } from 'vitest';

import { extractPdfText } from '@/lib/pdf-text';

/**
 * Prueba de regresión del extractor de PDF — DELIBERADAMENTE SIN MOCKS.
 *
 * EL FALLO QUE ESTE ARCHIVO VIGILA
 * --------------------------------
 * `pdf-parse@1.1.1` publica un `index.js` con un arnés de depuración que corre
 * al evaluar el módulo:
 *
 *     let isDebugMode = !module.parent;
 *     if (isDebugMode) { Fs.readFileSync('./test/data/05-versions-space.pdf'); }
 *
 * Cargado desde ESM o desde el bundle de servidor de Next, `module.parent` no se
 * rellena, así que el `readFileSync` se ejecuta contra `process.cwd()` y el
 * módulo lanza `ENOENT` **en tiempo de carga**. En producción ese throw salía de
 * `await import('pdf-parse')` y el llamante lo traducía a
 * `TEXT_EXTRACTION_FAILED` (422): todos los PDF fallaban, dañados o no.
 *
 * De ahí las dos reglas de este archivo:
 *
 * 1. **Ningún `vi.mock` del módulo de PDF.** El bug era de carga, no de parseo;
 *    un mock lo esconde por completo. Las demás suites sí mockean el parser
 *    (les interesa el flujo, no el PDF), y por eso ninguna lo detectó.
 * 2. **Entorno `node`** (ver el docblock de arriba). El resto del proyecto corre
 *    en jsdom; el parser necesita las APIs de Node, igual que en el servidor.
 */

// El único mock permitido: `server-only` es un centinela de Next que revienta
// fuera del grafo de servidor. No tiene nada que ver con el parser de PDF.
vi.mock('server-only', () => ({}));

/**
 * PDF mínimo válido construido en el propio test.
 *
 * Se construye aquí en vez de leer un fixture de `node_modules/pdf-parse/test/`
 * a propósito: esos archivos son datos de prueba del paquete, no parte de su API
 * publicada, y desaparecen con cualquier instalación que pode los extras. Una
 * regresión de carga del parser no debería depender de eso.
 *
 * Los offsets de la tabla `xref` se calculan sobre los bytes ya serializados,
 * así que el documento es estructuralmente correcto y no depende de la
 * recuperación de xref roto que hace pdf.js.
 */
function buildMinimalPdf(text: string): Buffer {
  const contentStream = `BT /F1 24 Tf 20 100 Td (${text}) Tj ET\n`;

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];

  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const startxref = pdf.length;
  const xrefEntries = offsets
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');

  pdf +=
    `xref\n0 ${objects.length + 1}\n` +
    '0000000000 65535 f \n' +
    xrefEntries +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${startxref}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

describe('extractPdfText (módulo real de PDF, sin mocks)', () => {
  it('carga el módulo de PDF y expone un parser invocable', async () => {
    // Import directo del mismo especificador que usa `extractPdfText`. Con el
    // entry point del paquete (`'pdf-parse'`) esta línea lanzaba ENOENT.
    const mod = (await import('pdf-parse/lib/pdf-parse.js')) as unknown as
      | { default?: unknown }
      | unknown;

    const pdfParse =
      typeof mod === 'function'
        ? mod
        : (mod as { default?: unknown } | null)?.default;

    expect(typeof pdfParse).toBe('function');
  });

  it('no falla en tiempo de carga: un buffer inválido produce un error de parseo, no ENOENT', async () => {
    // La distinción es el corazón del bug. Antes, cualquier llamada moría al
    // cargar el módulo con ENOENT sobre './test/data/05-versions-space.pdf'.
    // Ahora la carga funciona y el error, si lo hay, viene del contenido.
    const error = await extractPdfText(
      Buffer.from('esto no es un pdf', 'utf-8'),
    ).then(
      () => null,
      (err: unknown) => err,
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as NodeJS.ErrnoException).code).not.toBe('ENOENT');
    expect((error as Error).message).not.toContain('05-versions-space.pdf');
  });

  it('extrae el texto de un PDF mínimo válido', async () => {
    const pdf = buildMinimalPdf('Hola Reclutify');

    const text = await extractPdfText(pdf);

    expect(text).toContain('Hola Reclutify');
  });
});
