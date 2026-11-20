// ============ Smoke-Test (Zero-Dep): node --test ============
// Deckt die API-Grenzen ab: Health, Statisch, Upload-Roundtrip,
// Mime-Hygiene (Client-Mime landet nie als Content-Type), Fehlerpfade, Delete,
// Accounts (Register/Login/Me), Private-Sichtbarkeit, Quota, Voting, Lobbys.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

// Data-Verzeichnis isolieren, BEVOR server.js importiert wird
process.env.MEME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mememanu-test-'));
process.env.MEME_USER_QUOTA_BYTES = '120'; // kleiner Quota, damit der 413-Pfad testbar ist

const { server } = await import('../server.js');

let base;
before(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.closeAllConnections?.();
  await new Promise((r) => server.close(r));
});

// 1×1-Pixel-PNG
const PNG1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_BYTES = Buffer.from(PNG1, 'base64').length;
const GIF1 = 'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const apiPost = (path, obj, cookie) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(obj) });
const post = (obj, cookie) => apiPost('/api/upload', obj, cookie);

test('GET /health meldet ok', async () => {
  const res = await fetch(base + '/health');
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
});

test('GET / servt index.html', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(await res.text(), /MemeManufaktur/);
});

test('statische Dateien liefern ETag und antworten mit 304', async () => {
  const first = await fetch(base + '/');
  const etag = first.headers.get('etag');
  assert.ok(etag, 'ETag fehlt');
  const again = await fetch(base + '/', { headers: { 'If-None-Match': etag } });
  assert.equal(again.status, 304);
});

test('Web-App-Manifest wird mit korrektem MIME-Typ serviert', async () => {
  const res = await fetch(base + '/manifest.webmanifest');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/manifest\+json/);
});

test('Datenverzeichnis, Quellcode und Tests sind nicht statisch erreichbar', async () => {
  for (const p of ['/data/users.json', '/data/library.json', '/data/uploads/', '/server.js', '/package.json', '/.git/config', '/test/smoke.mjs']) {
    assert.equal((await fetch(base + p)).status, 404, `${p} darf nicht ausgeliefert werden`);
  }
});

test('SVG-Uploads werden abgelehnt (kein Skript im App-Origin)', async () => {
  const id = 'smoke_svg_' + Math.random().toString(36).slice(2, 8);
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
  const res = await post({ id, name: 'XSS', mime: 'image/svg+xml', data: svg });
  assert.equal(res.status, 400);
  assert.equal((await fetch(base + `/uploads/${id}`)).status, 404);
});

test('anonyme Uploads dürfen bestehende Einträge nicht überschreiben', async () => {
  const id = 'smoke_anon_' + Math.random().toString(36).slice(2, 8);
  assert.equal((await post({ id, data: PNG1 })).status, 200);
  assert.equal((await post({ id, data: PNG1 })).status, 403);
});

test('Overwrite mit anderer Endung räumt die alte Datei auf', async () => {
  const id = 'smoke_ext_' + Math.random().toString(36).slice(2, 8);
  const u = await auth('/api/register', { email: `ext-${Date.now()}@test.dev`, password: 'geheim123' });
  assert.equal((await post({ id, data: PNG1 }, u.cookie)).status, 200);
  assert.equal((await post({ id, data: GIF1 }, u.cookie)).status, 200);
  const img = await fetch(base + `/uploads/${id}`, { headers: { cookie: u.cookie } });
  assert.equal(img.status, 200);
  assert.match(img.headers.get('content-type'), /image\/gif/);
  assert.equal((await fetch(base + `/uploads/${id}.png`)).status, 404);
});

