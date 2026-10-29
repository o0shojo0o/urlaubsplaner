import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  CalendarDays,
  Sun,
  Users,
  Building2,
  ShieldCheck,
  Settings,
  Leaf,
  ChevronRight,
  Plus,
  Menu,
  CheckCircle2,
  X,
} from 'lucide-react';
import { api, initCsrf, send } from './api.js';
import { now, fmt, initials } from './lib/format.js';
import { Loading, ErrorBox } from './components/ui.jsx';
import { CalendarPanel } from './components/CalendarPanel.jsx';
import { BookingModal } from './components/BookingModal.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { Login } from './pages/Login.jsx';
import { MyVacations } from './pages/MyVacations.jsx';
import { Profile } from './pages/Profile.jsx';
import { AdminPage } from './pages/AdminPage.jsx';
import { ThemeToggle } from './components/ThemeToggle.jsx';
export default function App() {
  const [user, setUser] = useState(null),
    [settings, setSettings] = useState(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState('');
  const [page, setPage] = useState('dashboard'),
    [year, setYear] = useState(Number(now().slice(0, 4))),
    [revision, setRevision] = useState(0),
    [booking, setBooking] = useState(null),
    [toast, setToast] = useState(''),
    [mobile, setMobile] = useState(false);
  const [activation, setActivation] = useState(
    new URLSearchParams(location.hash.slice(1)).get('activate'),
  );
  const load = async () => {
    setError('');
    try {
      const data = await api('/me');
      setUser(data.user);
      setSettings(data.settings);
    } catch (e) {
      if (e.status !== 401) setError(e.message);
    } finally {
      setReady(true);
    }
  };
  useEffect(() => {
    load();
    const expired = () => setUser(null);
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(id);
  }, [toast]);
  const notify = (message) => {
    setToast(message);
    setRevision((r) => r + 1);
  };
  const navigate = (p) => {
    setPage(p);
    setMobile(false);
  };
  if (!ready)
    return (
      <main className="boot">
        <Loading />
      </main>
    );
  if (!user || activation)
    return (
      <>
        <ThemeToggle className="login-theme-toggle" />
        <Login
          error={error}
          activation={activation}
          onActivated={() => {
            setActivation(null);
            history.replaceState(null, '', location.pathname);
          }}
          onLogin={load}
        />
      </>
    );
  const nav = [
    ['dashboard', LayoutDashboard, 'Übersicht'],
    ['calendar', CalendarDays, 'Teamkalender'],
    ['vacations', Sun, 'Mein Urlaub'],
    ['profile', Users, 'Mein Profil'],
  ];
  const adminNav = [
    ['users', Users, 'Mitarbeiter'],
    ['departments', Building2, 'Abteilungen'],
    ['holidays', CalendarDays, 'Feiertage'],
    ['audit', ShieldCheck, 'Änderungsprotokoll'],
    ['settings', Settings, 'Einstellungen'],
  ];
  const title = [...nav, ...adminNav].find((n) => n[0] === page)?.[2];
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? 'open' : ''}`}>
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            navigate('dashboard');
          }}
        >
          <span className="brand-mark">
            <Leaf size={22} />
          </span>
          Urlaubsplaner
        </a>
        <div className="workspace">
          <span className="workspace-logo">{initials(settings.companyName)}</span>
          <div>
            <strong>{settings.companyName}</strong>
            <small>Dein Team. Deine Auszeit.</small>
          </div>
          <span className="online-dot" />
        </div>
        <p className="nav-label">ARBEITSPLATZ</p>
        <nav aria-label="Hauptnavigation">
          {nav.map(([id, Icon, text]) => (
            <button
              key={id}
              className={`nav-item ${page === id ? 'active' : ''}`}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              {text}
              {page === id && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        {user.role === 'ADMIN' && (
          <>
            <p className="nav-label admin-label">
              VERWALTUNG <span>ADMIN</span>
            </p>
            <nav aria-label="Verwaltung">
              {adminNav.map(([id, Icon, text]) => (
                <button
                  key={id}
                  className={`nav-item ${page === id ? 'active' : ''}`}
                  onClick={() => navigate(id)}
                >
                  <Icon size={18} />
                  {text}
                </button>
              ))}
            </nav>
          </>
        )}
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Sun size={25} />
            <strong>Raum für neue Energie.</strong>
            <p>Gute Erholung beginnt mit einer entspannten Planung.</p>
          </div>
          <button className="user-profile" onClick={() => navigate('profile')}>
            <span className="avatar">{initials(user.displayName)}</span>
            <span>
              <strong>{user.displayName}</strong>
              <small>{user.role === 'ADMIN' ? 'Administrator' : user.department.name}</small>
            </span>
            <Settings size={16} />
          </button>
        </div>
      </aside>
      {mobile && (
        <button
          className="nav-scrim"
          aria-label="Menü schließen"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Navigation öffnen"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span>Arbeitsplatz</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <ThemeToggle />
            <span className="live-status">
              <span className="online-dot" />
              Mit dem Team verbunden
            </span>
            <span className="avatar small">{initials(user.displayName)}</span>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">{fmt(now(), { weekday: 'long', year: 'numeric' })}</p>
              <h1>
                {page === 'dashboard'
                  ? `Hallo ${user.displayName.split(' ')[0]}, Zeit für deine Urlaubsplanung.`
                  : title}
                <span className="heading-dot">{page === 'dashboard' ? ' ☀' : '.'}</span>
              </h1>
              <p>
                {page === 'dashboard'
                  ? 'Ein guter Überblick. Und die nächste Auszeit schon in Sicht.'
                  : page === 'calendar'
                    ? 'Gemeinsam planen, entspannt abschalten.'
                    : page === 'vacations'
                      ? 'Deine gebuchten Auszeiten und dein persönliches Urlaubskonto.'
                      : user.role === 'ADMIN' && !['profile'].includes(page)
                        ? 'Alles für eine einfache und verlässliche Urlaubsplanung.'
                        : 'Deine Angaben und Einstellungen an einem Ort.'}
              </p>
            </div>
            <div className="heading-actions">
              {['dashboard', 'vacations', 'calendar'].includes(page) && (
                <select
                  aria-label="Jahr"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                >
                  {Array.from({ length: 7 }, (_, i) => Number(now().slice(0, 4)) - 2 + i).map(
                    (y) => (
                      <option key={y}>{y}</option>
                    ),
                  )}
                </select>
              )}
              <button
                className="button primary"
                onClick={() => setBooking({ startDate: now(), endDate: now() })}
              >
                <Plus size={18} />
                Urlaub buchen
              </button>
            </div>
          </div>
          <ErrorBox error={error} />
          {page === 'dashboard' && (
            <Dashboard
              user={user}
              year={year}
              revision={revision}
              openBooking={setBooking}
              navigate={navigate}
            />
          )}
          {page === 'calendar' && (
            <CalendarPanel user={user} year={year} revision={revision} openBooking={setBooking} />
          )}
          {page === 'vacations' && (
            <MyVacations user={user} year={year} revision={revision} openBooking={setBooking} />
          )}
          {page === 'profile' && (
            <Profile
              user={user}
              logout={async () => {
                await send('/auth/logout');
                setUser(null);
                await initCsrf();
              }}
            />
          )}
          {user.role === 'ADMIN' &&
            ['users', 'departments', 'holidays', 'audit', 'settings'].includes(page) && (
              <AdminPage
                page={page}
                user={user}
                year={year}
                notify={notify}
                revision={revision}
                settings={settings}
                refreshUser={load}
              />
            )}
          <footer className="page-footer">
            <span>
              <Leaf size={13} /> Urlaubsplaner · Zusammen gut geplant.
            </span>
            <span>
              {user.department.name} <span className="footer-dot">·</span>{' '}
              {user.role === 'ADMIN' ? 'Unternehmensübersicht' : 'Abteilungskalender'}
            </span>
          </footer>
        </main>
      </div>
      {booking && (
        <BookingModal
          initial={booking}
          user={user}
          onClose={() => setBooking(null)}
          onSaved={(message) => {
            setBooking(null);
            notify(message);
          }}
        />
      )}{' '}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {toast}
          <button aria-label="Hinweis schließen" onClick={() => setToast('')}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
