import { useState } from 'react';
import { api } from '../api.js';
import { useData } from '../hooks/useData.js';
import { Modal, Field, ErrorBox } from './ui.jsx';
const repository = 'o0shojo0o/urlaubsplaner';
const issueUrl = `https://github.com/${repository}/issues/new`;
export function FeedbackModal({ onClose, page, year }) {
  const [server, serverError] = useData(() => api('/system-info'), []);
  const [environmentOverride, setEnvironmentOverride] = useState(null);
  const environment =
    environmentOverride ??
    [
      `App-Version (Frontend): ${import.meta.env.VITE_APP_VERSION || 'unbekannt'}`,
      `Frontend-Revision: ${import.meta.env.VITE_APP_REVISION || 'unbekannt'}`,
      `Server-Version: ${server?.appVersion || 'nicht verfügbar'}`,
      `Server-Revision: ${server?.revision || 'nicht verfügbar'}`,
      `Betriebsart: ${server?.deployment || 'nicht verfügbar'}`,
      `Server-Laufzeit: ${server?.runtime || 'nicht verfügbar'}`,
      `Server-System: ${server?.platform || 'nicht verfügbar'}`,
      `Browser: ${navigator.userAgent}`,
      `Sprache: ${navigator.language}`,
      `Zeitzone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
      `Fenstergröße: ${window.innerWidth} × ${window.innerHeight}`,
      `Ansicht: ${page || 'unbekannt'} / Jahr ${year || 'unbekannt'}`,
    ].join('\n');
  const [type, setType] = useState('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const issueTitle = `[${type === 'bug' ? 'Fehler' : 'Idee'}] ${title.trim()}`;
  const issueBody = `## ${type === 'bug' ? 'Fehlermeldung' : 'Verbesserungsidee'}\n\n${description.trim()}\n\n## Systeminformationen\n\n${environment.trim()}\n\n---\nÜber das Feedbackformular im Urlaubsplaner vorbereitet.`;
  const tooLong =
    `${issueUrl}?${new URLSearchParams({ title: issueTitle, body: issueBody })}`.length > 8000;
  return (
    <Modal
      title="Fehler oder Idee melden"
      subtitle="Erstelle die Meldung mit deinem eigenen GitHub-Konto."
      onClose={onClose}
    >
      <form
        className="modal-content"
        onSubmit={(event) => {
          event.preventDefault();
          if (tooLong || title.trim().length < 5 || description.trim().length < 10) return;
          window.open(
            `${issueUrl}?${new URLSearchParams({ title: issueTitle, body: issueBody })}`,
            '_blank',
            'noopener,noreferrer',
          );
        }}
      >
        <Field label="Art der Meldung">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="bug">Fehler</option>
            <option value="idea">Idee</option>
          </select>
        </Field>
        <Field label="Titel">
          <input
            required
            minLength={5}
            maxLength={150}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field
          label="Beschreibung"
          hint={
            type === 'bug'
              ? 'Was hast du gemacht, was ist passiert und was hast du erwartet?'
              : 'Was wünschst du dir und wie würde es helfen?'
          }
        >
          <textarea
            aria-label="Beschreibung"
            rows={6}
            required
            minLength={10}
            maxLength={3000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field
          label="Systeminformationen"
          hint="Automatisch vorausgefüllt. Du kannst Angaben vor der Weitergabe ändern oder entfernen."
        >
          <textarea
            aria-label="Systeminformationen"
            rows={8}
            maxLength={4000}
            value={environment}
            onChange={(e) => setEnvironmentOverride(e.target.value)}
          />
        </Field>
        {serverError && (
          <p className="feedback-disclosure">
            Serverinformationen konnten nicht geladen werden. Du kannst sie manuell ergänzen.
          </p>
        )}
        <ErrorBox
          error={
            tooLong
              ? 'Bitte kürze die Beschreibung etwas, damit sie an GitHub übergeben werden kann.'
              : ''
          }
        />
        <p className="feedback-disclosure">
          „Auf GitHub weiter“ öffnet deinen Entwurf in{' '}
          <a href={`https://github.com/${repository}/issues`} target="_blank" rel="noreferrer">
            {repository}
          </a>
          . Dort meldest du dich bei Bedarf an und erstellst das Issue mit deinem eigenen
          GitHub-Konto. Titel, Beschreibung und die angezeigten Systeminformationen werden an GitHub
          übergeben. Bitte keine persönlichen Urlaubsdaten eintragen.
        </p>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="submit"
            className="button primary"
            disabled={tooLong || title.trim().length < 5 || description.trim().length < 10}
          >
            Auf GitHub weiter
          </button>
        </div>
      </form>
    </Modal>
  );
}
