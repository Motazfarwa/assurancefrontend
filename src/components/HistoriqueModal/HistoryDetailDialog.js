import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../auth/AuthContext';
import { getHistoryDetail } from '../../services/historiqueApi';
import './HistoriqueModal.css';

const frDate = (value) => (value ? value.split('-').reverse().join('/') : '');
const INTRO = {
  modification: 'Champs modifiés, avec leur valeur avant et après :',
  creation: 'Valeurs enregistrées à la création :',
  suppression: 'Valeurs de l’enregistrement supprimé :',
  donnees: 'Données envoyées par l’utilisateur :',
  tentative: 'Données de l’action refusée :',
};

// What exactly one action of the history did (administrator): the fields changed (before → after), or the values
// added / deleted. Opened from the Historique des actions and from the notifications.
export default function HistoryDetailDialog({ n, onClose }) {
  const { accessToken } = useAuth();
  const [state, setState] = useState({ loading: true, error: '', action: null });

  useEffect(() => {
    let active = true;
    getHistoryDetail(accessToken, n)
      .then((action) => { if (active) setState({ loading: false, error: '', action }); })
      .catch((error) => { if (active) setState({ loading: false, error: error.message, action: null }); });
    return () => { active = false; };
  }, [accessToken, n]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const { action } = state;
  const details = action?.details;
  const changes = details?.changements;
  const values = details?.valeurs;
  return createPortal(<div className="his-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="his-detail" role="dialog" aria-modal="true" aria-labelledby="his-detail-title">
      <header>
        <div><span>DÉTAIL DE L’ACTION{action ? ` N° ${action.n}` : ''}</span><h2 id="his-detail-title">{action?.design || 'Action'}</h2></div>
        <button type="button" className="expert-close" onClick={onClose} aria-label="Fermer">×</button>
      </header>
      {state.loading ? <p className="his-detail-empty">Chargement…</p> : state.error ? <p className="his-detail-empty is-error" role="alert">{state.error}</p> : <>
        <dl className="his-detail-meta">
          <div><dt>Utilisateur</dt><dd>{action.utilisateur}</dd></div>
          <div><dt>Date</dt><dd>{frDate(action.date)}</dd></div>
          <div><dt>Heure</dt><dd>{action.heure}</dd></div>
          <div><dt>Mouvement</dt><dd><span className={`his-move his-move-${action.code ?? 0}`}>{action.mvt === 'Suppresion' ? 'Suppression' : action.mvt}</span></dd></div>
        </dl>
        <div className="his-detail-body">
          {!details ? <p className="his-detail-empty">Pas de détail pour cette action : elle a été enregistrée avant le suivi détaillé, ou par l’ancien logiciel.</p> : <>
            <p className="his-detail-intro">{INTRO[details.type] || 'Détail :'}{details.table ? <small> (table {details.table})</small> : null}</p>
            {changes && (changes.length ? <table className="his-detail-table">
              <thead><tr><th>Champ</th><th>Avant</th><th>Après</th></tr></thead>
              <tbody>{changes.map((change) => <tr key={change.champ}><td>{change.champ}</td><td className="is-before">{change.avant || <i>vide</i>}</td><td className="is-after">{change.apres || <i>vide</i>}</td></tr>)}</tbody>
            </table> : <p className="his-detail-empty">Enregistré sans aucun changement de valeur.</p>)}
            {values && (values.length ? <table className="his-detail-table">
              <thead><tr><th>Champ</th><th>Valeur</th></tr></thead>
              <tbody>{values.map((item) => <tr key={item.champ}><td>{item.champ}</td><td>{item.valeur}</td></tr>)}</tbody>
            </table> : <p className="his-detail-empty">Aucune valeur.</p>)}
          </>}
        </div>
      </>}
      <footer><button type="button" className="expert-submit" onClick={onClose}>Fermer</button></footer>
    </section>
  </div>, document.body); // over every window, whatever opened it
}
