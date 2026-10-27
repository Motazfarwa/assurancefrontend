import { IS_AGENCY_SERVER } from './apiBase';

// The agency (offline) build ships the OCR engine and its French / Arabic data in /tesseract
// (copied by scripts/build-agency.js); the online build keeps tesseract.js' CDN defaults.
const base = `${window.location.origin}${process.env.PUBLIC_URL || ''}/tesseract`;

export const TESSERACT_PATHS = IS_AGENCY_SERVER
  ? { workerPath: `${base}/worker.min.js`, corePath: `${base}/core`, langPath: `${base}/lang` }
  : {};
