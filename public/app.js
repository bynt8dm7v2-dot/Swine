'use strict';

const $ = (id) => document.getElementById(id);
let state = null;

const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const toHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const fmtDur = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function api(method, url, body) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error((json.errors || ['Fehler']).join('\n'));
  return json;
}

async function refresh() {
  state = await api('GET', `/api/state?date=${$('date').value}`);
  render();
}

const selectedRoom = () => document.querySelector('input[name=room]:checked')?.value;
const roomById = (id) => state.rooms.find((r) => r.id === id);
const personById = (id) => state.people.find((p) => p.id === id);
const personUsed = (pid) => state.reservations.filter((r) => r.personId === pid).reduce((s, r) => s + r.duration, 0);

// Wie viele Plätze sind im Intervall [from, to) maximal belegt (inkl. Puffer)?
function overlap(list, from, to) {
  const pts = [];
  for (const r of list) {
    const s = toMin(r.start);
    const e = s + r.duration + state.config.bufferMinutes;
    const a = Math.max(s, from), b = Math.min(e, to);
    if (a < b) pts.push([a, 1], [b, -1]);
  }
  pts.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let cur = 0, max = 0;
  for (const [, d] of pts) { cur += d; max = Math.max(max, cur); }
  return max;
}

function render() {
  renderRooms();
  renderRoomChoice();
  renderFormOptions();
  renderTimeline();
  renderList();
  renderPeople();
}

function renderRooms() {
  $('rooms').innerHTML = state.rooms.map((room) => {
    const pct = Math.min(100, (room.usedMinutes / room.dailyMinutes) * 100);
    const people = state.people.filter((p) => p.room === room.id);
    return `<div class="card room ${room.blocked ? 'blocked' : ''}" style="--c: var(--${room.id})">
      <h3>${esc(room.name)}${room.blocked ? ' <span class="badge">Gesperrt</span>' : ''}</h3>
      <div class="muted">${fmtDur(room.dailyMinutes)} pro Tag · ${fmtDur(room.perPersonMinutes)} pro Person · max. ${room.maxConcurrent} gleichzeitig</div>
      <div class="bar"><div style="width:${pct}%"></div></div>
      <div><strong>${fmtDur(room.remainingMinutes)}</strong> <span class="muted">übrig von ${fmtDur(room.dailyMinutes)}</span></div>
      <ul class="people-usage">${people.map((p) => `<li class="${personUsed(p.id) >= room.perPersonMinutes ? 'done' : ''}"><span>${esc(p.name)}</span><span class="muted">${fmtDur(personUsed(p.id))} / ${fmtDur(room.perPersonMinutes)}</span></li>`).join('')}</ul>
    </div>`;
  }).join('');
}

function renderRoomChoice() {
  // Zimmer mit aufgebrauchtem Tageskontingent sind gesperrt und nicht wählbar.
  const open = state.rooms.filter((r) => !r.blocked);
  const prev = selectedRoom();
  const current = open.some((r) => r.id === prev) ? prev : open[0]?.id;
  $('roomChoice').innerHTML = state.rooms.map((r) =>
    `<label class="${r.blocked ? 'disabled' : ''}"><input type="radio" name="room" value="${r.id}" ${r.id === current ? 'checked' : ''} ${r.blocked ? 'disabled' : ''}>
      ${esc(r.name)}${r.blocked ? ' – gesperrt' : ''}</label>`
  ).join('');
  $('newRoom').innerHTML = state.rooms.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
}

