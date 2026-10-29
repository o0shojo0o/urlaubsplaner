import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export function ThemeToggle({ className = '' }) {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme || 'light');
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setTheme(document.documentElement.dataset.theme || 'light');
    const systemChanged = () => {
      let saved;
      try {
        saved = localStorage.getItem('freiraum-theme');
      } catch {
        /* Storage may be unavailable. */
      }
      if (saved === 'light' || saved === 'dark') return;
      document.documentElement.dataset.theme = media.matches ? 'dark' : 'light';
      sync();
    };
    media.addEventListener('change', systemChanged);
    return () => media.removeEventListener('change', systemChanged);
  }, []);
  const dark = theme === 'dark';
  const label = dark ? 'Hellen Modus aktivieren' : 'Dunklen Modus aktivieren';
  return (
    <button
      type="button"
      className={`theme-toggle ${className}`}
      aria-label={label}
      aria-pressed={dark}
      title={label}
      onClick={() => {
        const next = dark ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        setTheme(next);
        try {
          localStorage.setItem('freiraum-theme', next);
        } catch {
          /* Keep the theme for this visit. */
        }
      }}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
      <span>{dark ? 'Hell' : 'Dunkel'}</span>
    </button>
  );
}
