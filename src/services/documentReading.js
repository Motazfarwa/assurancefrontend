// How every import reads a document: by OCR only (no AI). The server's OCR (Azure Read) recognises printed and
// handwritten text; when it is not configured or unavailable, the document is read by OCR in the browser (printed
// text). The text is then analysed by each module's own parser.
import { API_BASE_URL } from './apiBase';
import { fileToBase64, isPdf, readDocumentText, toJpegBase64 } from './ficheOcr';

let serverOcr = null; // null: not tried yet; false: not configured on the server (no need to ask again)

async function serverText(token, file) {
  const pdf = isPdf(file);
  const payload = { image_base64: pdf ? await fileToBase64(file) : await toJpegBase64(file, 3200, 0.92), media_type: pdf ? 'application/pdf' : 'image/jpeg' };
  const response = await fetch(`${API_BASE_URL}/api/ocr/text`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (response.status === 501) { serverOcr = false; return ''; }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : `OCR serveur (${response.status})`);
  serverOcr = true;
  return String(body.text || '');
}

// The text read by the server OCR (printed + handwritten), or '' when it is not configured or unavailable.
export async function serverOcrText(token, file) {
  if (!token || serverOcr === false) return '';
  try {
    return await serverText(token, file);
  } catch {
    return ''; // server OCR unavailable this time: the browser reads the document
  }
}

// { text, engine }: engine 'serveur' (printed + handwritten) or 'navigateur' (printed).
export async function readText(token, file, onProgress) {
  const text = await serverOcrText(token, file);
  if (text.trim()) return { text, engine: 'serveur' };
  return { text: await readDocumentText(file, onProgress), engine: 'navigateur' };
}

// Reads the document, then fromText(text) analyses it (a module's parser on the server).
export async function readWithOcr(token, file, onProgress, fromText) {
  const { text, engine } = await readText(token, file, onProgress);
  if (!text.trim()) throw new Error('aucun texte n’a pu être lu : vérifiez la qualité du document.');
  return { ...(await fromText(text)), source: 'ocr', engine };
}