function renderFormOptions() {
  const room = roomById(selectedRoom());
  $('form').querySelector('button[type=submit]').disabled = !room;
  if (!room) {
    for (const id of ['person', 'start', 'duration']) $(id).innerHTML = '<option value="">–</option>';
    $('preview').textContent = 'Alle Zimmer sind für diesen Tag gesperrt.';
    return;
  }
  const personSel = $('person');
  const prevPerson = personSel.value;
  const people = state.people.filter((p) => p.room === room.id);
  const exhausted = (p) => personUsed(p.id) >= room.perPersonMinutes;
  personSel.innerHTML = people.map((p) =>
    `<option value="${p.id}" ${exhausted(p) ? 'disabled' : ''}>${esc(p.name)}${exhausted(p) ? ' (Zeit aufgebraucht)' : ''}</option>`
  ).join('') || '<option value="">– keine Personen in diesem Zimmer –</option>';
  const available = people.filter((p) => !exhausted(p));
  personSel.value = available.some((p) => p.id === prevPerson) ? prevPerson : available[0]?.id || '';

  const pid = personSel.value;
  const maxDur = Math.min(room.remainingMinutes, room.perPersonMinutes - (pid ? personUsed(pid) : 0));
  const durSel = $('duration');
  const prevDur = Number(durSel.value) || 0;
  const durs = [];
  for (let d = state.config.stepMinutes; d <= maxDur; d += state.config.stepMinutes) durs.push(d);
  durSel.innerHTML = durs.map((d) => `<option value="${d}">${fmtDur(d)}</option>`).join('')
    || '<option value="">– Kontingent aufgebraucht –</option>';
  if (durs.includes(prevDur)) durSel.value = prevDur;
  else if (durs.length) durSel.value = Math.min(durs[durs.length - 1], 20);

  const dur = Number(durSel.value) || state.config.stepMinutes;
  const roomRes = state.reservations.filter((r) => r.room === room.id);
  const ownRes = state.reservations.filter((r) => r.personId === pid);
  const startSel = $('start');
  const prevStart = startSel.value;
  const open = toMin(state.config.openFrom), close = toMin(state.config.openUntil);
  let html = '';
  for (let t = open; t + dur <= close; t += state.config.stepMinutes) {
    const to = t + dur + state.config.bufferMinutes;
    const full = overlap(roomRes, t, to) >= room.maxConcurrent || overlap(ownRes, t, to) > 0;
    html += `<option value="${toHHMM(t)}" ${full ? 'disabled' : ''}>${toHHMM(t)}${full ? ' (belegt)' : ''}</option>`;
  }
  startSel.innerHTML = html;
  const firstFree = [...startSel.options].find((o) => !o.disabled);
  const prevOpt = [...startSel.options].find((o) => o.value === prevStart && !o.disabled);
  startSel.value = prevOpt ? prevStart : firstFree ? firstFree.value : '';
  updatePreview();
}

function updatePreview() {
  const start = $('start').value, dur = Number($('duration').value);
  if (!start || !dur) { $('preview').textContent = ''; return; }
  const end = toMin(start) + dur;
  $('preview').textContent = `Schwimmbad ${start}–${toHHMM(end)} Uhr, danach ${state.config.bufferMinutes} Min. Puffer bis ${toHHMM(end + state.config.bufferMinutes)} Uhr.`;
}

function assignLanes(list) {
  const lanes = [];
  const sorted = [...list].sort((a, b) => toMin(a.start) - toMin(b.start));
  for (const r of sorted) {
    const s = toMin(r.start);
    let lane = lanes.findIndex((endAt) => endAt <= s);
    if (lane === -1) { lane = lanes.length; lanes.push(0); }
    lanes[lane] = s + r.duration + state.config.bufferMinutes;
    r._lane = lane;
  }
  return Math.max(lanes.length, 2);
}

