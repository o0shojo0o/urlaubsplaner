export const now = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export const add = (d, n) => {
  const value = new Date(`${d}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + n);
  return value.toISOString().slice(0, 10);
};
export const fmt = (d, options = {}) =>
  new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', ...options }).format(
    new Date(`${d}T12:00:00Z`),
  );
export const days = (units = 0) =>
  new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(units / 2);
export const initials = (name = '') =>
  name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
export const months = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];
export const weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
