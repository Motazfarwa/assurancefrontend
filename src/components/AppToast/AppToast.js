import { useEffect, useState } from 'react';
import { TOAST_EVENT } from '../../services/toast';
import './AppToast.css';

// The success toast of every module: the last message replaces the previous one and hides after a few seconds.
export default function AppToast() {
  const [toast, setToast] = useState(null); // { text, id }

  useEffect(() => {
    const onToast = (event) => setToast({ text: event.detail.text, id: Date.now() });
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  return <div key={toast.id} className="app-toast" role="status"><span aria-hidden="true">✓</span>{toast.text}</div>;
}