function renderTimeline() {
  const open = toMin(state.config.openFrom), close = toMin(state.config.openUntil);
  const span = close - open;
  const pos = (m) => `${((m - open) / span) * 100}%`;
  let axis = '';
  for (let h = Math.ceil(open / 60) * 60; h <= close; h += 60) axis += `<span style="left:${pos(h)}">${h / 60}</span>`;

  $('timeline').innerHTML = state.rooms.map((room) => {
    const list = state.reservations.filter((r) => r.room === room.id).map((r) => ({ ...r }));
    const laneCount = assignLanes(list);
    const lanes = Array.from({ length: laneCount }, (_, i) => {
      const blocks = list.filter((r) => r._lane === i).map((r) => {
        const s = toMin(r.start);
        const total = r.duration + state.config.bufferMinutes;
        const name = personById(r.personId)?.name || '?';
        return `<div class="tl-block" style="left:${pos(s)}; width:${(total / span) * 100}%" title="${esc(name)}: ${r.start}–${toHHMM(s + r.duration)} (+${state.config.bufferMinutes} Min. Puffer)">
          <div class="tl-res" style="flex:${r.duration}">${esc(name)}</div><div class="tl-buf" style="flex:${state.config.bufferMinutes}"></div></div>`;
      }).join('');
      return `<div class="tl-lane">${blocks}</div>`;
    }).join('');
    return `<div class="tl-room" style="--c: var(--${room.id})"><h4>${esc(room.name)}</h4>
      <div class="tl-scroll"><div class="tl-inner">${lanes}<div class="tl-axis">${axis}</div></div></div></div>`;
  }).join('');
}

function renderList() {
  if (!state.reservations.length) { $('list').innerHTML = '<li class="muted">Noch keine Reservierungen für diesen Tag.</li>'; return; }
  $('list').innerHTML = state.reservations.map((r) => {
    const end = toMin(r.start) + r.duration;
    const name = personById(r.personId)?.name || '?';
    return `<li style="--c: var(--${r.room})"><span><span class="tag">${r.room}</span><strong>${r.start}–${toHHMM(end)}</strong> ${esc(name)}
      <span class="muted">(${fmtDur(r.duration)}, Puffer bis ${toHHMM(end + state.config.bufferMinutes)})</span></span>
      <button class="ghost" data-del="${r.id}">Löschen</button></li>`;
  }).join('');
}

function renderPeople() {
  $('people').innerHTML = state.rooms.map((room) => {
    const people = state.people.filter((p) => p.room === room.id);
    return `<h4>${esc(room.name)} (${people.length})</h4>` + people.map((p) =>
      `<div class="person-row"><input value="${esc(p.name)}" data-rename="${p.id}">
       <button class="ghost" data-delperson="${p.id}">Entfernen</button></div>`).join('');
  }).join('') + `<p class="muted">Insgesamt ${state.people.length} Personen.</p>`;
}

function showError(e) { $('errors').textContent = e.message; }

$('form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('errors').textContent = '';
  try {
    await api('POST', '/api/reservations', {
      date: $('date').value, room: selectedRoom(), personId: $('person').value,
      start: $('start').value, duration: Number($('duration').value),
    });
    await refresh();
  } catch (e) { showError(e); }
});

$('roomChoice').addEventListener('change', renderFormOptions);
$('person').addEventListener('change', renderFormOptions);
$('duration').addEventListener('change', renderFormOptions);
$('start').addEventListener('change', updatePreview);
$('date').addEventListener('change', refresh);

document.addEventListener('click', async (ev) => {
  const del = ev.target.dataset.del;
  const delPerson = ev.target.dataset.delperson;
  try {
    if (del && confirm('Reservierung löschen?')) { await api('DELETE', `/api/reservations/${del}`); await refresh(); }
    if (delPerson && confirm('Person entfernen?')) { await api('DELETE', `/api/people/${delPerson}`); await refresh(); }
  } catch (e) { alert(e.message); }
});

document.addEventListener('change', async (ev) => {
  const id = ev.target.dataset.rename;
  if (!id) return;
  try { await api('PUT', `/api/people/${id}`, { name: ev.target.value }); await refresh(); } catch (e) { alert(e.message); }
});

$('addPerson').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try {
    await api('POST', '/api/people', { name: $('newName').value, room: $('newRoom').value });
    $('newName').value = '';
    await refresh();
  } catch (e) { alert(e.message); }
});

$('date').value = today();
refresh();
setInterval(() => { if (!document.hidden && !['SELECT', 'INPUT'].includes(document.activeElement?.tagName)) refresh(); }, 30000);
