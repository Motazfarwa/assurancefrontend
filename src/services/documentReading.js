// How every import reads a document: the AI first (it reads printed and handwritten text), then, when the AI is
// unavailable (Google busy, quota, network…) or reads nothing, OCR in the browser, whose text the server analyses.
// The import therefore always gives a result.
import { fileToBase64, isPdf, readDocumentText, toJpegBase64 } from './ficheOcr';

// The document as the AI endpoints take it: a PDF as it is, a photo / scan as a JPEG.
export async function documentPayload(file, maxSide = 2600) {
  const pdf = isPdf(file);
  return { image_base64: pdf ? await fileToBase64(file) : await toJpegBase64(file, maxSide, 0.92), media_type: pdf ? 'application/pdf' : 'image/jpeg' };
}

// ai(payload) -> result | fromText(text) -> result | isEmpty(result) -> true when the AI found nothing.
export async function readAiThenOcr(file, onProgress, { ai, fromText, isEmpty = () => false }) {
  let aiProblem = '';
  try {
    const result = await ai(await documentPayload(file));
    if (!isEmpty(result)) return result;
    aiProblem = 'aucune information trouvée par l’IA';
  } catch (error) {
    aiProblem = error.message;
  }
  const text = await readDocumentText(file, onProgress);
  if (!text.trim()) throw new Error('aucun texte n’a pu être lu : vérifiez la qualité du document.');
  return { ...(await fromText(text)), source: 'ocr', aiProblem };
}
