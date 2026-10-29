# Fachliche Regeln

- Im Formular ist der letzte Urlaubstag **inklusive**. FullCalendar verwendet intern ein exklusives Ende; der Adapter übernimmt die Umrechnung.
- 1 interne Einheit = 0,5 Tage. Ein voller individueller Arbeitstag zählt als zwei Einheiten, unabhängig von seiner Stundenzahl.
- Neue Buchungen ab heute; Mitarbeiter ändern/stornieren ausschließlich vollständig zukünftige Buchungen. Admins können rückwirkend und für andere Personen mit Begründung eingreifen.
- Feiertagsjahre müssen ausdrücklich bestätigt und Jahreskonten vorhanden/offen sein. Fehlende Konfiguration wird nicht geraten.
- Jahresabschluss erst nach Jahresende. Übertrag nur einmal, in ein offenes Folgejahreskonto; ein geschlossenes Jahr wird nicht wieder geöffnet. Ausgelaufenes Guthaben wird nicht übertragen.
- Arbeitsplanwechsel beginnen in der Zukunft und schließen den vorherigen Plan am neuen Startdatum. Feiertags- und Planänderungen werden zunächst in einer zurückgerollten Transaktion geprüft; Speichern prüft den Vorschauzustand erneut und berechnet betroffene Zukunftsbuchungen atomar neu.
- Historische Buchungen bleiben erhalten. Änderungen, die laufenden Urlaub, geschlossene Kontojahre oder eine vollständig unbuchbar werdende Buchung betreffen, werden abgewiesen und verlangen eine ausdrückliche fachliche Korrektur.
- Bei Abteilungswechsel richtet sich auch die Sichtbarkeit historischer Kalenderereignisse nach der **aktuellen** Abteilung. Eigene Buchungen bleiben persönlich zugänglich.
- Arbeitsrechtliche Anspruchsquoten, Verfallsregeln und Aufbewahrungsfristen legt das Unternehmen fest. Ansprüche werden durch Admins gepflegt.
