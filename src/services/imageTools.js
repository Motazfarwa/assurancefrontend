// Preparing a page image for OCR (Tesseract reads best around 300 DPI, dark text on a clean white background).

// Enlarged so the longer side is about `targetSide` pixels, turned to grey and stretched to full contrast; with
// `binarize`, turned to pure black and white (Otsu threshold), which helps on faint, stained or coloured scans.
export async function enhanceImage(source, { targetSide = 2600, binarize = false } = {}) {
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
  const scale = Math.min(targetSide / Math.max(bitmap.width, bitmap.height), 3);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.imageSmoothingQuality = 'high';
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (bitmap.close) bitmap.close();

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = image;
  const histogram = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const grey = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = grey;
    histogram[grey] += 1;
  }
  const pixels = data.length / 4;
  let low = 0;
  let high = 255;
  for (let sum = 0; low < 255 && sum + histogram[low] < pixels * 0.02; low += 1) sum += histogram[low];
  for (let sum = 0; high > 0 && sum + histogram[high] < pixels * 0.02; high -= 1) sum += histogram[high];
  const range = Math.max(1, high - low);
  const threshold = binarize ? otsu(histogram, pixels) : 0;
  for (let i = 0; i < data.length; i += 4) {
    const value = binarize ? (data[i] > threshold ? 255 : 0) : Math.max(0, Math.min(255, ((data[i] - low) * 255) / range));
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }
  context.putImageData(image, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

// The grey level that best separates ink from paper.
function otsu(histogram, pixels) {
  let total = 0;
  for (let level = 0; level < 256; level += 1) total += level * histogram[level];
  let background = 0;
  let backgroundSum = 0;
  let best = 0;
  let threshold = 127;
  for (let level = 0; level < 256; level += 1) {
    background += histogram[level];
    if (!background) continue;
    const foreground = pixels - background;
    if (!foreground) break;
    backgroundSum += level * histogram[level];
    const meanBack = backgroundSum / background;
    const meanFore = (total - backgroundSum) / foreground;
    const between = background * foreground * (meanBack - meanFore) ** 2;
    if (between > best) { best = between; threshold = level; }
  }
  return threshold;
}

// Two OCR passes on one page, merged: the page as a block of text (psm 6, on the grey image) then the text scattered
// in boxes and columns (psm 11, on the black-and-white image) - forms such as a constat or a quittance need both.
export async function recognizePage(worker, source, onPassProgress) {
  const passes = [
    { mode: '6', image: await enhanceImage(source) },
    { mode: '11', image: await enhanceImage(source, { binarize: true }) },
  ];
  const texts = [];
  for (let index = 0; index < passes.length; index += 1) {
    onPassProgress?.(index, passes.length);
    await worker.setParameters({ tessedit_pageseg_mode: passes[index].mode, preserve_interword_spaces: '1', user_defined_dpi: '300' });
    const { data } = await worker.recognize(passes[index].image);
    if (data.text && data.text.trim()) texts.push(data.text);
  }
  return texts.join('\n\n');
}
