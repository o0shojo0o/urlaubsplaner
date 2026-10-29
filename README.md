# Urlaubsplaner

Urlaub im Team planen und verwalten: mit Abteilungskalender, persönlichen Urlaubskonten und zentraler Mitarbeiterverwaltung.

![Dashboard mit synthetischen Demodaten](docs/screenshots/dashboard.jpg)

## Funktionen

- Urlaub direkt buchen, ändern und stornieren – auch halbe Tage.
- Monats-, Wochen-, Listen- und Jahreskalender für die eigene Abteilung.
- Individuelle Arbeitswochen, Feiertage, Jahreskonten und Überträge.
- Adminbereich für Mitarbeiter, Abteilungen und Einstellungen.

Buchungen sind sofort verbindlich und benötigen keine Freigabe. Admins können alle Abteilungen verwalten.

## Starten mit Docker

Docker mit Compose vorausgesetzt. Diese Datei als `compose.yaml` speichern:

```yaml
services:
  app:
    image: ghcr.io/o0shojo0o/urlaubsplaner:latest
    restart: unless-stopped
    ports:
      - '3000:3000'
    environment:
      APP_ORIGIN: ${APP_ORIGIN:-http://localhost:3000}
      COOKIE_SECURE: ${COOKIE_SECURE:-false}
      TRUST_PROXY: ${TRUST_PROXY:-false}
      TZ: Europe/Berlin
    volumes:
      - ./app-data:/app/data
```

```sh
docker compose up -d
```

[http://localhost:3000](http://localhost:3000) öffnen und direkt den ersten Administrator anlegen. Danach im Adminbereich Feiertage importieren und bestätigen, Mitarbeiter anlegen und Zugangslinks erzeugen.

Die Daten liegen in `./app-data`. Der Ordner und seine Besitzrechte werden beim Start automatisch vorbereitet. Die App läuft anschließend als Benutzer `node`.

## Eigene Domain und HTTPS

Für Zugriff über eine eigene Domain einen HTTPS-Reverse-Proxy einrichten und daneben eine `.env` anlegen:

```dotenv
APP_ORIGIN=https://urlaub.example.org
COOKIE_SECURE=true
TRUST_PROXY=true
```

`APP_ORIGIN` muss der Adresse im Browser entsprechen. `TRUST_PROXY=true` gilt für genau einen vertrauenswürdigen vorgeschalteten Proxy. HTTP ist im Produktionsbetrieb nur für `localhost` und `127.0.0.1` erlaubt.

## Backup und Updates

Vor einem Update ein Backup erstellen:

```sh
docker compose exec -e BACKUP_DIR=/app/data/backups app npm run backup
```

Backups zusätzlich außerhalb des Docker-Hosts aufbewahren. Anschließend aktualisieren:

```sh
docker compose pull
docker compose up -d
```

`latest` folgt dem letzten erfolgreich gebauten stabilen Release. Für eine feste Version `latest` im Compose-Beispiel durch einen veröffentlichten Versions-Tag ersetzen. Datenbankmigrationen laufen automatisch beim Start.

## Weitere Dokumentation

- [Betrieb und Wiederherstellung](docs/BETRIEB.md)
- [Entwicklung, Tests und Releases](docs/ENTWICKLUNG.md)
- [Fachliche Regeln](docs/FACHLICHE_REGELN.md)
- [API](docs/openapi.yaml), [Prüfprotokoll](docs/PRUEFPROTOKOLL.md) und [technischer Umsetzungsplan](docs/TECHNISCHER_UMSETZUNGSPLAN.md)
