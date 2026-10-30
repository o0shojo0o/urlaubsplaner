import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import deLocale from '@fullcalendar/core/locales/de';
import { ChevronLeft, ChevronRight, Plus, Printer } from 'lucide-react';
import { api, allPages } from '../api.js';
import { now, add, fmt, days, months, weekdays } from '../lib/format.js';
import { ErrorBox, Loading } from './ui.jsx';
import { useData } from '../hooks/useData.js';
export function CalendarPanel({ user, year, revision, openBooking, compact = false }) {
  const ref = useRef(null),
    [title, setTitle] = useState(''),
    [view, setView] = useState('dayGridMonth'),
    [printing, setPrinting] = useState(false),
    [departmentId, setDepartmentId] = useState(''),
    [departments, setDepartments] = useState([]),
    [range, setRange] = useState(null),
    [calendarError, setCalendarError] = useState('');
  useEffect(() => {
    const beforePrint = () => {
      flushSync(() => setPrinting(true));
      ref.current?.getApi().updateSize();
    };
    const afterPrint = () => {
      setPrinting(false);
      requestAnimationFrame(() => ref.current?.getApi().updateSize());
    };
    window.addEventListener('beforeprint', beforePrint);
    window.addEventListener('afterprint', afterPrint);
    return () => {
      window.removeEventListener('beforeprint', beforePrint);
      window.removeEventListener('afterprint', afterPrint);
    };
  }, []);
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
  const holidayClassNames = (info) => {
    const date = `${info.date.getFullYear()}-${String(info.date.getMonth() + 1).padStart(2, '0')}-${String(info.date.getDate()).padStart(2, '0')}`;
    return data?.holidays.some((h) => h.date === date) ? ['calendar-holiday'] : [];
  };
  const events = (data?.items || []).map((v) => ({
    id: v.id,
    title: `${v.displayName}${v.startPart !== 'FULL' || v.endPart !== 'FULL' ? ' · ½' : ''}`,
    start: v.startDate,
    end: add(v.endDate, 1),
    allDay: true,
    backgroundColor: v.color,
    borderColor: v.color,
    textColor: '#ffffff',
    classNames: ['leave-event'],
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
      backgroundColor: '#287fb6',
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
          <button className="calendar-print" onClick={() => window.print()}>
            <Printer size={15} />
            Drucken
          </button>
          {(compact
            ? [['dayGridMonth', 'Monat']]
            : [
                ['dayGridMonth', 'Monat'],
                ['timeGridWeek', 'Woche'],
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
          onSelect={openBooking}
        />
      ) : (
        <div className="calendar-body">
          <FullCalendar
            ref={ref}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
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
            dayMaxEvents={printing ? false : 3}
            events={events}
            dayCellClassNames={holidayClassNames}
            dayHeaderClassNames={holidayClassNames}
            eventDidMount={(info) => {
              if (!info.event.extendedProps.holiday)
                info.el.style.setProperty('--leave-color', info.event.backgroundColor);
            }}
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
      <div className="calendar-legend" style={{ flexWrap: 'wrap' }}>
        {view !== 'year' && <EmployeeLegend events={data?.items || []} />}
        <span>
          <i style={{ background: '#e2e2e2' }} />
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

function EmployeeLegend({ events }) {
  const employees = [...new Map(events.map((v) => [v.userId, v])).values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, 'de'),
  );
  return employees.map((employee) => (
    <span key={employee.userId}>
      <i style={{ background: employee.color }} />
      {employee.displayName}
    </span>
  ));
}

function YearGrid({ year, revision, departmentId, onSelect }) {
  const selectionRef = useRef(null);
  const [selection, setSelection] = useState(null);
  const clearSelection = () => {
    selectionRef.current = null;
    setSelection(null);
  };
  const selectedStart = selection && [selection.anchor, selection.end].sort()[0];
  const selectedEnd = selection && [selection.anchor, selection.end].sort()[1];
  const [data, error] = useData(async () => {
    const range = `start=${year}-01-01&endExclusive=${year + 1}-01-01`;
    const [events, holidays] = await Promise.all([
      allPages(`/calendar?${range}${departmentId ? `&departmentId=${departmentId}` : ''}`),
      api(`/holidays?${range}`),
    ]);
    return { events, holidays };
  }, [year, revision, departmentId]);
  const monthLanes = months.map((_, m) => {
    const start = `${year}-${String(m + 1).padStart(2, '0')}-01`;
    const end = `${year}-${String(m + 1).padStart(2, '0')}-${new Date(Date.UTC(year, m + 1, 0)).getUTCDate()}`;
    const laneEnds = [];
    return (data?.events || [])
      .filter((v) => v.startDate <= end && v.endDate >= start)
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id))
      .map((v) => {
        let lane = laneEnds.findIndex((last) => last < v.startDate);
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = v.endDate;
        return {
          ...v,
          lane,
          visibleStart: v.startDate < start ? start : v.startDate,
          visibleEnd: v.endDate > end ? end : v.endDate,
        };
      });
  });
  if (!data && !error) return <Loading />;
  return (
    <>
      <ErrorBox error={error} />
      <div
        className="annual-calendar-scroll"
        role="region"
        aria-label={`Jahreskalender ${year}`}
        tabIndex={0}
      >
        <table className="annual-calendar">
          <thead>
            <tr>
              {months.map((month) => (
                <th scope="col" key={month}>
                  <h3>{month}</h3>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 31 }, (_, i) => (
              <tr key={i}>
                {months.map((month, m) => {
                  const count = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
                  if (i >= count) return <td className="annual-invalid" key={month} />;
                  const day = `${year}-${String(m + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
                  const weekday = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
                  const booked = monthLanes[m].filter(
                    (v) => v.startDate <= day && v.endDate >= day,
                  );
                  const holidays = data?.holidays.filter((h) => h.date === day) || [];
                  const description = [
                    fmt(day, { weekday: 'long', year: 'numeric' }),
                    ...holidays.map((h) => h.name),
                    ...booked.map((v) => v.displayName),
                  ].join(' · ');
                  return (
                    <td
                      key={month}
                      className={`${weekday >= 5 ? 'annual-weekend' : ''} ${weekday === 6 ? 'annual-sunday' : ''} ${holidays.length ? 'annual-holiday' : ''}`}
                    >
                      <button
                        data-date={day}
                        className={`annual-day ${selection && day >= selectedStart && day <= selectedEnd ? 'annual-selected' : ''} ${booked.length ? 'annual-booked' : ''} ${day === now() ? 'annual-today' : ''}`}
                        title={description}
                        aria-label={description}
                        aria-current={day === now() ? 'date' : undefined}
                        onPointerDown={(event) => {
                          if (event.button !== 0 || !event.isPrimary) return;
                          event.currentTarget.setPointerCapture(event.pointerId);
                          const next = { anchor: day, end: day };
                          selectionRef.current = next;
                          setSelection(next);
                        }}
                        onPointerMove={(event) => {
                          if (!selectionRef.current) return;
                          const target = document
                            .elementFromPoint(event.clientX, event.clientY)
                            ?.closest('.annual-day');
                          if (
                            !target ||
                            target.closest('table') !== event.currentTarget.closest('table')
                          )
                            return;
                          const next = { ...selectionRef.current, end: target.dataset.date };
                          selectionRef.current = next;
                          setSelection(next);
                        }}
                        onPointerUp={() => {
                          if (!selectionRef.current) return;
                          const [startDate, endDate] = [
                            selectionRef.current.anchor,
                            selectionRef.current.end,
                          ].sort();
                          clearSelection();
                          onSelect({ startDate, endDate });
                        }}
                        onPointerCancel={clearSelection}
                        onLostPointerCapture={clearSelection}
                        onClick={(event) => {
                          if (event.detail === 0) onSelect({ startDate: day, endDate: day });
                        }}
                      >
                        <span>{String(i + 1).padStart(2, '0')}</span>
                        <small>{weekdays[weekday]}</small>
                        <span className="annual-markers" aria-hidden="true">
                          {booked.map((v) => (
                            <i key={v.id} style={{ background: v.color, left: `${v.lane * 17}px` }}>
                              {day === v.visibleStart && (
                                <span
                                  className="annual-leave-name"
                                  style={{
                                    height: `${(Math.round((Date.parse(v.visibleEnd) - Date.parse(v.visibleStart)) / 86400000) + 1) * 28 - 4}px`,
                                  }}
                                >
                                  {v.displayName}
                                </span>
                              )}
                            </i>
                          ))}
                        </span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="calendar-legend" style={{ flexWrap: 'wrap' }}>
        <EmployeeLegend events={data?.events || []} />
      </div>
    </>
  );
}
