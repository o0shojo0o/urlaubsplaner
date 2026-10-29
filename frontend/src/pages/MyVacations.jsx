import { useState } from 'react';
import { api, allPages } from '../api.js';
import { fmt, days } from '../lib/format.js';
import { Loading, ErrorBox, Empty } from '../components/ui.jsx';
import { StatCards } from '../components/StatCards.jsx';
import { VacationTable } from '../components/VacationTable.jsx';
import { useData } from '../hooks/useData.js';
export function MyVacations({ year, revision, openBooking }) {
  const [filter, setFilter] = useState('');
  const [data, error] = useData(
    async () => ({
      balance: await api(`/me/balances?year=${year}`),
      vacations: await allPages(`/me/vacations?year=${year}${filter ? `&status=${filter}` : ''}`),
    }),
    [year, revision, filter],
  );
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  return (
    <>
      <StatCards balance={data.balance} />
      <section className="panel">
        <header className="panel-heading">
          <div>
            <h2>Meine Buchungen</h2>
            <p>Deine Auszeiten im Jahr {year}</p>
          </div>
          <select
            aria-label="Buchungsstatus"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">Alle Buchungen</option>
            <option value="BOOKED">Gebucht</option>
            <option value="CANCELLED">Storniert</option>
          </select>
        </header>
        <VacationTable vacations={data.vacations} onOpen={(v) => openBooking({ id: v.id })} />
      </section>
      <section className="panel grants-panel">
        <header className="panel-heading">
          <div>
            <h2>Dein Urlaubskonto im Detail</h2>
            <p>Gültigkeit und Verwendung deines Guthabens</p>
          </div>
        </header>
        {data.balance.grants.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Quelle</th>
                  <th>Anspruch</th>
                  <th>Gebucht</th>
                  <th>Verbleibend</th>
                  <th>Gültig bis</th>
                </tr>
              </thead>
              <tbody>
                {data.balance.grants.map((g) => (
                  <tr key={g.id}>
                    <td>
                      {
                        {
                          ANNUAL: 'Jahresanspruch',
                          CARRYOVER: 'Übertrag',
                          ADJUSTMENT: 'Korrektur',
                        }[g.kind]
                      }
                    </td>
                    <td>{days(g.grantedUnits - g.withdrawnUnits)}</td>
                    <td>{days(g.usedUnits)}</td>
                    <td>{days(g.remainingUnits)}</td>
                    <td>{g.expiresOn ? fmt(g.expiresOn, { year: 'numeric' }) : 'Ohne Verfall'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Für dieses Jahr ist noch kein Guthaben eingerichtet.</Empty>
        )}
        <div className="notice subtle">
          {days(data.balance.expiredUnits)} Tage verfallen. Die Buchungsprüfung berücksichtigt das
          genaue Urlaubsdatum.
        </div>
      </section>
    </>
  );
}
