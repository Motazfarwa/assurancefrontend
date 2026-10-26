import { useState } from 'react';
import './ScanSummary.css';

// What an imported document gave: every value read, and the raw text on demand.
export default function ScanSummary({ fileName, found, text, onClose }) {
  const [showText, setShowText] = useState(false);
  return (
    <div className="scan-summary" role="status">
      <div className="scan-summary-head">
        <strong>Document importé{fileName ? ` : ${fileName}` : ''}</strong>
        <span>{found.length} information(s) extraite(s) et reportée(s) dans le formulaire. Vérifiez-les avant de valider.</span>
        {onClose && <button type="button" onClick={onClose} aria-label="Masquer le résumé">×</button>}
      </div>
      {found.length > 0 && (
        <dl>
          {found.map((item) => <div key={item.key}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
        </dl>
      )}
      {text && <button type="button" className="scan-summary-link" onClick={() => setShowText(!showText)}>{showText ? 'Masquer' : 'Afficher'} le texte lu</button>}
      {showText && <pre dir="auto">{text}</pre>}
    </div>
  );
}
