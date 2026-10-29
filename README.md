# Urlaubsplaner

Projektgrundlage für eine interne Urlaubsverwaltung mit Node.js/Express, React/Vite, Tailwind, FullCalendar, Prisma/SQLite und Docker Compose.

Der vollständige [technische Umsetzungsplan](docs/TECHNISCHER_UMSETZUNGSPLAN.md) beschreibt Architektur, Datenmodell, Rechte, API, UI, Berechnung, Sicherheit, Implementierungsphasen und Abnahme.

Festgelegt sind automatische verbindliche Urlaubsbuchung ohne Freigabe, Multiuser mit Adminrolle und ein auf die eigene Abteilung begrenzter Mitarbeiterkalender.

Status: Planung abgeschlossen; Anwendung und Deployment sind noch nicht implementiert.

## GitHub Actions und Dependabot

- `.github/workflows/docker-build.yml` baut bei Pull Requests und Pushes das Docker-Image, ohne es zu veröffentlichen. Auch manuell startbar. Solange der geplante Dockerfile fehlt, schlägt der Check ausdrücklich fehl.
- `.github/dependabot.yml` prüft GitHub Actions wöchentlich montags um 07:00 Uhr deutscher Zeit. npm- und Docker-Einträge sind vorbereitet und werden mit den jeweiligen Manifesten aktiviert.
- `.github/workflows/dependabot-auto-merge.yml` aktiviert Squash-Auto-Merge ausschließlich für verifizierte Dependabot-Patch-/Minor-Updates im selben Repository gegen den Standardbranch. Major-Updates bleiben manuell. Vorher müssen der Docker-Build für denselben Commit und sämtliche verpflichtenden Checks erfolgreich sein. Ohne verpflichtende Checks wird nicht automatisch gemergt.

### Einmalige Repository-Einrichtung

1. Leeres Repository erstellen und die Projektdateien pushen.
2. Unter **Settings → General → Pull Requests** „Allow auto-merge“ und Squash-Merges aktivieren.
3. Standardbranch über Ruleset/Branch Protection schützen: Pull Request erforderlich, Statuscheck **Docker build** verpflichtend, Branch vor Merge aktuell. Nach Implementierung zusätzlich Test-/Lintchecks verpflichtend machen. Den Check gegebenenfalls erst nach seinem ersten Lauf auswählen.
4. Für vollautomatische Dependabot-Merges keine manuelle Pflichtfreigabe verlangen; bei gewünschter Reviewpflicht wartet Auto-Merge auf diese Freigabe. Der Workflow umgeht keine Reviews und verwendet keinen persönlichen Zugriffstoken.
5. GitHub Actions und die verwendeten Actions gemäß Organisationsrichtlinie zulassen. Der Auto-Merge-Workflow braucht die im YAML angegebenen Schreibrechte; restriktive Organisationsrichtlinien können diese sperren.

Der privilegierte Auto-Merge-Workflow checkt keinen PR-Code aus und führt keine Skripte aus dem PR aus. Ein Image-Push zu GHCR/Docker Hub und automatisches Deployment sind noch nicht konfiguriert. Der Docker-Build ersetzt keine fachlichen Anwendungstests.
