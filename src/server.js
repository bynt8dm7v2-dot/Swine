'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const rules = require('./rules');

const PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'data.json');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function defaultData() {
  // 10 Personen, verteilt auf die drei Zimmer – Namen lassen sich in der App ändern.
  const layout = [['CS', 2], ['L', 4], ['S', 4]];
  const people = [];
  let n = 1;
  for (const [room, count] of layout) {
    for (let i = 0; i < count; i++) people.push({ id: crypto.randomUUID(), name: `Person ${n++}`, room });
  }
  return { people, reservations: [] };
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    const data = defaultData();
    save(data);
    return data;
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

let data = load();

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e5) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

function serveStatic(req, res, pathname) {
  const file = path.normalize(path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, { error: 'Forbidden' });
  fs.readFile(file, (err, content) => {
    if (err) return send(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': `${MIME[path.extname(file)] || 'application/octet-stream'}; charset=utf-8` });
    res.end(content);
  });
}

function dayState(date) {
  return {
    config: {
      bufferMinutes: rules.BUFFER_MINUTES,
      stepMinutes: rules.STEP_MINUTES,
      openFrom: rules.toHHMM(rules.OPEN_FROM),
      openUntil: rules.toHHMM(rules.OPEN_UNTIL),
    },
    rooms: Object.keys(rules.ROOMS).map((id) => rules.roomSummary(id, date, data.reservations)),
    people: data.people,
    reservations: data.reservations
      .filter((r) => r.date === date)
      .sort((a, b) => rules.toMinutes(a.start) - rules.toMinutes(b.start)),
  };
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', resource, id?]
  const [, resource, id] = parts;

  if (resource === 'state' && req.method === 'GET') {
    const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
    return send(res, 200, dayState(date));
  }

  if (resource === 'reservations' && req.method === 'POST' && !id) {
    const body = await readBody(req);
    const input = { date: body.date, room: body.room, personId: body.personId, start: body.start, duration: Number(body.duration) };
    const errors = rules.validateReservation(input, data.reservations, data.people);
    if (errors.length) return send(res, 400, { errors });
    const reservation = { id: crypto.randomUUID(), ...input, createdAt: new Date().toISOString() };
    data.reservations.push(reservation);
    save(data);
    return send(res, 201, reservation);
  }

  if (resource === 'reservations' && req.method === 'DELETE' && id) {
    const before = data.reservations.length;
    data.reservations = data.reservations.filter((r) => r.id !== id);
    if (data.reservations.length === before) return send(res, 404, { errors: ['Reservierung nicht gefunden.'] });
    save(data);
    return send(res, 200, { ok: true });
  }

  if (resource === 'people' && req.method === 'POST' && !id) {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    if (!name) return send(res, 400, { errors: ['Name fehlt.'] });
    if (!rules.ROOMS[body.room]) return send(res, 400, { errors: ['Unbekanntes Zimmer.'] });
    const person = { id: crypto.randomUUID(), name, room: body.room };
    data.people.push(person);
    save(data);
    return send(res, 201, person);
  }

  if (resource === 'people' && req.method === 'PUT' && id) {
    const body = await readBody(req);
    const person = data.people.find((p) => p.id === id);
    if (!person) return send(res, 404, { errors: ['Person nicht gefunden.'] });
    const name = String(body.name || '').trim();
    if (!name) return send(res, 400, { errors: ['Name fehlt.'] });
    person.name = name;
    save(data);
    return send(res, 200, person);
  }

  if (resource === 'people' && req.method === 'DELETE' && id) {
    if (data.reservations.some((r) => r.personId === id)) {
      return send(res, 400, { errors: ['Person hat noch Reservierungen – bitte zuerst löschen.'] });
    }
    data.people = data.people.filter((p) => p.id !== id);
    save(data);
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { errors: ['Unbekannte Anfrage.'] });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return serveStatic(req, res, url.pathname);
  } catch (e) {
    return send(res, 400, { errors: ['Ungültige Anfrage.'] });
  }
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`Schwimmbad-Reservierung läuft auf http://localhost:${PORT}`));
}

module.exports = server;
