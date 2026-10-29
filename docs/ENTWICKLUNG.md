# Entwicklung und Projektpflege

## Entwicklung und Demo

Node.js 24 LTS und npm verwenden. Prisma-CLI, Client und SQLite-Adapter sind gemeinsam auf 7.10.1 fixiert; das Lockfile fixiert alle weiteren Versionen.

```sh
cp .env.example .env
npm ci
npm run db:generate
npm run db:migrate
npm run dev
```

Frontend: [http://localhost:5173](http://localhost:5173), Express: Port 3000. Der Dev-Start setzt die zugelassene Origin auf `http://localhost:5173`; `DEV_ORIGIN` erlaubt einen ausdrücklich konfigurierten Ersatz. Vite verwendet einen festen Port und leitet `/api` an Express weiter.

Für eine **leere lokale** Datenbank kann statt `bootstrap` einmalig `npm run demo` ausgeführt werden. Das erzeugt fünf synthetische Mitarbeiter in drei Abteilungen, zwei Jahreskonten je Person und Demobuchungen. Die Zugangsnamen sind `admin@example.test` und `mia@example.test`; ein zufälliges gemeinsames Demopasswort wird einmalig im Terminal ausgegeben. Der Seed verweigert bestehende Benutzerdaten. Der Demokalender enthält nur bundeseinheitliche deutsche Feiertage und muss für echte Standorte vervollständigt werden.

Gebauter lokaler Betrieb:

```sh
npm run build
npm start
```

Hier gilt `APP_ORIGIN` aus `.env`, im Beispiel `http://localhost:3000`.

## Tests und Qualität

```sh
npm run check
npm test
npm run build
npm audit --audit-level=high
npm run benchmark
```

Die Integrationstests verwenden echte, isolierte SQLite-Dateien und prüfen unter anderem Fremdzugriffe, CSRF, Resetlinks, Teilzeit, Halbtage, Feiertage, Stornos, Idempotenz, Rollback, Jahreswechsel und parallele Buchungen über getrennte Prisma-Verbindungen. Der Benchmark erzeugt ausschließlich eine temporäre synthetische Datenbank mit 500 Benutzern, 25.000 Buchungen und 20 parallelen Sitzungen.

Browser-E2E-Tests für CI:

```sh
npx playwright install chromium
npm run build
npm run test:e2e
```

Die E2E-App läuft ausschließlich auf `127.0.0.1:4173` mit einer eigenen temporären Datenbank. Eine Desktop-Browserprüfung und die responsive Prüfung bei 360 px sind außerdem im [Prüfprotokoll](PRUEFPROTOKOLL.md) dokumentiert.

## GitHub Actions und Dependabot

- **Release-Image bauen:** `.github/workflows/docker-image.yml` erstellt und veröffentlicht ausschließlich bei `release: published` ein Image nach `ghcr.io/o0shojo0o/urlaubsplaner`. Tags: Release-Version (z. B. `v1.0.0` und `1.0.0`), vollständige Commit-SHA und bei stabilen Releases `latest`. Anmeldung über `GITHUB_TOKEN`; kein zusätzliches `ACCESS_TOKEN` erforderlich.
- **Tests and lint:** Lint, echte SQLite-Tests, Frontend-Build, Browser-E2E, Migration-/Backup-Smoke-Test und Abhängigkeitsprüfung unter Node 24.
- **Dependabot:** GitHub Actions, npm-Workspaces und Docker-Basisimage, wöchentlich montags um 07:00 Uhr Europe/Berlin. Zusammengehörige Prisma-Pakete werden gemeinsam aktualisiert.
- **Kompatibilitätsgrenzen:** FullCalendar bleibt gemeinsam auf Version 6, ESLint und `@eslint/js` auf Version 9, das Docker-Basisimage auf Node 24 LTS. Dependabot aktualisiert diese Pakete innerhalb der Versionsreihe; Major-Upgrades werden dafür unterdrückt und erst als geprüfte Migration vorgenommen. FullCalendar- und ESLint-Pakete werden jeweils zusammen aktualisiert.
- **Auto-Merge:** Nur verifizierte Dependabot-Patch-/Minor-Updates im selben Repository gegen den Standardbranch. Tests/Lint und alle verpflichtenden Branchchecks müssen erfolgreich sein; ohne Pflichtchecks kein automatischer Merge. Major-Updates bleiben manuell. Der privilegierte Merge-Workflow führt keinen PR-Code aus.

Einmalig in GitHub: **Allow auto-merge** und **Squash merging** aktivieren. Den Standardbranch mit Pull-Request-Pflicht, aktuellem Branchstand und Pflichtcheck **Tests and lint** schützen. Einen bisherigen Pflichtcheck **Docker build** aus den Branchregeln entfernen, da Images erst bei Releases gebaut werden. Verlangte manuelle Reviews werden nicht umgangen. Organisationsregeln müssen die verwendeten Actions und Schreibrechte für den Merge-Workflow zulassen.

## Lokaler Docker-Build

```sh
cp .env.example .env
docker compose up -d --build
```

Die Compose-Datei im Repository ist für lokale Builds vorgesehen.
