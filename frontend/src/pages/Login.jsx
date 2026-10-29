import { useState } from 'react';
import { Leaf, Sun, CheckCircle2, ArrowRight, ShieldCheck } from 'lucide-react';
import { initCsrf, send } from '../api.js';
import { Field, ErrorBox } from '../components/ui.jsx';
export function Login({ setup, onLogin, error: externalError, activation, onActivated }) {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  return (
    <main className="login-shell">
      <section className="login-art">
        <a href="#" className="brand light">
          <span className="brand-mark">
            <Leaf />
          </span>
          Urlaubsplaner
        </a>
        <div className="login-art-copy">
          <span className="pill">WENIGER ORGANISIEREN. MEHR ERHOLEN.</span>
          <h1>
            Deine nächste
            <br />
            Auszeit beginnt
            <br />
            <em>mit einem Klick.</em>
          </h1>
          <p>Urlaub planen, im Team abstimmen und mit einem guten Gefühl abschalten.</p>
          <div className="login-sun">
            <Sun size={90} strokeWidth={1} />
          </div>
        </div>
        <small>Raum für das, was dir guttut.</small>
      </section>
      <section className="login-form">
        <div className="mobile-brand brand">
          <Leaf /> Urlaubsplaner
        </div>
        <div className="login-card">
          <p className="eyebrow">DEIN TEAM. DEINE AUSZEIT.</p>
          <h1>
            {setup
              ? 'Willkommen! Richte deinen Zugang ein.'
              : activation
                ? 'Dein Zugang'
                : 'Schön, dass du da bist.'}
          </h1>
          <p>
            {setup
              ? 'Erstelle den ersten Administrator. Danach kannst du dein Team einrichten.'
              : activation
                ? 'Lege dein persönliches Passwort fest.'
                : 'Melde dich an und plane deinen nächsten Urlaub.'}
          </p>
          <ErrorBox error={error || externalError} />
          {done ? (
            <div className="success-box">
              <CheckCircle2 />
              Passwort gespeichert.
              <button className="button primary" onClick={onActivated}>
                Zur Anmeldung <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError('');
                try {
                  await initCsrf();
                  if (activation) {
                    await send('/auth/activate', { token: activation, password });
                    setDone(true);
                  } else {
                    await send(
                      setup ? '/auth/setup' : '/auth/login',
                      setup ? { displayName, email, password } : { email, password },
                    );
                    await onLogin();
                  }
                } catch (e) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {setup && (
                <Field label="Dein Name">
                  <input
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={100}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </Field>
              )}
              {!activation && (
                <Field label="E-Mail-Adresse">
                  <input
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@unternehmen.de"
                  />
                </Field>
              )}
              <Field
                label="Passwort"
                hint={
                  activation || setup
                    ? 'Mindestens 12 Zeichen. Eine lange Passphrase ist ideal.'
                    : undefined
                }
              >
                <input
                  type="password"
                  autoComplete={activation || setup ? 'new-password' : 'current-password'}
                  minLength={activation || setup ? 12 : 1}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <button disabled={busy} className="button primary login-submit">
                {busy
                  ? 'Einen Moment …'
                  : setup
                    ? 'Administrator anlegen'
                    : activation
                      ? 'Passwort speichern'
                      : 'Anmelden'}
                <ArrowRight size={18} />
              </button>
            </form>
          )}
          <p className="login-help">
            <ShieldCheck size={16} />
            {setup
              ? 'Dieser Schritt ist nur bei der ersten Einrichtung verfügbar.'
              : 'Dein Zugang wird von deinem Unternehmen verwaltet.'}
            <br />
            {!setup && 'Bei Loginproblemen hilft dein Administrator.'}
          </p>
        </div>
      </section>
    </main>
  );
}