test('Upload-Roundtrip: Datei + Bibliothekseintrag + korrekt servter Type', async () => {
  const id = 'smoke_rt_' + Math.random().toString(36).slice(2, 8);
  assert.equal((await post({ id, name: 'Smoke', mime: 'image/png', data: PNG1 })).status, 200);

  const lib = await (await fetch(base + '/api/library')).json();
  const entry = lib.find((x) => x.id === id);
  assert.ok(entry, 'Eintrag in library.json fehlt');
  assert.equal(entry.mime, 'image/png');

  const img = await fetch(base + `/uploads/${id}`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.ok((await img.arrayBuffer()).byteLength > 0);
});

test('Client-Mime wird nicht als Content-Type übernommen (XSS-Schutz)', async () => {
  const id = 'smoke_xss_' + Math.random().toString(36).slice(2, 8);
  await post({ id, mime: 'text/html', data: PNG1 }); // PNG-Bytes mit Lügen-Mime
  const img = await fetch(base + `/uploads/${id}`);
  assert.equal(img.status, 200);
  // nicht text/html, sondern der von uns abgeleitete Type
  assert.equal(img.headers.get('content-type'), 'image/png');
});

test('Ungültige IDs und Körper werden abgelehnt', async () => {
  assert.equal((await post({ id: '../boom', data: PNG1 })).status, 400);
  assert.equal((await post({ id: 'ok_id' })).status, 400); // missing data
  const bad = await fetch(base + '/api/upload', { method: 'POST', body: '{kein json' });
  assert.equal(bad.status, 400);
});

test('DELETE entfernt Upload aus Bibliothek und Disk', async () => {
  const id = 'smoke_del_' + Math.random().toString(36).slice(2, 8);
  const up = await post({ id, data: PNG1 });
  const anon = (up.headers.get('set-cookie') || '').match(/mm_anon=([0-9a-f]{32})/)?.[1];
  assert.ok(anon, 'anonymes Upload-Cookie fehlt');
  assert.equal((await fetch(base + `/api/library/${id}`, { method: 'DELETE', headers: { cookie: `mm_anon=${anon}` } })).status, 200);
  const lib = await (await fetch(base + '/api/library')).json();
  assert.ok(!lib.some((x) => x.id === id));
  assert.equal((await fetch(base + `/uploads/${id}`)).status, 404);
});

test('anonyme Uploads gehören nur dem Browser-Cookie', async () => {
  const id = 'smoke_anonown_' + Math.random().toString(36).slice(2, 8);
  const up = await post({ id, data: PNG1 });
  const anon = (up.headers.get('set-cookie') || '').match(/mm_anon=([0-9a-f]{32})/)?.[1];
  assert.ok(anon, 'anonymes Upload-Cookie fehlt');

  const own = await (await fetch(base + '/api/library', { headers: { cookie: `mm_anon=${anon}` } })).json();
  assert.equal(own.find((x) => x.id === id)?.own, true);
  const foreign = await (await fetch(base + '/api/library')).json();
  assert.equal(foreign.find((x) => x.id === id)?.own, false);

  assert.equal((await fetch(base + `/api/library/${id}`, { method: 'DELETE' })).status, 403);
  assert.equal((await fetch(base + `/api/library/${id}`, { method: 'DELETE', headers: { cookie: 'mm_anon=' + 'f'.repeat(32) } })).status, 403);
  assert.equal((await fetch(base + `/api/library/${id}`, { method: 'DELETE', headers: { cookie: `mm_anon=${anon}` } })).status, 200);
});

// ---------- Accounts + Voting ----------
const auth = async (path, obj) => {
  const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
  const m = (res.headers.get('set-cookie') || '').match(/mm_sid=([0-9a-f]{48})/);
  return { status: res.status, d: await res.json().catch(() => ({})), cookie: m ? `mm_sid=${m[1]}` : null };
};
const getAs = (path, cookie) => fetch(base + path, { headers: cookie ? { cookie } : {} });

test('Register validiert Eingaben und Lehnt Duplikate ab', async () => {
  assert.equal((await auth('/api/register', { email: 'keine', password: 'geheim123' })).status, 400);
  assert.equal((await auth('/api/register', { email: 'a@b.cc', password: 'kurz' })).status, 400);
  const a = await auth('/api/register', { email: 'alice@test.dev', password: 'geheim123' });
  assert.equal(a.status, 200);
  assert.ok(a.cookie, 'Set-Cookie fehlt');
  assert.equal((await auth('/api/register', { email: 'alice@test.dev', password: 'geheim123' })).status, 409);
});

test('Login: falsches PW 401, richtiges 200; /api/me ohne Cookie 401', async () => {
  assert.equal((await auth('/api/login', { email: 'alice@test.dev', password: 'falsch123' })).status, 401);
  const ok = await auth('/api/login', { email: 'alice@test.dev', password: 'geheim123' });
  assert.equal(ok.status, 200);
  assert.equal((await getAs('/api/me')).status, 401);
  const me = await (await getAs('/api/me', ok.cookie)).json();
  assert.equal(me.user.email, 'alice@test.dev');
  assert.equal(me.quota, 120); // env-Quota wird durchgereicht
});

test('Private Entries: nur für den Eigentümer sichtbar', async () => {
  const a = await auth('/api/login', { email: 'alice@test.dev', password: 'geheim123' });
  const id = 'smoke_own_' + Math.random().toString(36).slice(2, 8);
  assert.equal((await post({ id, data: PNG1 }, a.cookie)).status, 200);
  const own = await (await getAs('/api/library', a.cookie)).json();
  assert.ok(own.some((x) => x.id === id && x.own === true), 'eigener Eintrag fehlt');
  const anon = await (await getAs('/api/library')).json();
  assert.ok(!anon.some((x) => x.id === id), 'privater Eintrag für Anonymous sichtbar');
  assert.equal((await getAs(`/uploads/${id}`, a.cookie)).status, 200);
  assert.equal((await getAs(`/uploads/${id}`)).status, 401); // privat braucht Session
  const b = await auth('/api/register', { email: `bob-private-${Date.now()}@test.dev`, password: 'geheim123' });
  assert.equal((await apiPost('/api/vote', { id }, b.cookie)).status, 404, 'fremde private Einträge sind nicht votebar');
});

test('Quota: zweite Upload über Grenze -> 413', async () => {
  const a = await auth('/api/login', { email: 'alice@test.dev', password: 'geheim123' });
  const me = await (await getAs('/api/me', a.cookie)).json();
  assert.ok(me.used >= PNG_BYTES && me.used <= 120, 'used-Berechnung unplausibel');
  assert.equal((await post({ id: 'smoke_q2_' + Math.random().toString(36).slice(2, 8), data: PNG1 }, a.cookie)).status, 413);
});

test('Voting: Konto nötig, Toggle pro Account, Sortierung nach Stimmen', async () => {
  const c = await auth('/api/register', { email: 'carol@test.dev', password: 'geheim123' });
  const id = 'smoke_vote_' + Math.random().toString(36).slice(2, 8);
  assert.equal((await post({ id, data: PNG1 }, c.cookie)).status, 200);
  assert.equal((await apiPost('/api/vote', { id })).status, 401); // ohne Konto: keine Stimme
  const v1 = await apiPost('/api/vote', { id }, c.cookie);
  assert.equal((await v1.json()).votes, 1);
  const list = await (await getAs('/api/library', c.cookie)).json();
  assert.equal(list[0].id, id, 'meistgestimmter Entry muss oben stehen');
  const v2 = await apiPost('/api/vote', { id }, c.cookie);
  assert.equal((await v2.json()).votes, 0); // nochmal treffen = entvotescht
});

test('parallele Votes gehen nicht verloren', async () => {
  const id = 'smoke_par_' + Math.random().toString(36).slice(2, 8);
  await post({ id, data: PNG1 }); // geteilter Eintrag
  const stamp = Date.now();
  const users = await Promise.all([0, 1, 2, 3].map((i) =>
    auth('/api/register', { email: `par-${stamp}-${i}@test.dev`, password: 'geheim123' })));
  const results = await Promise.all(users.map((u) => apiPost('/api/vote', { id }, u.cookie)));
  results.forEach((r) => assert.equal(r.status, 200));
  const list = await (await getAs('/api/library')).json();
  assert.equal(list.find((x) => x.id === id).votes.length, 4, 'parallele Votes verloren');
});

test('Lobbys: nur öffentliche werden gelistet, leere fallen raus', async () => {
  // Node 20 hat keinen globalen WebSocket-Client – hier reicht das Upgrade-Handshake,
  // weil der Raum schon bei der Verbindung registriert wird.
  const openWs = (q) => new Promise((resolve) => {
    const req = http.get(base + '/ws?' + q, { headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': 'AAAAAAAAAAAAAAAAAAAAAA==', 'Sec-WebSocket-Version': '13' } }, (res) => resolve(res));
    req.on('upgrade', (res) => resolve(res)); // Node feuert bei 101 'upgrade', nicht 'response'
    req.on('error', () => resolve(null));
  });
  const pub = await openWs('room=LPUB&lobby=Testlobby&pub=1&name=Host&create=1');
  const priv = await openWs('room=LPRIV&name=Gast&create=1');
  assert.equal(pub.statusCode, 101);
  assert.equal(priv.statusCode, 101);
  const list = await (await fetch(base + '/api/lobbies')).json();
  const entry = list.find((l) => l.code === 'LPUB');
  assert.ok(entry && entry.name === 'Testlobby' && entry.players === 1, 'öffentliche Lobby fehlt');
  assert.equal(entry.max, 12);
  assert.ok(!list.some((l) => l.code === 'LPRIV'), 'private Lobby darf nicht gelistet sein');
  pub.socket.destroy();
  priv.socket.destroy();
  await new Promise((r) => setTimeout(r, 200)); // close-Handler auslaufen lassen
  assert.ok(!((await (await fetch(base + '/api/lobbies')).json()).some((l) => l.code === 'LPUB')), 'leere Lobby muss aus der Liste fallen');
});

test('Delete: fremde private Entries nur vom Eigentümer', async () => {
  const b = await auth('/api/register', { email: 'bob@test.dev', password: 'geheim123' });
  const id = 'smoke_own2_' + Math.random().toString(36).slice(2, 8);
  assert.equal((await post({ id, data: PNG1 }, b.cookie)).status, 200);
  const del = (cookie) => fetch(base + `/api/library/${id}`, { method: 'DELETE', headers: cookie ? { cookie } : {} });
  assert.equal((await del()).status, 403); // anonymous: gehört bob
  assert.equal((await del('mm_sid=' + 'f'.repeat(48))).status, 403); //Session unbekannt -> anonymous
  assert.equal((await del(b.cookie)).status, 200);
});

// ============ Textzonen (pure Logik, ohne DOM) ============
import { zoneFor, layerPatch, normLayers } from '../js/textzones.js';

test('normLayers clamps and drops empty layers', () => {
  const norm = normLayers([
    { text: 'hi', xF: 2, yF: -1, fsF: 0.5 },
    { text: '   ' },
    { text: 'x'.repeat(250) },
  ]);
  assert.equal(norm.length, 2);
  assert.equal(norm[0].xF, 1); assert.equal(norm[0].yF, 0); assert.equal(norm[0].fsF, 0.2);
  assert.equal(norm[1].text.length, 200); assert.equal(norm[1].xF, 0.5);
  assert.deepEqual(normLayers(null), []);
});

test('text zones: lookup and layer patch', () => {
  assert.ok(zoneFor('builtin_awesome-face').top.yF > 0);
  assert.equal(zoneFor('tpl_upload_xyz'), null); // Uploads bleiben auf Standardposition
  const mc = { cw: 640, ch: 820 };
  const p = layerPatch(mc, zoneFor('builtin_awesome-face').top);
  assert.equal(p.y, Math.round(820 * 0.25));
  assert.equal(p.x, Math.round(640 * 0.78));
  assert.equal(layerPatch(mc, null), null);
});
