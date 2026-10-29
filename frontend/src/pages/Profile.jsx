import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { api, send, initCsrf } from '../api.js';
import { fmt, add, initials, weekdays } from '../lib/format.js';
import { Field, ErrorBox } from '../components/ui.jsx';
import { useData } from '../hooks/useData.js';
export function Profile({ user, logout }) {
  const [plans, error] = useData(() => api('/me/work-schedules'), []),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  return (
    <div className="profile-grid">
      <section className="panel profile-card">
        <span className="avatar large">{initials(user.displayName)}</span>
        <h2>{user.displayName}</h2>
        <p>{user.email}</p>
        <span className="status-pill">
          {user.role === 'ADMIN' ? 'Administrator' : 'Mitarbeiter'}
        </span>
        <dl>
          <dt>Abteilung</dt>
          <dd>{user.department.name}</dd>
          <dt>Beschäftigt seit</dt>
          <dd>{fmt(user.employmentStart, { year: 'numeric' })}</dd>
          <dt>Beschäftigung bis</dt>
          <dd>
            {user.employmentEnd ? fmt(user.employmentEnd, { year: 'numeric' }) : 'Unbefristet'}
          </dd>
        </dl>
        <button
          className="button secondary"
          onClick={() => logout().catch((e) => setMessage(e.message))}
        >
          <LogOut size={16} />
          Abmelden
        </button>
      </section>
      <section className="panel profile-settings">
        <h2>Dein Arbeitsplan</h2>
        <ErrorBox error={error} />
        {plans?.map((p) => (
          <div className="schedule-summary" key={p.id}>
            <strong>
              Ab {fmt(p.validFrom, { year: 'numeric' })}
              {p.validTo ? ` bis ${fmt(add(p.validTo, -1), { year: 'numeric' })}` : ''}
            </strong>
            <div className="weekday-list">
              {weekdays.map((d, i) => (
                <span
                  className={p.days.find((x) => x.weekday === i + 1)?.isWorkday ? 'working' : ''}
                  key={d}
                >
                  {d}
                </span>
              ))}
            </div>
            <small>Feiertagskalender: {p.calendar.name}</small>
          </div>
        ))}
        <div className="section-divider" />
        <h2>Passwort ändern</h2>
        <p>Nach der Änderung meldest du dich erneut an.</p>
        <ErrorBox error={message} />
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const form = new FormData(e.currentTarget);
            try {
              await send('/auth/change-password', {
                oldPassword: form.get('oldPassword'),
                password: form.get('password'),
              });
              window.dispatchEvent(new Event('session-expired'));
              await initCsrf();
            } catch (e) {
              setMessage(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Bisheriges Passwort">
            <input name="oldPassword" type="password" autoComplete="current-password" required />
          </Field>
          <Field label="Neues Passwort (mindestens 12 Zeichen)">
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
          </Field>
          <button disabled={busy} className="button primary">
            Passwort speichern
          </button>
        </form>
      </section>
    </div>
  );
}
