import { useEffect } from 'react';
import './UppercaseInputs.css';

// Saisie en majuscules: what is typed in the text fields of the modules is put in capitals as it is typed (so it is
// saved in capitals), and the text fields show their value in capitals. Kept as typed: the emails (the "Emails" of the
// Coordonnées and every email field), the passwords, the user names (the login is case-sensitive), the pages of the
// login and of the users, and any field marked data-keep-case.
const KEEP_CASE_PAGES = ['/login', '/admin/users'];
const TEXT_TYPES = new Set(['', 'text', 'search']);
const KEEP_CASE_HINT = /e-?mail|courriel|mot de passe|password|utilisateur|username|login/i;

export function keepsCase(element) {
  if (!element || element.readOnly || element.disabled) return true;
  if (element.tagName === 'INPUT') {
    if (!TEXT_TYPES.has((element.getAttribute('type') || '').toLowerCase())) return true;
  } else if (element.tagName !== 'TEXTAREA') return true;
  if (element.closest('[data-keep-case]')) return true;
  if (KEEP_CASE_PAGES.includes(window.location.pathname)) return true;
  const hints = [element.getAttribute('autocomplete'), element.name, element.id, element.getAttribute('aria-label'), element.placeholder,
    element.closest('label')?.textContent].filter(Boolean).join(' ');
  return KEEP_CASE_HINT.test(hints);
}

// The value set without React's tracker seeing it: React then sees the change and its onChange reads the capitals.
function setNativeValue(element, value) {
  const proto = element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value);
}

export function upperOnInput(event) {
  const element = event.target;
  if (event.isComposing || keepsCase(element)) return;
  const value = element.value;
  const upper = value.toLocaleUpperCase('fr-FR');
  if (upper === value || upper.length !== value.length) return;
  const { selectionStart, selectionEnd } = element;
  setNativeValue(element, upper);
  try { element.setSelectionRange(selectionStart, selectionEnd); } catch { /* fields without a caret */ }
}

export default function UppercaseInputs({ pathname }) {
  useEffect(() => {
    window.addEventListener('input', upperOnInput, true); // before React reads the value
    return () => window.removeEventListener('input', upperOnInput, true);
  }, []);
  useEffect(() => {
    if (KEEP_CASE_PAGES.includes(pathname)) document.body.dataset.keepCase = ''; else delete document.body.dataset.keepCase;
  }, [pathname]);
  return null;
}
