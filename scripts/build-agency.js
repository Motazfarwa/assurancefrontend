// Build of the agency (offline) server: npm run build:agency [output folder]
//  - the API is the server that serves the page (REACT_APP_API_URL=same-origin),
//  - the OCR engine and its French / Arabic data are shipped in /tesseract instead of being downloaded at runtime.
// Needs internet once, to fetch the language data (kept in public/tesseract for the next builds).
const fs = require('fs');
const https = require('https');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const target = path.join(root, 'public', 'tesseract');
const LANGS = ['fra', 'ara'];
// tesseract.js loads these "best_int" models for its LSTM engine (createWorker(langs, 1)).
const langUrl = (lang) => `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`;

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function download(url, to) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        download(new URL(response.headers.location, url).toString(), to).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) { reject(new Error(`${url}: HTTP ${response.statusCode}`)); return; }
      const part = `${to}.part`;
      const file = fs.createWriteStream(part);
      response.pipe(file);
      file.on('finish', () => file.close(() => { fs.renameSync(part, to); resolve(); }));
      file.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  const modules = path.join(root, 'node_modules');
  copy(path.join(modules, 'tesseract.js', 'dist', 'worker.min.js'), path.join(target, 'worker.min.js'));
  for (const core of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js']) {
    copy(path.join(modules, 'tesseract.js-core', core), path.join(target, 'core', core));
  }
  fs.mkdirSync(path.join(target, 'lang'), { recursive: true });
  for (const lang of LANGS) {
    const file = path.join(target, 'lang', `${lang}.traineddata.gz`);
    if (fs.existsSync(file)) continue;
    console.log(`Téléchargement des données OCR « ${lang} »…`);
    await download(langUrl(lang), file);
  }

  const out = path.resolve(process.argv[2] || path.join(root, 'build-agency'));
  const build = spawnSync(process.execPath, [require.resolve('react-scripts/scripts/build')], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, REACT_APP_API_URL: 'same-origin', BUILD_PATH: out, GENERATE_SOURCEMAP: 'false' },
  });
  if (build.status !== 0) process.exit(build.status || 1);
  console.log(`Build agence prêt : ${out}`);
}

main().catch((error) => { console.error(error.message); process.exit(1); });
