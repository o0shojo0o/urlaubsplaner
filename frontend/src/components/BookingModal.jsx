import { useEffect, useRef, useState } from 'react';
import { Sun, CheckCircle2, ArrowRight } from 'lucide-react';
import { api, allPages, send } from '../api.js';
import { now, days } from '../lib/format.js';
import { Modal, Field, ErrorBox, Loading } from './ui.jsx';
export function BookingModal({ initial, user, onClose, onSaved }) {
  const [form, setForm] = useState({
      startDate: initial.startDate || now(),
      endDate: initial.endDate || now(),
      startPart: 'FULL',
      endPart: 'FULL',
      privateNote: '',
      reason: '',
    }),
    [old, setOld] = useState(null),
    [loading, setLoading] = useState(Boolean(initial.id)),
    [error, setError] = useState(''),
    [preview, setPreview] = useState(null),
    [busy, setBusy] = useState(false),
    [users, setUsers] = useState([]);
  const requestKey = useRef(crypto.randomUUID());
  useEffect(() => {
    if (initial.id)
      api(`/vacations/${initial.id}`)
        .then((v) => {
          setOld(v);
          setForm({
            startDate: v.startDate,
            endDate: v.endDate,
            startPart: v.startPart,
            endPart: v.endPart,
            privateNote: v.privateNote,
            reason: '',
            ...(user.role === 'ADMIN' ? { userId: v.userId } : {}),
          });
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    if (user.role === 'ADMIN')
      allPages('/admin/users')
        .then(setUsers)
        .catch((e) => setError(e.message));
  }, []);
  const update = (key, value) => {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === 'startDate' && next.endDate < value) next.endDate = value;
      if (next.startDate === next.endDate && ['startPart', 'endPart'].includes(key))
        next.startPart = next.endPart = value;
      return next;
    });
    setPreview(null);
    setError('');
    requestKey.current = crypto.randomUUID();
  };
  const payload = () => ({
    ...form,
    ...(form.reason ? {} : { reason: undefined }),
    ...(form.userId ? {} : { userId: undefined }),
  });
  const cancelled = old?.status === 'CANCELLED';
  return (
    <Modal
      title={initial.id ? 'Deine Urlaubsbuchung' : 'Zeit für eine Auszeit.'}
      subtitle="Dein Urlaub wird direkt verbindlich gebucht – ohne Freigabe."
      onClose={onClose}
    >
      {loading ? (
        <Loading />
      ) : (
        <form
          className="modal-content"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              if (!preview)
                setPreview(
                  await send('/vacations/preview', {
                    ...payload(),
                    ...(old ? { vacationId: old.id } : {}),
                  }),
                );
              else {
                await send(
                  old ? `/vacations/${old.id}` : '/vacations',
                  { ...payload(), ...(old ? { version: old.version } : {}) },
                  old ? 'PATCH' : 'POST',
                  requestKey.current,
                );
                onSaved(
                  old ? 'Urlaub wurde aktualisiert.' : 'Deine Auszeit ist verbindlich gebucht.',
                );
              }
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <ErrorBox error={error} />
          {cancelled && <div className="notice">Diese Buchung wurde storniert.</div>}
          {user.role === 'ADMIN' && (
            <Field label="Mitarbeiter">
              <select
                value={form.userId || user.id}
                disabled={Boolean(old) || cancelled}
                onChange={(e) => update('userId', e.target.value)}
              >
                {users.map((u) => (
                  <option value={u.id} key={u.id}>
                    {u.displayName}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="form-grid">
            <Field label="Erster Urlaubstag">
              <input
                type="date"
                required
                value={form.startDate}
                disabled={cancelled}
                onChange={(e) => update('startDate', e.target.value)}
                onInput={(e) => update('startDate', e.currentTarget.value)}
              />
            </Field>
            <Field label="Letzter Urlaubstag (inklusive)">
              <input
                type="date"
                required
                value={form.endDate}
                min={form.startDate}
                disabled={cancelled}
                onChange={(e) => update('endDate', e.target.value)}
                onInput={(e) => update('endDate', e.currentTarget.value)}
              />
            </Field>
            <Field label="Beginn">
              <select
                value={form.startPart}
                disabled={cancelled}
                onChange={(e) => update('startPart', e.target.value)}
              >
                <option value="FULL">Ganzer Tag</option>
                {form.startDate === form.endDate && <option value="AM">Vormittag</option>}
                <option value="PM">Nachmittag</option>
              </select>
            </Field>
            <Field label="Ende">
              <select
                value={form.endPart}
                disabled={cancelled}
                onChange={(e) => update('endPart', e.target.value)}
              >
                <option value="FULL">Ganzer Tag</option>
                <option value="AM">Vormittag</option>
                {form.startDate === form.endDate && <option value="PM">Nachmittag</option>}
              </select>
            </Field>
          </div>
          <Field label="Persönliche Notiz" hint="Nur für dich und Administratoren sichtbar.">
            <textarea
              rows={2}
              maxLength={1000}
              disabled={cancelled}
              value={form.privateNote}
              onChange={(e) => update('privateNote', e.target.value)}
              placeholder="Optional"
            />
          </Field>
          {user.role === 'ADMIN' && (
            <Field
              label="Begründung des Admin-Eingriffs"
              hint="Bei fremden oder rückwirkenden Buchungen erforderlich."
            >
              <input
                value={form.reason}
                disabled={cancelled}
                onChange={(e) => update('reason', e.target.value)}
              />
            </Field>
          )}
          {preview && (
            <div className="booking-preview">
              <span className="soft-icon">
                <Sun size={23} />
              </span>
              <div>
                <strong>{days(preview.totalUnits)} Urlaubstage</strong>
                <p>
                  {Object.entries(preview.years)
                    .map(([y, units]) => `${days(units)} Tage aus ${y}`)
                    .join(' · ')}
                </p>
                <small>Wochenplan und Feiertage sind bereits berücksichtigt.</small>
              </div>
              <CheckCircle2 size={23} />
            </div>
          )}
          <div className="modal-actions">
            {old && !cancelled && (
              <button
                type="button"
                className="button danger"
                disabled={busy}
                onClick={async () => {
                  if (!confirm('Diese Urlaubsbuchung verbindlich stornieren?')) return;
                  setBusy(true);
                  try {
                    await send(`/vacations/${old.id}/cancel`, {
                      version: old.version,
                      ...(form.reason ? { reason: form.reason } : {}),
                    });
                    onSaved('Urlaub storniert. Das Guthaben wurde freigegeben.');
                  } catch (e) {
                    setError(e.message);
                    setBusy(false);
                  }
                }}
              >
                Stornieren
              </button>
            )}
            <button type="button" className="button secondary" onClick={onClose}>
              Schließen
            </button>
            {!cancelled && (
              <button className="button primary" disabled={busy || Boolean(initial.id && !old)}>
                {busy
                  ? 'Wird geprüft …'
                  : preview
                    ? old
                      ? 'Änderung verbindlich speichern'
                      : 'Urlaub verbindlich buchen'
                    : 'Urlaubstage berechnen'}
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}
