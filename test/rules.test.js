'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { validateReservation } = require('../src/rules');

const people = [
  { id: 'a', name: 'Anna', room: 'CS' },
  { id: 'b', name: 'Ben', room: 'CS' },
  { id: 'c', name: 'Clara', room: 'L' },
  { id: 'd', name: 'Dan', room: 'L' },
  { id: 'e', name: 'Eva', room: 'L' },
];
const date = '2026-10-26';
const res = (personId, room, start, duration) => ({ id: `${personId}${start}`, date, personId, room, start, duration });

test('gültige Reservierung', () => {
  assert.deepStrictEqual(validateReservation(res('a', 'CS', '10:00', 20), [], people), []);
});

test('Person muss zum Zimmer gehören', () => {
  const errs = validateReservation(res('a', 'L', '10:00', 20), [], people);
  assert.match(errs.join(), /gehört nicht/);
});

test('maximal 2 gleichzeitig pro Zimmer, Puffer zählt mit', () => {
  const existing = [res('c', 'L', '10:00', 30), res('d', 'L', '10:00', 30)];
  // 10:30–10:50 ist noch Puffer → belegt
  assert.match(validateReservation(res('e', 'L', '10:40', 10), existing, people).join(), /schon 2 Personen/);
  // ab 10:50 wieder frei
  assert.deepStrictEqual(validateReservation(res('e', 'L', '10:50', 10), existing, people), []);
});

test('Kontingent pro Person (CS: 1 h)', () => {
  const existing = [res('a', 'CS', '08:00', 50)];
  assert.match(validateReservation(res('a', 'CS', '12:00', 20), existing, people).join(), /nur noch 10 Minuten/);
  assert.deepStrictEqual(validateReservation(res('a', 'CS', '12:00', 10), existing, people), []);
});

test('Tageskontingent pro Zimmer (L: 6 h)', () => {
  const existing = [res('c', 'L', '08:00', 180), res('d', 'L', '08:00', 170)];
  assert.match(validateReservation(res('e', 'L', '14:00', 20), existing, people).join(), /Zimmer L hat heute nur noch 10/);
});

test('eigene Reservierungen dürfen sich nicht überschneiden', () => {
  const existing = [res('c', 'L', '10:00', 20)];
  assert.match(validateReservation(res('c', 'L', '10:30', 10), existing, people).join(), /schon eine Reservierung/);
});

test('Raster und Öffnungszeiten', () => {
  assert.match(validateReservation(res('a', 'CS', '10:05', 20), [], people).join(), /Raster/);
  assert.match(validateReservation(res('a', 'CS', '21:50', 20), [], people).join(), /geöffnet/);
  assert.match(validateReservation(res('a', 'CS', '10:00', 15), [], people).join(), /Vielfaches/);
});

test('Zimmer ist gesperrt, wenn das Tageskontingent aufgebraucht ist', () => {
  const existing = [res('a', 'CS', '08:00', 60), res('b', 'CS', '08:00', 60)];
  assert.match(validateReservation(res('a', 'CS', '15:00', 10), existing, people).join(), /gesperrt/);
  // anderer Tag ist wieder frei
  assert.deepStrictEqual(validateReservation({ ...res('a', 'CS', '15:00', 10), date: '2026-10-27' }, existing, people), []);
});
