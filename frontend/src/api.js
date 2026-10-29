import { createRequestKey } from './lib/requestKey.js';
let csrfToken;
export async function initCsrf() {
  const res = await fetch('/api/v1/auth/csrf');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Server nicht erreichbar.');
  csrfToken = data.csrfToken;
}
export async function api(path, options = {}) {
  const method = options.method || 'GET';
  if (method !== 'GET' && !csrfToken) await initCsrf();
  const response = await fetch(`/api/v1${path}`, {
    method,
    signal: options.signal,
    headers: {
      'Content-Type': 'application/json',
      ...(method !== 'GET'
        ? { 'X-CSRF-Token': csrfToken, 'Idempotency-Key': options.key || createRequestKey() }
        : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message || 'Anfrage fehlgeschlagen.');
    error.status = response.status;
    error.code = data.error?.code;
    if (response.status === 401 && path !== '/auth/login')
      window.dispatchEvent(new Event('session-expired'));
    throw error;
  }
  if (data.csrfToken) csrfToken = data.csrfToken;
  return data;
}
export async function allPages(path) {
  const items = [];
  for (let offset = 0; ; offset += 100) {
    const data = await api(`${path}${path.includes('?') ? '&' : '?'}offset=${offset}&limit=100`);
    items.push(...data.items);
    if (items.length >= data.total || !data.items.length) return items;
  }
}
export const send = (path, body = {}, method = 'POST', key) => api(path, { method, body, key });
