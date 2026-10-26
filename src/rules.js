'use strict';

// Zimmer-Konfiguration: Tageskontingent gesamt, Kontingent pro Person, gleichzeitige Plätze.
const ROOMS = {
  CS: { id: 'CS', name: 'Zimmer CS', dailyMinutes: 120, perPersonMinutes: 60, maxConcurrent: 2 },
  L: { id: 'L', name: 'Zimmer L', dailyMinutes: 360, perPersonMinutes: 180, maxConcurrent: 2 },
  S: { id: 'S', name: 'Zimmer S', dailyMinutes: 360, perPersonMinutes: 180, maxConcurrent: 2 },
};

const BUFFER_MINUTES = 20;
const STEP_MINUTES = 10;
const OPEN_FROM = 7 * 60;
const OPEN_UNTIL = 22 * 60;

function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return NaN;
  return h * 60 + min;
}

function toHHMM(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Belegter Zeitraum inkl. Puffer: [start, start + dauer + puffer)
function blockedRange(r) {
  const start = toMinutes(r.start);
  return [start, start + r.duration + BUFFER_MINUTES];
}

function usedMinutes(reservations, filter) {
  return reservations.filter(filter).reduce((sum, r) => sum + r.duration, 0);
}

// Maximale Anzahl gleichzeitig belegter Plätze im Intervall [from, to).
function maxOverlap(reservations, from, to) {
  const points = [];
  for (const r of reservations) {
    const [s, e] = blockedRange(r);
    const a = Math.max(s, from);
    const b = Math.min(e, to);
    if (a < b) points.push([a, 1], [b, -1]);
  }
  points.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let cur = 0;
  let max = 0;
  for (const [, d] of points) {
    cur += d;
    max = Math.max(max, cur);
  }
  return max;
}

/**
 * Prüft eine neue Reservierung gegen alle bestehenden.
 * Gibt eine Liste von Fehlermeldungen zurück (leer = gültig).
 */
function validateReservation(input, existing, people) {
  const errors = [];
  const room = ROOMS[input.room];
  if (!room) return ['Unbekanntes Zimmer.'];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date || '')) errors.push('Ungültiges Datum.');

  const person = people.find((p) => p.id === input.personId);
  if (!person) errors.push('Person nicht gefunden.');
  else if (person.room !== room.id) errors.push(`${person.name} gehört nicht zu ${room.name}.`);

  const start = toMinutes(input.start);
  const duration = Number(input.duration);
  if (Number.isNaN(start)) errors.push('Ungültige Startzeit.');
  else if (start % STEP_MINUTES !== 0) errors.push(`Startzeit muss im ${STEP_MINUTES}-Minuten-Raster liegen.`);

  if (!Number.isInteger(duration) || duration <= 0 || duration % STEP_MINUTES !== 0) {
    errors.push(`Dauer muss ein Vielfaches von ${STEP_MINUTES} Minuten sein.`);
  }
  if (errors.length) return errors;

  if (start < OPEN_FROM || start + duration > OPEN_UNTIL) {
    errors.push(`Schwimmbad ist nur von ${toHHMM(OPEN_FROM)} bis ${toHHMM(OPEN_UNTIL)} Uhr geöffnet.`);
  }

  const sameDay = existing.filter((r) => r.date === input.date);
  const sameRoom = sameDay.filter((r) => r.room === room.id);

  const roomUsed = usedMinutes(sameRoom, () => true);
  if (roomUsed + duration > room.dailyMinutes) {
    errors.push(`${room.name} hat heute nur noch ${room.dailyMinutes - roomUsed} Minuten übrig.`);
  }

  const personUsed = usedMinutes(sameRoom, (r) => r.personId === input.personId);
  if (personUsed + duration > room.perPersonMinutes) {
    errors.push(`${person.name} hat heute nur noch ${room.perPersonMinutes - personUsed} Minuten übrig.`);
  }

  const candidate = { start: input.start, duration };
  const [from, to] = blockedRange(candidate);

  const ownOverlap = sameDay.filter((r) => r.personId === input.personId);
  if (maxOverlap(ownOverlap, from, to) > 0) {
    errors.push(`${person.name} hat in diesem Zeitraum (inkl. ${BUFFER_MINUTES} Min. Puffer) schon eine Reservierung.`);
  }

  if (maxOverlap(sameRoom, from, to) >= room.maxConcurrent) {
    errors.push(
      `Über ${room.name} sind in diesem Zeitraum (inkl. ${BUFFER_MINUTES} Min. Puffer) schon ${room.maxConcurrent} Personen eingetragen.`
    );
  }

  return errors;
}

function roomSummary(roomId, date, reservations) {
  const room = ROOMS[roomId];
  const used = usedMinutes(reservations, (r) => r.date === date && r.room === roomId);
  return { ...room, usedMinutes: used, remainingMinutes: room.dailyMinutes - used };
}

module.exports = {
  ROOMS,
  BUFFER_MINUTES,
  STEP_MINUTES,
  OPEN_FROM,
  OPEN_UNTIL,
  toMinutes,
  toHHMM,
  blockedRange,
  validateReservation,
  roomSummary,
};
