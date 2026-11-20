// ============ WebSocket-Tests (Zero-Dep, node:test) ============
// Prüft Lobby-Limit, Reconnect-Token, Host-Rechte und gezielte Turn-Nachrichten.
// Node 18 hat keinen globalen WebSocket-Client – dort werden die Tests übersprungen.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.MEME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mememanu-ws-'));
const { server } = await import('../server.js');
const hasWS = typeof WebSocket === 'function';
const opts = { skip: hasWS ? false : 'global WebSocket missing (Node < 22)' };

let base;
let wsBase;
before(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  wsBase = base.replace(/^http/, 'ws');
});
after(async () => {
  server.closeAllConnections?.();
  await new Promise((r) => server.close(r));
});

function connect(query) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsBase}/ws?${query}`);
    const msgs = [];
    ws.onmessage = (e) => {
      try { msgs.push(JSON.parse(e.data)); } catch { /* ignore */ }
    };
    ws.onerror = () => reject(new Error('websocket error'));
    ws.onopen = () => resolve({ ws, msgs });
  });
}

function waitFor(client, type, ms = 2500) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const iv = setInterval(() => {
      const found = client.msgs.find((m) => m.type === type);
      if (found) { clearInterval(iv); clearTimeout(timer); resolve(found); }
      else if (Date.now() - started > ms) { clearInterval(iv); clearTimeout(timer); reject(new Error(`timeout waiting for ${type}`)); }
    }, 10);
    const timer = setTimeout(() => { clearInterval(iv); reject(new Error(`timeout waiting for ${type}`)); }, ms + 100);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('gleiche selfId mit falschem Token wird abgewiesen; richtiges Token reconnectet', opts, async () => {
  const host = await connect('room=WSTOK&name=Host&self=H&token=secret&pub=0&create=1');
  await waitFor(host, 'roster');
  const guest = await connect('room=WSTOK&name=Guest&self=G&token=gsecret');
  await waitFor(guest, 'roster');
  await waitFor(host, 'joined');

  const bad = await connect('room=WSTOK&name=Evil&self=H&token=wrong&create=1');
  const rejected = await waitFor(bad, 'rejected');
  assert.equal(rejected.reason, 'conflict');
  bad.ws.close();

  const again = await connect('room=WSTOK&name=Host&self=H&token=secret&create=1');
  const roster = await waitFor(again, 'roster');
  assert.equal(roster.hostId, 'H');
  assert.deepEqual(roster.players.map((p) => p.selfId).sort(), ['G', 'H']);
  await sleep(120);
  assert.ok(!host.msgs.some((m) => m.type === 'rejected'), 'alter Host darf nicht abgewiesen werden');
  assert.ok(!guest.msgs.some((m) => m.type === 'left' && m.selfId === 'H'), 'Reconnect darf kein left auslösen');

  again.ws.close(); guest.ws.close();
});

test('volle Lobby weist neue Spieler:innen mit reason=full ab und meldet max', opts, async () => {
  const host = await connect('room=WSFULL&name=Host&self=H2&token=t1&pub=1&max=2&create=1');
  await waitFor(host, 'roster');
  const guest = await connect('room=WSFULL&name=Guest&self=G2&token=t2');
  await waitFor(guest, 'roster');

  const third = await connect('room=WSFULL&name=Third&self=G3&token=t3');
  const rejected = await waitFor(third, 'rejected');
  assert.equal(rejected.reason, 'full');
  third.ws.close();

  const list = await (await fetch(base + '/api/lobbies')).json();
  const entry = list.find((l) => l.code === 'WSFULL');
  assert.ok(entry, 'öffentliche Lobby fehlt');
  assert.equal(entry.players, 2);
  assert.equal(entry.max, 2);

  host.ws.close(); guest.ws.close();
});

test('laufende Partie weist unbekannte selfIds ab; Host-Nachrichten sind host-only', opts, async () => {
  const host = await connect('room=WSRUN&name=Host&self=H3&token=t1&create=1');
  await waitFor(host, 'roster');
  const guest = await connect('room=WSRUN&name=Guest&self=G4&token=t2');
  await waitFor(guest, 'roster');

  // Gast darf kein start auslösen
  guest.ws.send(JSON.stringify({ type: 'start', players: [], cfg: {} }));
  await sleep(120);
  assert.ok(!host.msgs.some((m) => m.type === 'start'), 'Gast konnte die Partie starten');

  host.ws.send(JSON.stringify({ type: 'start', hostId: 'H3', players: [{ id: 'H3', name: 'Host' }, { id: 'G4', name: 'Guest' }], cfg: {} }));
  await waitFor(guest, 'start');

  const late = await connect('room=WSRUN&name=Late&self=G5&token=t3');
  const rejected = await waitFor(late, 'rejected');
  assert.equal(rejected.reason, 'started');
  late.ws.close();

  // turn geht nur an die Zielperson, nicht an den ganzen Raum
  host.ws.send(JSON.stringify({ type: 'turn', playerId: 'G4', tplKey: 'builtin_this-is-fine' }));
  await waitFor(guest, 'turn');
  await sleep(80);
  assert.ok(!host.msgs.some((m) => m.type === 'turn'), 'Turn darf nicht an den Host gehen');

  host.ws.close(); guest.ws.close();
});

test('doppelte Namen im Raum werden eindeutig', opts, async () => {
  const host = await connect('room=WSNAME&name=Same&self=N1&token=t1&create=1');
  await waitFor(host, 'roster');
  const guest = await connect('room=WSNAME&name=Same&self=N2&token=t2');
  const roster = await waitFor(guest, 'roster');
  const names = roster.players.map((p) => p.name).sort();
  assert.deepEqual(names, ['Same', 'Same (2)']);
  host.ws.close(); guest.ws.close();
});

test('unbekannter Code erzeugt keine Geister-Lobby; fremder create-Code wird abgewiesen', opts, async () => {
  const missing = await connect('room=WSNONE&name=Lost&self=L1&token=t1');
  const rejected = await waitFor(missing, 'rejected');
  assert.equal(rejected.reason, 'notfound');
  missing.ws.close();

  const host = await connect('room=WSTAKE&name=Host&self=H9&token=t1&create=1');
  await waitFor(host, 'roster');
  const thief = await connect('room=WSTAKE&name=Thief&self=H10&token=t2&create=1');
  const taken = await waitFor(thief, 'rejected');
  assert.equal(taken.reason, 'taken');
  thief.ws.close();
  host.ws.close();
});
