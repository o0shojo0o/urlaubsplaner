# Prüfprotokoll

Stand: 29. Oktober 2026. Alle Daten in Tests, Screenshots und Lasttest sind synthetisch.

## Lokal ausgeführt

- ESLint und produktiver Vite-/Prisma-Build erfolgreich.
- 29 Unit-/API-/SQLite-Integrationstests erfolgreich. Dazu gehören Abteilungsrechte, private Kalenderdaten, CSRF/Origin, Login/Logout, einmalige Resetlinks, Beschäftigung/Arbeitspläne, Feiertage, Halbtage, Jahreswechsel, Stornoerstattung, Idempotenz, Versionskonflikte und atomare Neuberechnung.
- Parallelität sowohl über zwei HTTP-Sitzungen als auch über zwei physisch getrennte Prisma-/SQLite-Verbindungen geprüft: bei nur einem freien Tag genau eine Buchung erfolgreich, keine Überziehung.
- Prisma-Migration auf leerer SQLite-Datei erfolgreich; CHECKs, Foreign Keys und Trigger in Integrationstests direkt geprüft.
- npm-Abhängigkeitsprüfung: keine bekannten Sicherheitslücken zum Prüfzeitpunkt.
- Browserprüfung: Anmeldung, Dashboard, Auswahl von Zeitraum/Jahr, Buchungsvorschau und verbindliche Speicherung einer Fünftagewoche mit anschließendem Kontostand 25 von 30 Tagen; Browserkonsole ohne Laufzeitfehler in der geprüften Ansicht.
- Bei Browserprüfung gefundenen Fehler in der kontrollierten Datumseingabe korrigiert; explizite Input-Verarbeitung verhindert das Zurückspringen auf das vorherige Datum.
- Responsive Buchungsansicht bei 360 × 800 px geprüft: Dialogbreite 326 px, Inhaltsbreite/Scrollbreite jeweils 324 px, kein horizontales Überlaufen; langes Formular vertikal scrollbar.
- Docker-Image unter Linux/ARM64 mit Node 24 erfolgreich gebaut; Compose startet mit Migration, schreibgeschütztem Root-Dateisystem, Benutzer ohne root und erfolgreichem Healthcheck.
- Compose-Persistenztest: Testdatensatz nach vollständiger Container-Neuanlage erhalten; Health- und Frontendantwort jeweils HTTP 200, Laufzeit-UID 1000. Backup auch im schreibgeschützten Container erfolgreich.
- Wiederherstellung einer lokalen Sicherung in ein leeres temporäres Ziel erfolgreich: Integrität, Foreign Keys und keine Kontoüberziehungen geprüft (5 Benutzer, 7 Buchungen, 10 Jahreskonten).
- Konsistentes SQLite-Backup einschließlich Integritäts- und Foreign-Key-Prüfung erfolgreich erstellt. Sicherungen sind gitignored.

## Lasttest

Reproduzierbar mit `npm run benchmark`; isolierte temporäre SQLite-Datei, kein Zugriff auf die konfigurierte Firmendatenbank.

| Merkmal | Ergebnis |
|---|---|
| Host | Apple M4 Pro, macOS ARM64 |
| Node lokal | v26.13.0; Docker/CI verwenden Node 24 |
| Daten | 500 aktive Benutzer, 25.000 Buchungen |
| Gleichzeitige Sitzungen | 20 |
| Monatliche Kalenderabfragen | 160 Messungen, p95 222 ms |
| Buchungen | 20 Messungen, p95 64 ms |
| Ziele | Kalender <500 ms, Buchung <1.000 ms |

Die Messung umfasst HTTP, JSON und Datenbankzugriff bei lokalem Betrieb. Hardware, Reverse-Proxy, Netzwerklatenz und echte Unternehmensdaten können Ergebnisse verändern. Die Kalender-API ist paginiert; gemessen ist eine Seite von maximal 100 Ereignissen plus Gesamtanzahl, nicht die Übertragung aller 25.000 Buchungen.

## Automatisierte Browserprüfung in CI

Drei Playwright-Tests sind eingerichtet: Buchung/Storno mit Kontoerstattung, Abteilungssichtbarkeit ohne Adminnavigation und mobiles Buchungsformular. Sie laufen mit gebautem Frontend auf einem isolierten Testserver und einer temporären Datenbank. Der GitHub-Workflow „Tests and lint“ führt sie neben Lint, Integrationstests, Build, Migration und Backup aus.

## Betrieb und Grenzen

- Ein Unternehmen, ein App-Prozess und eine lokale SQLite-Datei; keine horizontale Replikation und kein Netzwerkdateisystem für das Datenvolume.
- Die Demo liefert ausschließlich bundeseinheitliche deutsche Feiertage. Produktive Standortkalender müssen ausdrücklich gepflegt und bestätigt werden.
- Anspruchsquoten, Verfall und Personalaufbewahrung werden nicht arbeitsrechtlich automatisch ermittelt. Jahresabschluss und Übertrag sind Adminvorgänge.
- Historische Kalenderzuordnung folgt der aktuellen Abteilung. Laufender Urlaub und geschlossene Kontojahre werden nicht stillschweigend neu berechnet.
- Keine Krankheit, Betriebsferien-Sammelbuchung, E-Mail-Zustellung, SSO oder iCal in diesem Stand.
- Der ursprüngliche Plan ist die fachliche Grundlage. Umgesetzte API-Pfade stehen in `openapi.yaml`; Arbeitsplanwechsel erfolgen durch einen neuen datierten Plan, Feiertagsjahre werden beim geprüften Speichern bestätigt. Tabellennamen sind gemappt; Prisma-Felder verwenden camelCase.
- Monatlich geübte externe Wiederherstellung und die organisatorische Festlegung der Datenaufbewahrung bleiben laufende Betriebsaufgaben. Ein einmaliger lokaler Restore-Test ersetzt diese nicht.
