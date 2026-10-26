# Schwimmbad-Reservierung

Kleine Web-App, mit der 10 Personen aus drei Zimmern Zeitslots im Schwimmbad reservieren.

## Regeln

| Zimmer | Kontingent pro Tag | pro Person | gleichzeitig |
|--------|-------------------|------------|--------------|
| CS     | 2 h               | 1 h        | max. 2       |
| L      | 6 h               | 3 h        | max. 2       |
| S      | 6 h               | 3 h        | max. 2       |

- Bei jeder Reservierung gibt man an, **über welches Zimmer** man reingeht, wer geht, die Startzeit und die Dauer.
- Startzeit und Dauer laufen im **10-Minuten-Raster** (10 min, 20 min, 30 min, …).
- Nach jedem Zeitslot gibt es **20 Minuten Puffer**. Der Puffer belegt den Platz (zählt also bei „max. 2 gleichzeitig“ mit),
  wird aber **nicht** vom Tageskontingent abgezogen.
- Eine Person kann keine zwei Reservierungen haben, die sich (inkl. Puffer) überschneiden.
- Ist das Tageskontingent eines Zimmers aufgebraucht, ist das Zimmer für den Tag **gesperrt**; ebenso
  kann eine Person mit aufgebrauchtem Kontingent nicht mehr gewählt werden.
- Öffnungszeiten: 07:00–22:00 Uhr.

Die Regeln stehen in `src/rules.js` und lassen sich dort anpassen.

## Online-Version (Claude-Artifact)

`artifact/schwimmbad.html` ist dieselbe App als einzelne Seite für ein Claude-Artifact:
https://claude.ai/artifact/Uvrcq31BqedFwBZjPJ6ME4 – die Reservierungen liegen in der gemeinsamen
Artifact-Datenbank (Sammlungen `people` und `reservations`).

## Lokal starten

```bash
npm start          # http://localhost:3000
npm test           # Regel-Tests
```

Keine Abhängigkeiten nötig (Node.js ≥ 18). Die Daten liegen in `data/data.json`
(anderer Pfad über `DATA_FILE=…`, anderer Port über `PORT=…`).
Beim ersten Start werden 10 Personen angelegt – CS: MC 1, MC 2 · L: MA, TA, AN, CE · S: DO, DA, MI, KE.
Namen lassen sich in der App unter „Personen verwalten“ ändern.
