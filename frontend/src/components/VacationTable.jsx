import { Check, ArrowUpRight } from 'lucide-react';
import { fmt, days } from '../lib/format.js';
import { Empty } from './ui.jsx';
export function VacationTable({ vacations, onOpen }) {
  if (!vacations.length)
    return <Empty>Noch keine Auszeit geplant. Wähle deinen nächsten Urlaub im Kalender.</Empty>;
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Zeitraum</th>
            <th>Dauer</th>
            <th>Status</th>
            <th>
              <span className="sr-only">Details</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {vacations.map((v) => (
            <tr key={v.id}>
              <td>
                <div className="date-cell">
                  <span className="date-tile">
                    <small>{fmt(v.startDate, { month: 'short', day: undefined })}</small>
                    {v.startDate.slice(8)}
                  </span>
                  <div>
                    <strong>
                      {fmt(v.startDate)} – {fmt(v.endDate, { year: 'numeric' })}
                    </strong>
                    <small>
                      {v.startPart === 'FULL' && v.endPart === 'FULL'
                        ? 'Ganztägig'
                        : 'Mit halbem Urlaubstag'}
                    </small>
                  </div>
                </div>
              </td>
              <td>{days(v.days.reduce((n, d) => n + d.units, 0))} Tage</td>
              <td>
                <span className={`status-pill ${v.status === 'CANCELLED' ? 'cancelled' : ''}`}>
                  {v.status === 'BOOKED' && <Check size={12} />}{' '}
                  {v.status === 'BOOKED' ? 'Gebucht' : 'Storniert'}
                </span>
              </td>
              <td>
                <button
                  className="icon-button"
                  aria-label={`Buchung ab ${fmt(v.startDate)} ansehen`}
                  onClick={() => onOpen(v)}
                >
                  <ArrowUpRight size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
