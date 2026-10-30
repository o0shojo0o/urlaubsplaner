import { readFileSync } from 'node:fs';
const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);
const metadata = (value, fallback) =>
  value
    ?.trim()
    .replace(/[\r\n\t]/g, ' ')
    .slice(0, 128) || fallback;
export function systemInfo() {
  return {
    appVersion: metadata(process.env.APP_VERSION, version),
    revision: metadata(process.env.APP_REVISION, 'unbekannt'),
    deployment: metadata(process.env.APP_DEPLOYMENT, 'Direktbetrieb'),
    runtime: `Node.js ${process.version}`,
    platform: `${process.platform} / ${process.arch}`,
  };
}
