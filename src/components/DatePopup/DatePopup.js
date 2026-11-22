import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './DatePopup.css';

// One simple calendar for every date field of the application (input type="date"), as the legacy software's: the month
// with ‹ / › (« / » for the year), the days from Monday, the day of the field circled, and « Aujourd'hui : jj/mm/aaaa ».
// A click on the field opens it; a day chosen is written in the field (the forms see it as typed) and it closes. The date
// can still be typed in the field.
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const DAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const WIDTH = 252;
const HEIGHT = 290;

const pad = (value) => String(value).padStart(2, '0');
export const isoOf = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseIso = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
};
const shown = (date) => `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;

// The 42 days (6 weeks from Monday) shown for the month.
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
}

const usable = (input) => input instanceof HTMLInputElement && input.type === 'date' && !input.disabled && !input.readOnly;

// The value written as if typed: React (and every form) sees an input and a change event.
function writeDate(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

export default function DatePopup() {
  const [field, setField] = useState(null); // the input the calendar is open for
  const [view, setView] = useState(() => new Date()); // any day of the month shown
  const [place, setPlace] = useState({ top: 0, left: 0 });
  const popup = useRef(null);

  const locate = useCallback((input) => {
    const rect = input.getBoundingClientRect();
    const below = rect.bottom + 4;
    const top = below + HEIGHT > window.innerHeight && rect.top - HEIGHT - 4 > 0 ? rect.top - HEIGHT - 4 : below;
    const left = Math.max(4, Math.min(rect.left, window.innerWidth - WIDTH - 4));
    setPlace({ top, left });
  }, []);

  const close = useCallback(() => setField(null), []);

  useEffect(() => {
    const onClick = (event) => {
      if (popup.current?.contains(event.target)) return;
      const input = event.target;
      if (usable(input)) {
        event.preventDefault(); // not the browser's own calendar
        const current = parseIso(input.value);
        setView(current || new Date());
        locate(input);
        setField(input);
        return;
      }
      setField(null);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [locate]);

  useEffect(() => {
    if (!field) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') { event.stopPropagation(); close(); }
      else if (event.key === 'Tab') close();
    };
    const onScroll = (event) => {
      if (popup.current?.contains(event.target)) return;
      if (!field.isConnected) { close(); return; }
      locate(field);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    // the field gone (its window closed): the calendar too
    const timer = window.setInterval(() => { if (!field.isConnected) close(); }, 400);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
      window.clearInterval(timer);
    };
  }, [field, close, locate]);

  if (!field) return null;

  const year = view.getFullYear();
  const month = view.getMonth();
  const chosen = parseIso(field.value);
  const today = new Date();
  const min = parseIso(field.min);
  const max = parseIso(field.max);
  const allowed = (day) => (!min || day >= min) && (!max || day <= max);
  const move = (months) => setView(new Date(year, month + months, 1));
  const pick = (day) => {
    if (!allowed(day)) return;
    writeDate(field, isoOf(day));
    field.focus();
    close();
  };
  const same = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  return createPortal(
    <div ref={popup} className="dp-popup" role="group" aria-label="Calendrier" style={{ top: place.top, left: place.left }}
      onMouseDown={(event) => event.preventDefault() /* the field keeps the focus */}>
      <div className="dp-head">
        <button type="button" onClick={() => move(-12)} aria-label="Année précédente">«</button>
        <button type="button" onClick={() => move(-1)} aria-label="Mois précédent">‹</button>
        <strong>{MONTHS[month]} {year}</strong>
        <button type="button" onClick={() => move(1)} aria-label="Mois suivant">›</button>
        <button type="button" onClick={() => move(12)} aria-label="Année suivante">»</button>
      </div>
      <div className="dp-grid">
        {DAYS.map((day) => <span key={day} className="dp-weekday">{day}</span>)}
        {monthGrid(year, month).map((day) => (
          <button key={isoOf(day)} type="button" disabled={!allowed(day)} aria-label={shown(day)}
            className={['dp-day', day.getMonth() !== month && 'is-other', same(day, chosen) && 'is-chosen', same(day, today) && 'is-today'].filter(Boolean).join(' ')}
            onClick={() => pick(day)}>
            {day.getDate()}
          </button>
        ))}
      </div>
      <button type="button" className="dp-today" disabled={!allowed(new Date(today.getFullYear(), today.getMonth(), today.getDate()))}
        onClick={() => pick(new Date(today.getFullYear(), today.getMonth(), today.getDate()))}>
        Aujourd&apos;hui : {shown(today)}
      </button>
    </div>,
    document.body,
  );
}
