# Betrieb und Wiederherstellung

### Hinter einem HTTPS-Proxy

In einer `.env` neben der Compose-Datei die tatsächliche Origin und sichere Cookies setzen:

```dotenv
APP_ORIGIN=https://urlaub.example.org
COOKIE_SECURE=true
TRUST_PROXY=true
```

Nur `TRUST_PROXY=true` verwenden, wenn exakt ein vertrauenswürdiger Reverse-Proxy vorgeschaltet ist. Die Compose-Datei im Repository bindet den Port an die Host-Loopbackadresse; ein Proxy auf dem Host kann ihn weiterleiten. Ein Proxy in einem anderen Container benötigt eine entsprechend angepasste Netzwerkverbindung. Die App akzeptiert schreibende Browseranfragen nur von `APP_ORIGIN`. HTTP in Produktionskonfiguration ist ausschließlich für localhost erlaubt.

### Lokaler Docker-Desktop-Sonderfall

Falls eine alte, root-eigene Datei `~/.docker/buildx/current` den Compose-Build mit „permission denied“ blockiert, kann der vorhandene Builder explizit gewählt werden, ohne Dateirechte zu ändern:

```sh
docker build --builder desktop-linux -t urlaubsplaner:local .
docker compose up -d --no-build
```

Das ist ein lokaler Docker-Konfigurationsfehler; auf einem normal eingerichteten Docker-Host genügt der Schnellstart.

## Backup, Wiederherstellung und Updates

Lokale Sicherung:

```sh
npm run backup
npm run restore:check -- backups/DATEINAME.db
```

Im Container:

```sh
docker compose exec -e BACKUP_DIR=/app/data/backups app npm run backup
```

Die Backup-API erstellt einen konsistenten SQLite-Snapshot, prüft Foreign Keys und Integrität. `restore:check` kopiert eine Sicherung in ein temporäres Verzeichnis und prüft sie dort einschließlich Kontoüberziehungen. Backups zusätzlich regelmäßig verschlüsselt vom Docker-Host wegkopieren; eine Sicherung im selben Volume allein schützt nicht vor Host-/Volumeverlust.

Wiederherstellung bei **gestoppter App**:

1. `docker compose stop app` ausführen.
2. Das bestehende Volume vorab separat sichern. Die gewünschte, mit `restore:check` geprüfte `.db` in das Volume unter `/app/data/urlaubsplaner.db` kopieren; alte zu dieser Datenbank gehörige `-wal`-/`-shm`-Dateien dürfen nicht mit einer anderen Sicherung vermischt werden. Dateirechte für UID/GID 1000 erhalten.
3. `docker compose up -d` starten; Healthcheck, Anmeldung, Kontostände und Stichproben von Buchungen prüfen.

Vor Updates Backup erstellen, dann `git pull` und `docker compose up -d --build`. Versionierte Prisma-Migrationen laufen vor dem Serverstart; bei Migrationsfehlern startet der Server nicht. Ein Container-Rollback ersetzt kein Datenbank-Rollback. Startziele: tägliche externe Sicherung (RPO ≤24 h) und monatlich geübter Restore (RTO ≤4 h).

## Datenverzeichnis und Containerstart

Das Release-Beispiel in der README verwendet `./app-data:/app/data`. Docker legt den Host-Ordner bei Bedarf an. Das Image korrigiert beim Start dessen Besitzrechte auf UID/GID 1000:1000 und startet Migrationen und App als `node`. Bei explizitem Start mit `user:` ohne Root-Rechte müssen die Rechte bereits passen. Bei eingeschränkten Capabilities benötigt die Vorbereitung `CHOWN`, `DAC_OVERRIDE`, `SETUID` und `SETGID`.

Die Compose-Datei im Repository verwendet für lokale Builds weiterhin ein benanntes Volume. Beim Wechsel zum Bind-Mount die Daten bei gestoppter App übernehmen oder den bisherigen Mount beibehalten. `docker compose down -v` löscht benannte Volumes.
