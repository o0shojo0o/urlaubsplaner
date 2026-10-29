import { Sun, Users, ShieldCheck, Clock3, ArrowUpRight, ArrowRight } from 'lucide-react';
import { api, allPages } from '../api.js';
import { now, fmt, days } from '../lib/format.js';
import { Loading, ErrorBox } from '../components/ui.jsx';
import { StatCards } from '../components/StatCards.jsx';
import { VacationTable } from '../components/VacationTable.jsx';
import { CalendarPanel } from '../components/CalendarPanel.jsx';
import { useData } from '../hooks/useData.js';
export function Dashboard({ user, year, revision, openBooking, navigate }) {
  const [data, error] = useData(
    async () => {
      const [balance, vacations] = await Promise.all([
        api(`/me/balances?year=${year}`),
        allPages(`/me/vacations?year=${year}&status=BOOKED`),
      ]);
      return { balance, vacations };
    },
    [year, revision],
    { keepPreviousData: true },
  );
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const next = data.vacations
    .filter((v) => v.endDate >= now())
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  return (
    <>
      <StatCards balance={data.balance} />
      {data.balance.missing && (
        <div className="notice">
          <ShieldCheck size={19} />
          Für {year} ist noch kein Urlaubskonto eingerichtet. Dein Administrator kann es anlegen.
        </div>
      )}
      <div className="dashboard-middle">
        <CalendarPanel
          compact
          user={user}
          year={year}
          revision={revision}
          openBooking={openBooking}
        />
        <aside className="right-column">
          <section className="next-vacation">
            <div className="next-top">
              <span className="eyebrow">DEINE NÄCHSTE AUSZEIT</span>
              <Sun size={22} />
            </div>
            {next ? (
              <>
                <div className="countdown">
                  {Math.max(
                    0,
                    Math.ceil((Date.parse(next.startDate) - Date.parse(now())) / 86400000),
                  )}
                  <span>Tage Vorfreude</span>
                </div>
                <div className="next-divider" />
                <h3>
                  {fmt(next.startDate)} – {fmt(next.endDate, { year: 'numeric' })}
                </h3>
                <p>
                  {days(next.days.reduce((n, d) => n + d.units, 0))} Urlaubstage <span>·</span>{' '}
                  Verbindlich gebucht
                </p>
                <button className="text-button" onClick={() => openBooking({ id: next.id })}>
                  Buchung ansehen
                  <ArrowUpRight size={17} />
                </button>
              </>
            ) : (
              <>
                <h3>Platz für neue Pläne.</h3>
                <p>Deine nächste Auszeit wartet auf dich.</p>
                <button
                  className="text-button"
                  onClick={() => openBooking({ startDate: now(), endDate: now() })}
                >
                  Auszeit planen
                  <ArrowUpRight size={17} />
                </button>
              </>
            )}
          </section>
          <section className="panel team-note">
            <span className="soft-icon">
              <Users size={22} />
            </span>
            <h3>Gemeinsam gut geplant.</h3>
            <p>
              {user.role === 'ADMIN'
                ? 'Als Administrator behältst du alle Abteilungen im Blick.'
                : `Dein Kalender zeigt die Auszeiten aus ${user.department.name}.`}
            </p>
            <div className="note-rule" />
            <div>
              <ShieldCheck size={16} />
              Direkt gebucht, ohne Freigabe
            </div>
            <div>
              <Clock3 size={16} />
              Arbeitstage automatisch berechnet
            </div>
          </section>
        </aside>
      </div>
      <section className="panel upcoming-panel">
        <header className="panel-heading">
          <div>
            <h2>Deine geplanten Auszeiten</h2>
            <p>Alles gebucht. Alles im Blick.</p>
          </div>
          <button className="text-button" onClick={() => navigate('vacations')}>
            Alle anzeigen
            <ArrowRight size={16} />
          </button>
        </header>
        <VacationTable
          vacations={data.vacations
            .filter((v) => v.endDate >= now())
            .sort((a, b) => a.startDate.localeCompare(b.startDate))
            .slice(0, 4)}
          onOpen={(v) => openBooking({ id: v.id })}
        />
      </section>
    </>
  );
}
