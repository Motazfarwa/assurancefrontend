// Reads every page of a PDF in the browser: the text layer when the PDF has one, OCR of the rendered page
// otherwise (scanned PDFs). Lines keep wide gaps as 3 spaces so table cells can still be told apart.

async function openPdf(file) {
  const pdfjs = await import('pdfjs-dist/build/pdf');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('./pdfWorker')).default;
  return pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
}

// Text items -> lines, sorted top to bottom then left to right.
function layoutText(items) {
  const rows = [];
  items.filter((item) => item.str && item.str.trim()).forEach((item) => {
    const [, , , , x, y] = item.transform;
    const height = Math.abs(item.transform[3]) || 10;
    let row = rows.find((candidate) => Math.abs(candidate.y - y) < height * 0.5);
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push({ x, end: x + (item.width || 0), str: item.str, height });
  });
  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => {
      const sorted = row.items.sort((a, b) => a.x - b.x);
      return sorted.reduce((line, item, index) => {
        if (index === 0) return item.str;
        const gap = item.x - sorted[index - 1].end;
        return line + (gap > item.height * 1.5 ? '   ' : gap > item.height * 0.15 ? ' ' : '') + item.str;
      }, '');
    })
    .join('\n');
}

// Text items in the order the PDF writes them: follows each column / block, so a label is followed by its value.
function streamText(items) {
  let text = '';
  let previousY = null;
  items.forEach((item) => {
    const y = item.transform[5];
    const height = Math.abs(item.transform[3]) || 10;
    if (text && !text.endsWith('\n')) text += previousY !== null && Math.abs(previousY - y) > height * 0.5 ? '\n' : ' ';
    text += item.str || '';
    if (item.hasEOL) text += '\n';
    previousY = y;
  });
  return text.split('\n').map((line) => line.replace(/\s{2,}/g, ' ').trim()).filter(Boolean).join('\n');
}

async function renderPage(page, scale = 2.5) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

// Returns two readings of all pages: [reading order, row by row]. A scanned page gives the same OCR text in both.
// Progress is reported as 0..1.
export async function pdfReadings(file, onProgress) {
  const pdf = await openPdf(file);
  const pages = [];
  const rows = [];
  const scanned = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const { items } = await page.getTextContent();
    const text = streamText(items);
    // Fewer than a few words: an image of a page, OCR it.
    if (text.replace(/\s/g, '').length < 30) scanned.push({ index: pages.length, image: await renderPage(page) });
    pages.push(text);
    rows.push(layoutText(items));
    if (onProgress) onProgress((number / pdf.numPages) * (scanned.length ? 0.2 : 1));
  }

  if (scanned.length) {
    const { createWorker } = await import('tesseract.js');
    let current = 0;
    const worker = await createWorker(['fra', 'ara'], 1, {
      logger: (message) => {
        if (message.status === 'recognizing text' && onProgress) onProgress(0.2 + ((current + message.progress) / scanned.length) * 0.8);
      },
    });
    try {
      await worker.setParameters({ tessedit_pageseg_mode: '4', preserve_interword_spaces: '1' });
      for (current = 0; current < scanned.length; current += 1) {
        const { data } = await worker.recognize(scanned[current].image);
        pages[scanned[current].index] = data.text || '';
        rows[scanned[current].index] = data.text || '';
      }
    } finally {
      await worker.terminate();
    }
  }
  return [pages.join('\n\n'), rows.join('\n\n')];
}
