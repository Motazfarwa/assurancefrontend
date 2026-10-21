import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useClient } from '../../contexts/ClientContext';
import { askAssistant } from '../../services/assistantApi';
import './AssistantWidget.css';

const MODES = {
  ask: {
    label: 'Assistant',
    hint: 'Posez une question sur vos clients, polices, quittances ou sinistres.',
    placeholder: 'Ex. Combien de polices actives pour le client 5060 ?',
    suggestions: ['Quelles quittances sont impayées pour le client en cours ?', 'Combien de clients ont été créés ce mois-ci ?', 'Résume les polices du client 5060'],
  },
  agent: {
    label: 'Agent',
    hint: 'Donnez une tâche : l’agent enquête dans la base en plusieurs étapes et rend un résultat structuré.',
    placeholder: 'Ex. Liste les 10 clients avec le plus d’impayés et propose des relances',
    suggestions: ['Prépare la liste des quittances arrivant à échéance dans 30 jours', 'Trouve les clients en double (même nom)', 'Analyse les impayés par compagnie'],
  },
};

const TOOL_LABELS = { list_tables: 'Lecture du schéma', run_sql: 'Requête en base' };

function Steps({ steps }) {
  if (!steps?.length) return null;
  return <details className="assistant-steps"><summary>{steps.length} étape(s) dans la base</summary>
    <ol>{steps.map((step, index) => <li key={index} className={step.error ? 'is-error' : ''}><strong>{TOOL_LABELS[step.tool] || step.tool}</strong>{step.input?.query && <code>{step.input.query}</code>}{step.input?.name_contains && <code>{step.input.name_contains}</code>}</li>)}</ol>
  </details>;
}

export default function AssistantWidget() {
  const { user, accessToken } = useAuth();
  const { client } = useClient();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('ask');
  const [threads, setThreads] = useState({ ask: [], agent: [] });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);
  const abortRef = useRef(null);
  const messages = threads[mode];
  const onClientPage = window.location.pathname.startsWith('/clients');
  const clientCode = onClientPage && client.clientCode ? client.clientCode : '';

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy, open]);
  useEffect(() => () => abortRef.current?.abort(), []);

  if (!user) return null;

  async function send(text) {
    const content = text.trim();
    if (!content || busy) return;
    const history = [...threads[mode], { role: 'user', content }];
    setThreads((current) => ({ ...current, [mode]: history }));
    setInput('');
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { answer, steps } = await askAssistant(accessToken, { messages: history.map(({ role, content: body }) => ({ role, content: body })).slice(-20), mode, clientCode }, controller.signal);
      setThreads((current) => ({ ...current, [mode]: [...history, { role: 'assistant', content: answer, steps }] }));
    } catch (error) {
      if (error.name !== 'AbortError') setThreads((current) => ({ ...current, [mode]: [...history, { role: 'assistant', content: error.message, failed: true }] }));
    } finally {
      setBusy(false);
    }
  }

  function stop() { abortRef.current?.abort(); setBusy(false); }

  return <>
    {!open && <button type="button" className="assistant-fab" onClick={() => setOpen(true)} aria-label="Ouvrir l’assistant IA"><span aria-hidden="true">✦</span> Assistant IA</button>}
    {open && <section className="assistant-panel" role="dialog" aria-label="Assistant IA">
      <header>
        <div><strong>Assistant IA</strong><small>{clientCode ? `Dossier client ${clientCode} ouvert` : 'Connecté à votre base de données'}</small></div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Fermer">×</button>
      </header>
      <div className="assistant-tabs" role="tablist">
        {Object.entries(MODES).map(([key, item]) => <button key={key} type="button" role="tab" aria-selected={mode === key} className={mode === key ? 'is-active' : ''} onClick={() => setMode(key)}>{item.label}</button>)}
      </div>
      <div className="assistant-list" ref={listRef}>
        {messages.length === 0 && <div className="assistant-empty">
          <p>{MODES[mode].hint}</p>
          {MODES[mode].suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => send(suggestion)}>{suggestion}</button>)}
        </div>}
        {messages.map((message, index) => <div key={index} className={`assistant-message is-${message.role}${message.failed ? ' is-failed' : ''}`}>
          <div dir="auto">{message.content}</div>
          {message.role === 'assistant' && <Steps steps={message.steps} />}
        </div>)}
        {busy && <div className="assistant-message is-assistant is-busy" role="status">{mode === 'agent' ? 'L’agent travaille sur la tâche…' : 'Recherche dans la base…'}<i /><i /><i /></div>}
      </div>
      <form onSubmit={(event) => { event.preventDefault(); send(input); }}>
        <textarea rows={2} value={input} placeholder={MODES[mode].placeholder} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(input); } }} maxLength={4000} />
        {busy ? <button type="button" className="is-stop" onClick={stop}>Arrêter</button> : <button type="submit" disabled={!input.trim()}>{mode === 'agent' ? 'Lancer' : 'Envoyer'}</button>}
      </form>
      <small className="assistant-note">Lecture seule : l’assistant consulte la base mais ne modifie rien. Vérifiez les chiffres importants.</small>
    </section>}
  </>;
}
