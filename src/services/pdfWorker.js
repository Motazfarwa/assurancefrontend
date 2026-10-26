// Kept apart (and loaded lazily) because `import.meta` is bundled by webpack but not understood by Jest.
const workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url).toString();
export default workerSrc;
