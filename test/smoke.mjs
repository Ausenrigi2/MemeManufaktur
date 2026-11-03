// ============ Smoke-Test (Zero-Dep): node --test ============
// Deckt die API-Grenzen ab: Health, Statisch, Upload-Roundtrip,
// Mime-Hygiene (Client-Mime landet nie als Content-Type), Fehlerpfade, Delete.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Data-Verzeichnis isolieren, BEVOR server.js importiert wird
process.env.MEME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mememanu-test-'));

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
const post = (obj) => fetch(base + '/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

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
  await post({ id, data: PNG1 });
  assert.equal((await fetch(base + `/api/library/${id}`, { method: 'DELETE' })).status, 200);
  const lib = await (await fetch(base + '/api/library')).json();
  assert.ok(!lib.some((x) => x.id === id));
  assert.equal((await fetch(base + `/uploads/${id}`)).status, 404);
});
