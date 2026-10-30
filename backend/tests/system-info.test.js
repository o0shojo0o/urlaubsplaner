import { afterEach, describe, expect, it, vi } from 'vitest';
import { systemInfo } from '../src/system-info.js';
afterEach(() => vi.unstubAllEnvs());
describe('Systeminformationen für Feedback', () => {
  it('liefert ausschließlich freigegebene technische Angaben und keine Servergeheimnisse', () => {
    vi.stubEnv('APP_VERSION', 'v2.3.4');
    vi.stubEnv('APP_REVISION', 'abc123');
    vi.stubEnv('APP_DEPLOYMENT', 'Docker');
    vi.stubEnv('DATABASE_URL', 'file:/secret/path.db');
    vi.stubEnv('APP_ORIGIN', 'https://private.example');
    expect(systemInfo()).toEqual({
      appVersion: 'v2.3.4',
      revision: 'abc123',
      deployment: 'Docker',
      runtime: `Node.js ${process.version}`,
      platform: `${process.platform} / ${process.arch}`,
    });
  });
  it('verwendet die Paketversion, wenn keine Releaseangaben konfiguriert sind', () => {
    vi.stubEnv('APP_VERSION', '');
    vi.stubEnv('APP_REVISION', '');
    vi.stubEnv('APP_DEPLOYMENT', '');
    expect(systemInfo()).toMatchObject({
      appVersion: '1.0.0',
      revision: 'unbekannt',
      deployment: 'Direktbetrieb',
    });
  });
});
