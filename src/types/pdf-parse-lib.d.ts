/**
 * Tipos para el subpath interno de `pdf-parse`.
 *
 * `@types/pdf-parse` solo declara el entry point del paquete (`pdf-parse`), pero
 * el servidor importa a propósito `pdf-parse/lib/pdf-parse.js` para esquivar el
 * arnés de depuración de `index.js`, que hace `Fs.readFileSync` en tiempo de
 * carga cuando `module.parent` no está definido. Ver `src/lib/pdf-text.ts`.
 *
 * El subpath exporta exactamente la misma función que el entry point, así que se
 * reutilizan sus tipos en lugar de duplicarlos.
 */
declare module 'pdf-parse/lib/pdf-parse.js' {
  import type { Options, Result } from 'pdf-parse';

  const pdfParse: (dataBuffer: Buffer, options?: Options) => Promise<Result>;

  export default pdfParse;
}
