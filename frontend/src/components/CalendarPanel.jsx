import { useEffect, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import deLocale from '@fullcalendar/core/locales/de';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { api, allPages } from '../api.js';
import { now, add, fmt, days, months, weekdays } from '../lib/format.js';
import { ErrorBox, Loading } from './ui.jsx';
import { useData } from '../hooks/useData.js';
export function CalendarPanel({ user, year, revision, openBooking, compact = false }) {
  const ref = useRef(null),
    [title, setTitle] = useState(''),
    [view, setView] = useState('dayGridMonth'),
    [departmentId, setDepartmentId] = useState(''),
    [departments, setDepartments] = useState([]),
    [range, setRange] = useState(null),
    [calendarError, setCalendarError] = useState('');
  useEffect(() => {
    if (user.role === 'ADMIN' && !compact)
      api('/admin/departments')
        .then(setDepartments)
        .catch((e) => setCalendarError(e.message));
  }, []);
  useEffect(() => {
    if (ref.current) {
      const calendar = ref.current.getApi();
      const current = calendar.getDate();
      calendar.gotoDate(
        `${year}-${year === Number(now().slice(0, 4)) ? now().slice(5, 7) : String(current.getMonth() + 1).padStart(2, '0')}-01`,
      );
    }
  }, [year]);
  const [data, error] = useData(async () => {
    if (!range) return { items: [], holidays: [] };
    const [items, holidays] = await Promise.all([
      allPages(
        `/calendar?start=${range.start}&endExclusive=${range.end}${departmentId ? `&departmentId=${departmentId}` : ''}`,
      ),
      api(`/holidays?start=${range.start}&endExclusive=${range.end}`),
    ]);
    return { items, holidays };
  }, [range?.start, range?.end, revision, departmentId]);
  const events = (data?.items || []).map((v) => ({
    id: v.id,
    title: `${v.displayName}${v.startPart !== 'FULL' || v.endPart !== 'FULL' ? ' · ½' : ''}`,
    start: v.startDate,
    end: add(v.endDate, 1),
    allDay: true,
    backgroundColor: `${v.color}16`,
    borderColor: 'transparent',
    textColor: v.color,
    extendedProps: v,
  }));
  events.push(
    ...(data?.holidays || []).map((h) => ({
      id: `holiday-${h.id}`,
      title: h.name,
      start: h.date,
      end: add(h.date, 1),
      allDay: true,
      display: 'background',
      backgroundColor: '#dce8dc',
      extendedProps: { holiday: true },
    })),
  );
  return (
    <section className={`panel calendar-panel ${compact ? 'compact' : ''}`}>
      <header className="panel-heading">
        <div>
          <h2>{compact ? 'Teamkalender' : 'Die Auszeiten im Team'}</h2>
          <p>
            {user.role === 'ADMIN'
              ? departments.find((d) => d.id === departmentId)?.name || 'Alle Abteilungen'
              : user.department.name}{' '}
            <span className="inline-dot">·</span>{' '}
            {user.role === 'ADMIN' ? 'Unternehmensübersicht' : 'Nur deine Abteilung'}
          </p>
        </div>
        <span className="calendar-badge">
          <span className="online-dot" />
          {compact ? 'Live' : 'Automatisch gebucht'}
        </span>
      </header>
      {!compact && user.role === 'ADMIN' && (
        <div className="calendar-filter">
          <label>
            Abteilung{' '}
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">Alle Abteilungen</option>
              {departments.map((d) => (
                <option value={d.id} key={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="calendar-toolbar">
        <div className="calendar-period">
          <h3>{view === 'year' ? year : title}</h3>
          {view !== 'year' && (
            <>
              <button
                className="icon-button"
                aria-label="Vorheriger Zeitraum"
                onClick={() => ref.current.getApi().prev()}
              >
                <ChevronLeft size={17} />
              </button>
              <button
                className="icon-button"
                aria-label="Nächster Zeitraum"
                onClick={() => ref.current.getApi().next()}
              >
                <ChevronRight size={17} />
              </button>
              <button className="today-button" onClick={() => ref.current.getApi().today()}>
                Heute
              </button>
            </>
          )}
        </div>
        <div className="view-tabs">
          {(compact
            ? [
                ['dayGridMonth', 'Monat'],
                ['listMonth', 'Liste'],
              ]
            : [
                ['dayGridMonth', 'Monat'],
                ['timeGridWeek', 'Woche'],
                ['listMonth', 'Liste'],
                ['year', 'Jahr'],
              ]
          ).map(([value, label]) => (
            <button
              key={value}
              className={view === value ? 'selected' : ''}
              onClick={() => {
                setView(value);
                if (value !== 'year') ref.current?.getApi().changeView(value);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <ErrorBox error={error || calendarError} />
      {view === 'year' ? (
        <YearGrid
          year={year}
          revision={revision}
          departmentId={departmentId}
          onSelect={(d) => openBooking({ startDate: d, endDate: d })}
        />
      ) : (
        <div className="calendar-body">
          <FullCalendar
            ref={ref}
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            locale={deLocale}
            initialView={view === 'year' ? 'dayGridMonth' : view}
            initialDate={year === Number(now().slice(0, 4)) ? now() : `${year}-01-01`}
            headerToolbar={false}
            height="auto"
            fixedWeekCount={false}
            firstDay={1}
            allDaySlot
            slotMinTime="08:00:00"
            slotMaxTime="18:00:00"
            selectable
            selectMirror
            dayMaxEvents={3}
            events={events}
            datesSet={(info) => {
              setTitle(info.view.title);
              setRange({ start: info.startStr.slice(0, 10), end: info.endStr.slice(0, 10) });
            }}
            select={(info) => {
              if (info.allDay) {
                openBooking({
                  startDate: info.startStr.slice(0, 10),
                  endDate: add(info.endStr.slice(0, 10), -1),
                });
                ref.current.getApi().unselect();
              }
            }}
            eventClick={(info) => {
              const v = info.event.extendedProps;
              if (!v.holiday) {
                if (v.own || user.role === 'ADMIN') openBooking({ id: info.event.id });
                else
                  window.alert(
                    `${v.displayName}\n${fmt(v.startDate)} – ${fmt(v.endDate)}\n${days(v.units)} Urlaubstage`,
                  );
              }
            }}
          />
        </div>
      )}
      <div className="calendar-legend">
        <span>
          <i style={{ background: '#0d9488' }} />
          Urlaub
        </span>
        <span>
          <i style={{ background: '#dce8dc' }} />
          Feiertag
        </span>
        <span className="legend-help">
          Tage auswählen, um Urlaub zu buchen
          <Plus size={13} />
        </span>
      </div>
    </section>
  );
}

function YearGrid({ year, revision, departmentId, onSelect }) {
  const [events, error] = useData(
    () =>
      allPages(
        `/calendar?start=${year}-01-01&endExclusive=${year + 1}-01-01${departmentId ? `&departmentId=${departmentId}` : ''}`,
      ),
    [year, revision, departmentId],
  );
  if (!events && !error) return <Loading />;
  return (
    <>
      <ErrorBox error={error} />
      <div className="year-grid">
        {months.map((month, m) => {
          const start = `${year}-${String(m + 1).padStart(2, '0')}-01`;
          const count = new Date(year, m + 1, 0).getDate();
          const offset = (new Date(`${start}T12:00:00Z`).getUTCDay() + 6) % 7;
          return (
            <div className="mini-month" key={m}>
              <h3>{month}</h3>
              <div className="mini-days">
                {weekdays.map((d) => (
                  <small key={d}>{d[0]}</small>
                ))}
                {Array.from({ length: offset }, (_, i) => (
                  <span key={`e${i}`} />
                ))}
                {Array.from({ length: count }, (_, i) => {
                  const day = `${year}-${String(m + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
                  const booked =
                    events?.filter((v) => v.startDate <= day && v.endDate >= day) || [];
                  return (
                    <button
                      key={day}
                      className={`${booked.length ? 'has-leave' : ''} ${day === now() ? 'is-today' : ''}`}
                      title={`${fmt(day)}${booked.length ? `: ${booked.map((v) => v.displayName).join(', ')}` : ''}`}
                      onClick={() => onSelect(day)}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
