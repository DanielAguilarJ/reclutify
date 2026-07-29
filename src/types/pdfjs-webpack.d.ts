/**
 * Tipos del entry point de empaquetador de `pdfjs-dist`.
 *
 * `pdfjs-dist/webpack.mjs` reexporta `./build/pdf.mjs` y además cablea el worker
 * con `new Worker(new URL('./build/pdf.worker.mjs', import.meta.url))`, que es la
 * forma que el empaquetador (Turbopack incluido) sabe resolver. El paquete no
 * publica declaraciones para ese subpath —solo para el entry principal—, así que
 * se reexportan las del propio paquete, igual que hace su build `legacy`
 * (`legacy/build/pdf.d.mts` contiene exactamente `export * from "pdfjs-dist"`).
 *
 * Ver `src/lib/training/client-ocr.ts` para el porqué de usar ese subpath.
 */
declare module 'pdfjs-dist/webpack.mjs' {
  export * from 'pdfjs-dist';
}
