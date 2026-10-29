import { useState } from 'react';
import { Plus, Building2, ArrowUpRight, CalendarDays, X, CheckCircle2 } from 'lucide-react';
import { api, allPages, send } from '../api.js';
import { now, add, fmt, days, initials, weekdays } from '../lib/format.js';
import { Loading, ErrorBox, Empty, Field, Modal } from '../components/ui.jsx';
import { useData } from '../hooks/useData.js';
export function AdminPage({ page, year, notify, revision, settings, refreshUser }) {
  const [modal, setModal] = useState(null),
    [search, setSearch] = useState(''),
    [error, setError] = useState('');
  const [data, loadError] = useData(async () => {
    if (page === 'audit') return { audit: await allPages('/admin/audit-logs') };
    const [users, departments, calendars] = await Promise.all([
      allPages('/admin/users'),
      api('/admin/departments'),
      api('/admin/holiday-calendars'),
    ]);
    return { users, departments, calendars };
  }, [page, revision]);
  const saved = (message) => {
    setModal(null);
    notify(message);
  };
  if (loadError) return <ErrorBox error={loadError} />;
  if (!data) return <Loading />;
  return (
    <>
      <ErrorBox error={error} />
      {page === 'users' && (
        <section className="panel">
          <header className="panel-heading">
            <div>
              <h2>
                Menschen im Team <span className="count-badge">{data.users.length}</span>
              </h2>
              <p>Zugänge, Arbeitspläne und Urlaubskonten verwalten.</p>
            </div>
            <button className="button primary" onClick={() => setModal({ type: 'user' })}>
              <Plus size={16} />
              Mitarbeiter anlegen
            </button>
          </header>
          <div className="table-filter">
            <input
              placeholder="Nach Name oder E-Mail suchen …"
              aria-label="Mitarbeiter suchen"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Mitarbeiter</th>
                  <th>Abteilung</th>
                  <th>Rolle / Status</th>
                  <th>Verwalten</th>
                </tr>
              </thead>
              <tbody>
                {data.users
                  .filter((u) =>
                    `${u.displayName} ${u.email}`.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="person-cell">
                          <span
                            className="avatar"
                            style={{
                              background: `${u.department.color}18`,
                              color: u.department.color,
                            }}
                          >
                            {initials(u.displayName)}
                          </span>
                          <div>
                            <strong>{u.displayName}</strong>
                            <small>{u.email}</small>
                          </div>
                        </div>
                      </td>
                      <td>{u.department.name}</td>
                      <td>
                        <span className={`status-pill ${!u.isActive ? 'cancelled' : ''}`}>
                          {!u.isActive ? 'Inaktiv' : u.role === 'ADMIN' ? 'Admin' : 'Mitarbeiter'}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button onClick={() => setModal({ type: 'user', user: u })}>
                            Bearbeiten
                          </button>
                          <button onClick={() => setModal({ type: 'balance', user: u })}>
                            Urlaubskonto
                          </button>
                          <button onClick={() => setModal({ type: 'schedule', user: u })}>
                            Arbeitsplan
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                const token = await send(
                                  `/admin/users/${u.id}/password-reset-token`,
                                  {},
                                );
                                setModal({ type: 'token', token, user: u });
                              } catch (e) {
                                setError(e.message);
                              }
                            }}
                          >
                            Zugangslink
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {page === 'departments' && (
        <>
          <div className="section-toolbar">
            <p>{data.departments.length} Abteilungen im Unternehmen</p>
            <button className="button primary" onClick={() => setModal({ type: 'department' })}>
              <Plus size={16} />
              Abteilung anlegen
            </button>
          </div>
          <div className="department-grid">
            {data.departments.map((d) => (
              <section key={d.id} className="panel department-card">
                <span
                  className="department-icon"
                  style={{ background: `${d.color}18`, color: d.color }}
                >
                  <Building2 size={24} />
                </span>
                <h2>{d.name}</h2>
                <p>
                  {d._count.users} Mitarbeiter {d.archived ? '· Archiviert' : ''}
                </p>
                <button
                  className="text-button"
                  onClick={() => setModal({ type: 'department', department: d })}
                >
                  Abteilung bearbeiten
                  <ArrowUpRight size={17} />
                </button>
              </section>
            ))}
          </div>
        </>
      )}
      {page === 'holidays' && (
        <>
          <div className="notice">
            <CalendarDays size={20} />
            Ein bestätigter Feiertagskalender ist Voraussetzung für Buchungen. Prüfe die Feiertage
            für jeden Standort und jedes Jahr.
          </div>
          <div className="section-toolbar">
            <h2>Standortkalender</h2>
            <button className="button secondary" onClick={() => setModal({ type: 'calendar' })}>
              <Plus size={16} />
              Standort anlegen
            </button>
          </div>
          {data.calendars.map((c) => (
            <section className="panel holiday-card" key={c.id}>
              <header className="panel-heading">
                <div>
                  <h2>{c.name}</h2>
                  <p>
                    {c.code} · {c.timezone}
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => setModal({ type: 'holidays', calendar: c, year })}
                >
                  <Plus size={16} />
                  Jahr einrichten
                </button>
              </header>
              {c.years.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Jahr</th>
                        <th>Feiertage</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {c.years.map((y) => (
                        <tr key={y.id}>
                          <td>
                            <strong>{y.year}</strong>
                          </td>
                          <td>{y.holidays.length} Einträge</td>
                          <td>
                            <span
                              className={`status-pill ${y.state !== 'READY' ? 'cancelled' : ''}`}
                            >
                              {y.state === 'READY' ? 'Bestätigt' : 'Entwurf'}
                            </span>
                          </td>
                          <td>
                            <button
                              className="text-button"
                              onClick={() =>
                                setModal({ type: 'holidays', calendar: c, year: y.year })
                              }
                            >
                              Bearbeiten
                              <ArrowUpRight size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty>Noch keine Jahre eingerichtet.</Empty>
              )}
            </section>
          ))}
        </>
      )}
      {page === 'settings' && (
        <SettingsForm
          settings={settings}
          onSaved={async () => {
            await refreshUser();
            notify('Einstellungen gespeichert.');
          }}
        />
      )}
      {page === 'audit' && (
        <section className="panel">
          <header className="panel-heading">
            <div>
              <h2>Nachvollziehbar geplant.</h2>
              <p>Änderungen an Urlaub, Konten und Verwaltung.</p>
            </div>
            <span className="count-badge">{data.audit.length} Einträge</span>
          </header>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Zeitpunkt</th>
                  <th>Geändert von</th>
                  <th>Aktion</th>
                  <th>Bereich</th>
                  <th>Begründung</th>
                </tr>
              </thead>
              <tbody>
                {data.audit.map((a) => (
                  <tr key={a.id}>
                    <td>{new Date(a.createdAt).toLocaleString('de-DE')}</td>
                    <td>
                      {a.actorName}
                      {a.subjectName && <small>Für {a.subjectName}</small>}
                    </td>
                    <td>
                      {{
                        VACATION_BOOKED: 'Urlaub gebucht',
                        VACATION_UPDATED: 'Urlaub geändert',
                        VACATION_CANCELLED: 'Urlaub storniert',
                        VACATION_RECALCULATED: 'Urlaub neu berechnet',
                        USER_CREATED: 'Mitarbeiter angelegt',
                        USER_UPDATED: 'Mitarbeiter geändert',
                        PASSWORD_SET: 'Passwort gesetzt',
                        PASSWORD_CHANGED: 'Passwort geändert',
                        RESET_TOKEN_CREATED: 'Zugangslink erstellt',
                        ACTIVATE_TOKEN_CREATED: 'Aktivierungslink erstellt',
                        BALANCE_CREATED: 'Jahreskonto angelegt',
                        BALANCE_ADJUSTED: 'Guthaben korrigiert',
                        BALANCE_CLOSED: 'Jahr abgeschlossen',
                        DEPARTMENT_CHANGED: 'Abteilung geändert',
                        HOLIDAYS_CHANGED: 'Feiertage geändert',
                        SCHEDULE_CHANGED: 'Arbeitsplan geändert',
                        SETTINGS_UPDATED: 'Einstellungen geändert',
                        CALENDAR_CREATED: 'Standort angelegt',
                        SESSIONS_REVOKED: 'Sitzungen beendet',
                        ADMIN_BOOTSTRAPPED: 'Administrator angelegt',
                      }[a.action] || a.action}
                    </td>
                    <td>
                      {{
                        vacation: 'Urlaub',
                        user: 'Mitarbeiter',
                        balance: 'Urlaubskonto',
                        department: 'Abteilung',
                        holiday_year: 'Feiertage',
                        holiday_calendar: 'Standort',
                        settings: 'Einstellungen',
                      }[a.entityType] || a.entityType}
                    </td>
                    <td>{a.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.audit.length && <Empty>Noch keine Änderungen protokolliert.</Empty>}
        </section>
      )}
      {modal?.type === 'user' && (
        <UserModal
          existing={modal.user}
          data={data}
          year={year}
          settings={settings}
          onClose={() => setModal(null)}
          onSaved={saved}
        />
      )}
      {modal?.type === 'department' && (
        <DepartmentModal
          existing={modal.department}
          onClose={() => setModal(null)}
          onSaved={saved}
        />
      )}
      {modal?.type === 'balance' && (
        <BalanceModal
          user={modal.user}
          initialYear={year}
          onClose={() => setModal(null)}
          onSaved={notify}
        />
      )}
      {modal?.type === 'schedule' && (
        <ScheduleModal
          user={modal.user}
          calendars={data.calendars}
          onClose={() => setModal(null)}
          onSaved={saved}
        />
      )}
      {modal?.type === 'holidays' && (
        <HolidaysModal
          calendar={modal.calendar}
          initialYear={modal.year}
          onClose={() => setModal(null)}
          onSaved={saved}
        />
      )}
      {modal?.type === 'calendar' && (
        <SimpleFormModal
          title="Standortkalender anlegen"
          onClose={() => setModal(null)}
          onSubmit={async (body) => {
            await send('/admin/holiday-calendars', body);
            saved('Standortkalender angelegt.');
          }}
          fields={[
            ['name', 'Name', 'text'],
            ['code', 'Standortkürzel', 'text'],
          ]}
        />
      )}
      {modal?.type === 'token' && (
        <Modal title={`Zugang für ${modal.user.displayName}`} onClose={() => setModal(null)}>
          <div className="modal-content">
            <div className="notice">
              Dieser Link wird nur jetzt angezeigt. Übermittle ihn persönlich über einen internen
              Kanal. Gültigkeit: eine Stunde.
            </div>
            <Field label="Persönlicher Zugangslink">
              <input readOnly value={modal.token.url} onFocus={(e) => e.target.select()} />
            </Field>
            <button
              className="button primary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(modal.token.url);
                  notify('Link kopiert.');
                } catch {
                  setError('Bitte den Link markieren und manuell kopieren.');
                }
              }}
            >
              Link kopieren
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function SimpleFormModal({ title, fields, onSubmit, onClose }) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="modal-content"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await onSubmit(Object.fromEntries(new FormData(e.currentTarget)));
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <ErrorBox error={error} />
        {fields.map(([name, label, type]) => (
          <Field key={name} label={label}>
            <input name={name} type={type} required />
          </Field>
        ))}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button className="button primary" disabled={busy}>
            Speichern
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DepartmentModal({ existing, onClose, onSaved }) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <Modal title={existing ? 'Abteilung bearbeiten' : 'Abteilung anlegen'} onClose={onClose}>
      <form
        className="modal-content"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          try {
            await send(
              `/admin/departments${existing ? `/${existing.id}` : ''}`,
              { name: f.get('name'), color: f.get('color'), archived: f.get('archived') === 'on' },
              existing ? 'PATCH' : 'POST',
            );
            onSaved('Abteilung gespeichert.');
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <ErrorBox error={error} />
        <Field label="Name">
          <input name="name" required minLength={2} defaultValue={existing?.name} />
        </Field>
        <Field label="Kalenderfarbe">
          <input name="color" type="color" defaultValue={existing?.color || '#0d9488'} />
        </Field>
        {existing && (
          <label className="checkbox-row">
            <input type="checkbox" name="archived" defaultChecked={existing.archived} />
            Abteilung archivieren (nur ohne aktive Mitarbeiter)
          </label>
        )}
        <div className="modal-actions">
          <button className="button primary" disabled={busy}>
            Speichern
          </button>
        </div>
      </form>
    </Modal>
  );
}

function WorkdaySelector({ value, onChange }) {
  return (
    <div className="weekday-picker">
      {weekdays.map((d, i) => (
        <label key={d} className={value.includes(i + 1) ? 'checked' : ''}>
          <input
            type="checkbox"
            checked={value.includes(i + 1)}
            onChange={() =>
              onChange(value.includes(i + 1) ? value.filter((v) => v !== i + 1) : [...value, i + 1])
            }
          />
          {d}
        </label>
      ))}
    </div>
  );
}

function UserModal({ existing, data, year, settings, onClose, onSaved }) {
  const [workdays, setWorkdays] = useState([1, 2, 3, 4, 5]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={existing ? 'Mitarbeiter bearbeiten' : 'Willkommen im Team.'}
      subtitle={
        existing
          ? 'Änderungen beenden aus Sicherheitsgründen bestehende Sitzungen.'
          : 'Nach der Anlage erzeugst du einen persönlichen Zugangslink.'
      }
      onClose={onClose}
    >
      <form
        className="modal-content"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError('');
          try {
            const body = {
              displayName: f.get('displayName'),
              email: f.get('email'),
              role: f.get('role'),
              departmentId: f.get('departmentId'),
              employmentStart: f.get('employmentStart'),
              employmentEnd: f.get('employmentEnd') || null,
            };
            if (existing)
              Object.assign(body, {
                version: existing.version,
                isActive: f.get('isActive') === 'on',
                reason: f.get('reason'),
              });
            else
              Object.assign(body, {
                calendarId: f.get('calendarId'),
                workdays,
                allowanceUnits: Number(f.get('allowance')) * 2,
                year: Number(f.get('year')),
              });
            await send(
              `/admin/users${existing ? `/${existing.id}` : ''}`,
              body,
              existing ? 'PATCH' : 'POST',
            );
            onSaved(
              existing
                ? 'Mitarbeiter gespeichert.'
                : 'Mitarbeiter angelegt. Erstelle jetzt einen Zugangslink.',
            );
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <ErrorBox error={error} />
        <Field label="Vollständiger Name">
          <input name="displayName" defaultValue={existing?.displayName} required minLength={2} />
        </Field>
        <Field label="E-Mail-Adresse">
          <input name="email" type="email" defaultValue={existing?.email} required />
        </Field>
        <div className="form-grid">
          <Field label="Abteilung">
            <select name="departmentId" defaultValue={existing?.departmentId} required>
              {data.departments
                .filter((d) => !d.archived || d.id === existing?.departmentId)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Rolle">
            <select name="role" defaultValue={existing?.role || 'EMPLOYEE'}>
              <option value="EMPLOYEE">Mitarbeiter</option>
              <option value="ADMIN">Administrator</option>
            </select>
          </Field>
          <Field label="Beschäftigt seit">
            <input
              name="employmentStart"
              type="date"
              defaultValue={existing?.employmentStart || now()}
              required
            />
          </Field>
          <Field label="Beschäftigt bis (optional)">
            <input name="employmentEnd" type="date" defaultValue={existing?.employmentEnd || ''} />
          </Field>
        </div>
        {existing ? (
          <>
            <label className="checkbox-row">
              <input name="isActive" type="checkbox" defaultChecked={existing.isActive} />
              Zugang aktiv
            </label>
            <Field label="Begründung der Änderung">
              <input name="reason" required minLength={3} />
            </Field>
          </>
        ) : (
          <>
            <Field label="Feiertagskalender">
              <select name="calendarId" required>
                {data.calendars.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Regelmäßige Arbeitstage">
              <WorkdaySelector value={workdays} onChange={setWorkdays} />
            </Field>
            <div className="form-grid">
              <Field label="Urlaubskonto für Jahr">
                <input
                  type="number"
                  name="year"
                  min={1900}
                  max={9999}
                  defaultValue={year}
                  required
                />
              </Field>
              <Field label="Jahresanspruch in Tagen">
                <input
                  type="number"
                  name="allowance"
                  min={0}
                  max={366}
                  step={0.5}
                  defaultValue={settings.defaultAllowanceUnits / 2}
                  required
                />
              </Field>
            </div>
          </>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button className="button primary" disabled={busy}>
            Mitarbeiter speichern
          </button>
        </div>
      </form>
    </Modal>
  );
}

function BalanceModal({ user, initialYear, onClose, onSaved }) {
  const [year, setYear] = useState(initialYear),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [closePreview, setClosePreview] = useState(null);
  const [balance, loadError] = useData(
    () => api(`/admin/users/${user.id}/balances?year=${year}`),
    [year, revision],
  );
  const saved = (message) => {
    setRevision((r) => r + 1);
    setClosePreview(null);
    onSaved(message);
  };
  return (
    <Modal title={`Urlaubskonto · ${user.displayName}`} wide onClose={onClose}>
      <div className="modal-content">
        <Field label="Kontojahr">
          <input
            type="number"
            min={1900}
            max={9999}
            value={year}
            onChange={(e) => {
              setYear(Number(e.target.value));
              setClosePreview(null);
            }}
          />
        </Field>
        <ErrorBox error={error || loadError} />
        {!balance ? (
          <Loading />
        ) : balance.missing ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              try {
                await send(`/admin/users/${user.id}/balances`, {
                  year,
                  allowanceUnits: Number(f.get('allowance')) * 2,
                  reason: f.get('reason'),
                });
                saved('Jahreskonto angelegt.');
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="notice">Für {year} wurde noch kein Konto angelegt.</div>
            <Field label="Anspruch in Tagen">
              <input
                name="allowance"
                type="number"
                min={0}
                max={366}
                step={0.5}
                defaultValue={30}
                required
              />
            </Field>
            <Field label="Begründung">
              <input
                name="reason"
                required
                minLength={3}
                defaultValue="Jahresanspruch festgelegt"
              />
            </Field>
            <button className="button primary" disabled={busy}>
              Jahreskonto anlegen
            </button>
          </form>
        ) : (
          <>
            <div className="balance-summary">
              <div>
                <small>Anspruch</small>
                <strong>{days(balance.annualUnits)} Tage</strong>
              </div>
              <div>
                <small>Gebucht</small>
                <strong>{days(balance.bookedUnits)} Tage</strong>
              </div>
              <div>
                <small>Verbleibend</small>
                <strong>{days(balance.remainingUnits)} Tage</strong>
              </div>
            </div>
            <span className="status-pill">
              {balance.state === 'OPEN' ? 'Offenes Konto' : 'Abgeschlossen'}
            </span>
            {balance.state === 'OPEN' && (
              <>
                <div className="section-divider" />
                <h3>Guthaben korrigieren</h3>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    setBusy(true);
                    setError('');
                    try {
                      await send(`/admin/balances/${balance.id}/adjustments`, {
                        units: Number(f.get('units')) * 2,
                        validFrom: f.get('validFrom'),
                        expiresOn: f.get('expiresOn') || null,
                        reason: f.get('reason'),
                        version: balance.version,
                      });
                      saved('Kontokorrektur gespeichert.');
                    } catch (e) {
                      setError(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <div className="form-grid">
                    <Field label="Korrektur in Tagen (+/−)">
                      <input
                        name="units"
                        type="number"
                        min={-366}
                        max={366}
                        step={0.5}
                        defaultValue={1}
                        required
                      />
                    </Field>
                    <Field label="Gültig ab">
                      <input
                        name="validFrom"
                        type="date"
                        defaultValue={`${year}-01-01`}
                        min={`${year}-01-01`}
                        max={`${year}-12-31`}
                        required
                      />
                    </Field>
                    <Field label="Ablaufdatum (optional)">
                      <input
                        name="expiresOn"
                        type="date"
                        min={`${year}-01-01`}
                        max={`${year}-12-31`}
                      />
                    </Field>
                    <Field label="Begründung">
                      <input name="reason" minLength={3} required />
                    </Field>
                  </div>
                  <button className="button secondary" disabled={busy}>
                    Korrektur speichern
                  </button>
                </form>
                <div className="section-divider" />
                <h3>Jahresabschluss & Übertrag</h3>
                <p>
                  Erst nach Jahresende möglich. Ein abgeschlossenes Konto kann nicht erneut geöffnet
                  werden.
                </p>
                <form
                  onChange={() => setClosePreview(null)}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    const body = {
                      version: balance.version,
                      carryover: f.get('carryover') === 'on',
                      expiresOn: f.get('expiresOn') || null,
                      reason: f.get('reason'),
                    };
                    setBusy(true);
                    setError('');
                    try {
                      if (!closePreview)
                        setClosePreview(
                          await send(`/admin/balances/${balance.id}/close-preview`, body),
                        );
                      else {
                        await send(`/admin/balances/${balance.id}/close`, body);
                        saved('Kontojahr abgeschlossen.');
                      }
                    } catch (e) {
                      setError(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label className="checkbox-row">
                    <input name="carryover" type="checkbox" />
                    Unverbrauchte, übertragbare Tage ins Folgejahr übertragen
                  </label>
                  <Field label="Übertrag gültig bis (optional)">
                    <input
                      name="expiresOn"
                      type="date"
                      min={`${year + 1}-01-01`}
                      max={`${year + 1}-12-31`}
                    />
                  </Field>
                  <Field label="Begründung">
                    <input name="reason" required minLength={3} />
                  </Field>
                  {closePreview && (
                    <div className="notice">
                      Rest: {days(closePreview.remainingUnits)} Tage · Übertragbar:{' '}
                      {days(closePreview.carryoverUnits)} Tage
                    </div>
                  )}
                  <button className="button primary" disabled={busy}>
                    {closePreview ? 'Jahr verbindlich abschließen' : 'Abschluss prüfen'}
                  </button>
                </form>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function ImpactPreview({ preview }) {
  return (
    preview && (
      <div className="impact-preview">
        <h3>
          <CheckCircle2 size={18} />
          Änderung geprüft
        </h3>
        {preview.impacts.length ? (
          preview.impacts.map((i) => (
            <p key={i.id}>
              {i.displayName} · {fmt(i.startDate)}: {days(i.beforeUnits)} → {days(i.afterUnits)}{' '}
              Tage
            </p>
          ))
        ) : (
          <p>Keine bestehenden Zukunftsbuchungen betroffen.</p>
        )}
        <small>Beim Speichern werden alle betroffenen Buchungen gemeinsam neu berechnet.</small>
      </div>
    )
  );
}

function ScheduleModal({ user, calendars, onClose, onSaved }) {
  const [workdays, setWorkdays] = useState([1, 2, 3, 4, 5]),
    [error, setError] = useState(''),
    [preview, setPreview] = useState(null),
    [busy, setBusy] = useState(false);
  const [plans, loadError] = useData(() => api(`/admin/users/${user.id}/work-schedules`), []);
  return (
    <Modal title={`Arbeitsplan · ${user.displayName}`} onClose={onClose}>
      <form
        className="modal-content"
        onChange={() => setPreview(null)}
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const body = {
            validFrom: f.get('validFrom'),
            validTo: f.get('validTo') || null,
            calendarId: f.get('calendarId'),
            workdays,
            reason: f.get('reason'),
          };
          setBusy(true);
          setError('');
          try {
            if (!preview)
              setPreview(await send(`/admin/users/${user.id}/work-schedules/preview`, body));
            else {
              await send(`/admin/users/${user.id}/work-schedules`, {
                ...body,
                previewHash: preview.previewHash,
              });
              onSaved('Arbeitsplan gespeichert und Urlaub neu berechnet.');
            }
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <ErrorBox error={error || loadError} />
        {plans?.map((p) => (
          <div className="schedule-summary" key={p.id}>
            <strong>Ab {fmt(p.validFrom, { year: 'numeric' })}</strong>
            <p>
              {p.days
                .filter((d) => d.isWorkday)
                .map((d) => weekdays[d.weekday - 1])
                .join(', ')}{' '}
              · {p.calendar.name}
              {p.validTo ? ` · bis ${fmt(add(p.validTo, -1))}` : ''}
            </p>
          </div>
        ))}
        <h3>Neuen Plan hinzufügen</h3>
        <div className="form-grid">
          <Field label="Gültig ab">
            <input type="date" name="validFrom" defaultValue={add(now(), 1)} required />
          </Field>
          <Field label="Gültig bis (exklusiv, optional)">
            <input type="date" name="validTo" />
          </Field>
        </div>
        <Field label="Feiertagskalender">
          <select name="calendarId" required>
            {calendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Arbeitstage">
          <WorkdaySelector
            value={workdays}
            onChange={(v) => {
              setWorkdays(v);
              setPreview(null);
            }}
          />
        </Field>
        <Field label="Begründung">
          <input name="reason" required minLength={3} />
        </Field>
        <ImpactPreview preview={preview} />
        <div className="modal-actions">
          <button className="button primary" disabled={busy}>
            {preview ? 'Änderung verbindlich speichern' : 'Auswirkungen prüfen'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function HolidaysModal({ calendar, initialYear, onClose, onSaved }) {
  const [year, setYear] = useState(initialYear),
    [rows, setRows] = useState(
      calendar.years
        .find((y) => y.year === initialYear)
        ?.holidays.map(({ date, name, blockedSlots }) => ({ date, name, blockedSlots })) || [],
    ),
    [reason, setReason] = useState('Feiertage geprüft und bestätigt'),
    [error, setError] = useState(''),
    [preview, setPreview] = useState(null),
    [busy, setBusy] = useState(false);
  const update = (i, key, value) => {
    setRows((r) => r.map((v, n) => (n === i ? { ...v, [key]: value } : v)));
    setPreview(null);
  };
  const body = () => ({
    version: calendar.years.find((y) => y.year === year)?.version,
    holidays: rows,
    reason,
  });
  return (
    <Modal
      title={`Feiertage · ${calendar.name}`}
      subtitle="Mit dem Speichern bestätigst du die Vollständigkeit für diesen Standort."
      onClose={onClose}
      wide
    >
      <form
        className="modal-content"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            if (!preview)
              setPreview(
                await send(`/admin/holiday-calendars/${calendar.id}/years/${year}/preview`, body()),
              );
            else {
              await send(
                `/admin/holiday-calendars/${calendar.id}/years/${year}`,
                { ...body(), previewHash: preview.previewHash },
                'PUT',
              );
              onSaved('Feiertage bestätigt und Buchungen aktualisiert.');
            }
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <ErrorBox error={error} />
        <Field label="Jahr">
          <input
            type="number"
            min={1900}
            max={9999}
            value={year}
            onChange={(e) => {
              const y = Number(e.target.value);
              setYear(y);
              setRows(
                calendar.years
                  .find((v) => v.year === y)
                  ?.holidays.map(({ date, name, blockedSlots }) => ({
                    date,
                    name,
                    blockedSlots,
                  })) || [],
              );
              setPreview(null);
            }}
          />
        </Field>
        <div className="holiday-rows">
          {rows.map((r, i) => (
            <div className="holiday-row" key={i}>
              <input
                aria-label={`Datum Feiertag ${i + 1}`}
                type="date"
                value={r.date}
                min={`${year}-01-01`}
                max={`${year}-12-31`}
                required
                onChange={(e) => update(i, 'date', e.target.value)}
              />
              <input
                aria-label={`Name Feiertag ${i + 1}`}
                value={r.name}
                required
                placeholder="Name des Feiertags"
                onChange={(e) => update(i, 'name', e.target.value)}
              />
              <select
                aria-label={`Tagesabschnitt Feiertag ${i + 1}`}
                value={r.blockedSlots}
                onChange={(e) => update(i, 'blockedSlots', e.target.value)}
              >
                <option value="FULL">Ganztägig</option>
                <option value="AM">Vormittag</option>
                <option value="PM">Nachmittag</option>
              </select>
              <button
                type="button"
                className="icon-button"
                aria-label="Feiertag entfernen"
                onClick={() => {
                  setRows(rows.filter((_, n) => n !== i));
                  setPreview(null);
                }}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
        {!rows.length && (
          <div className="notice">
            Keine Feiertage eingetragen. Bestätige ein leeres Jahr nur, wenn für diesen Standort
            tatsächlich keine Feiertage gelten.
          </div>
        )}
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            setRows([...rows, { date: `${year}-01-01`, name: '', blockedSlots: 'FULL' }]);
            setPreview(null);
          }}
        >
          <Plus size={16} />
          Feiertag hinzufügen
        </button>
        <Field label="Begründung">
          <input
            value={reason}
            required
            minLength={3}
            onChange={(e) => {
              setReason(e.target.value);
              setPreview(null);
            }}
          />
        </Field>
        <ImpactPreview preview={preview} />
        <div className="modal-actions">
          <button className="button primary" disabled={busy}>
            {preview
              ? 'Vollständigkeit bestätigen & speichern'
              : 'Feiertage und Auswirkungen prüfen'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SettingsForm({ settings, onSaved }) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <section className="panel settings-panel">
      <h2>Ein guter Rahmen für dein Team.</h2>
      <p>
        Die Regeln für direkte Buchung und Abteilungssichtbarkeit gelten für das ganze Unternehmen.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const f = new FormData(e.currentTarget);
          try {
            await send(
              '/admin/settings',
              {
                companyName: f.get('companyName'),
                defaultAllowanceUnits: Number(f.get('allowance')) * 2,
                maxBookingDays: Number(f.get('maxBookingDays')),
              },
              'PATCH',
            );
            await onSaved();
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <ErrorBox error={error} />
        <Field label="Unternehmensname">
          <input name="companyName" defaultValue={settings.companyName} minLength={2} required />
        </Field>
        <Field
          label="Standard-Jahresanspruch in Tagen"
          hint="Vorschlag für neue Mitarbeiter; bestehende Konten werden nicht verändert."
        >
          <input
            name="allowance"
            type="number"
            min={0}
            max={366}
            step={0.5}
            defaultValue={settings.defaultAllowanceUnits / 2}
            required
          />
        </Field>
        <Field label="Maximale Kalendertage pro Buchung">
          <input
            name="maxBookingDays"
            type="number"
            min={1}
            max={366}
            defaultValue={settings.maxBookingDays}
            required
          />
        </Field>
        <div className="fixed-settings">
          <div>
            <span>Buchung</span>
            <strong>Automatisch, ohne Freigabe</strong>
          </div>
          <div>
            <span>Kalendersichtbarkeit</span>
            <strong>Eigene Abteilung · Admin sieht alle</strong>
          </div>
          <div>
            <span>Zeitzone</span>
            <strong>{settings.timezone}</strong>
          </div>
        </div>
        <button className="button primary" disabled={busy}>
          Einstellungen speichern
        </button>
      </form>
    </section>
  );
}
