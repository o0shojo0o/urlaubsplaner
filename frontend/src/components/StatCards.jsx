import { Sun, CalendarDays, CheckCircle2, ArrowUpRight } from 'lucide-react';
import { days } from '../lib/format.js';
export function StatCards({ balance }) {
  const stats = [
    ['Verfügbare Tage', balance.remainingUnits, Sun, 'Für deine nächste Auszeit', 'featured'],
    ['Jahresanspruch', balance.annualUnits, CalendarDays, `Dein Anspruch für ${balance.year}`, ''],
    [
      'Bereits gebucht',
      balance.bookedUnits,
      CheckCircle2,
      `${days(balance.upcomingUnits)} Tage davon noch vor dir`,
      '',
    ],
    [
      'Übertrag & Korrektur',
      balance.carryoverUnits + balance.adjustmentUnits,
      ArrowUpRight,
      'Zusätzliches Urlaubsguthaben',
      '',
    ],
  ];
  return (
    <div className="stats-grid">
      {stats.map(([label, value, Icon, note, featured]) => (
        <section className={`stat-card ${featured}`} key={label}>
          <div className="stat-top">
            <span>{label}</span>
            <span className="stat-icon">
              <Icon size={19} />
            </span>
          </div>
          <div className="stat-value">
            {days(value)}
            <span>Tage</span>
          </div>
          <div className="stat-note">
            {featured && <span className="online-dot" />}
            {note}
          </div>
        </section>
      ))}
    </div>
  );
}
