function ShieldMark() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className="brand-mark">
      <path d="M20 3.5 34 9v9.8c0 8.5-5.9 14.8-14 18.1C11.9 33.6 6 27.3 6 18.8V9l14-5.5Z" fill="currentColor" />
      <path d="m13.2 20.2 4.3 4.3 9.4-9.7" fill="none" stroke="#102b42" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Brand() {
  return (
    <a className="brand" href="/login" aria-label="Assurance Jemmali, accueil">
      <span className="brand-icon"><ShieldMark /></span>
      <span className="brand-name">assur<span>ance</span></span>
    </a>
  );
}
