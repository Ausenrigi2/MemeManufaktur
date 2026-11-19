// ============ Invarianten-Test (Zero-Dep): node --test ============
// Prüft den eingebauten Template-Katalog gegen den Dateibestand sowie
// i18n-Parität und die kleinen Utils (roomCode, shuffle).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUILTIN_GROUPS } from '../js/packs.js';
import { I18N, roomCode, shuffle } from '../js/lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TPL_DIR = path.join(ROOT, 'assets', 'templates');

const allFiles = BUILTIN_GROUPS.flatMap((g) => g.files);
const keys = allFiles.map(([key]) => key);
const removed = BUILTIN_GROUPS.flatMap((g) => g.removed || []);

test('jede im Katalog gelistete Template-Datei existiert', () => {
  for (const [key, , ext] of allFiles) {
    const file = path.join(TPL_DIR, `${key}.${ext}`);
    assert.ok(fs.existsSync(file), `Datei fehlt: assets/templates/${key}.${ext}`);
  }
});

test('kein Template-Key ist doppelt im Katalog', () => {
  const seen = new Set();
  for (const key of keys) {
    assert.ok(!seen.has(key), `Key doppelt: ${key}`);
    seen.add(key);
  }
  assert.equal(seen.size, keys.length);
});

test('entfernte Keys tauchen nicht mehr in den aktiven Dateien auf', () => {
  const active = new Set(keys);
  for (const key of removed) {
    assert.ok(!active.has(key), `Key ${key} ist in removed, aber weiterhin aktiv`);
  }
});

test('am 2026-11-19 entfernte Dateien sind weder auf der Platte noch aktiv, aber in removed', () => {
  const dated = [
    'advice-pie',
    'icon-on-my-wikipedia-userbox',
    'party-parrot',
    'screamer2',
    'screamer3',
    'deep-fried-meme',
  ];
  const removedSet = new Set(removed);
  const active = new Set(keys);
  for (const key of dated) {
    assert.ok(removedSet.has(key), `removed fehlt: ${key}`);
    assert.ok(!active.has(key), `Key ist noch aktiv: ${key}`);
    const leftovers = fs.readdirSync(TPL_DIR).filter((f) => f.startsWith(`${key}.`));
    assert.deepEqual(leftovers, [], `Datei noch vorhanden: ${leftovers.join(', ')}`);
  }
});

test('DE und EN haben exakt dieselben i18n-Keys', () => {
  const de = Object.keys(I18N.de).sort();
  const en = Object.keys(I18N.en).sort();
  assert.deepEqual(en, de);
});

test('kein i18n-Wert ist leer', () => {
  for (const lang of ['de', 'en']) {
    for (const [key, value] of Object.entries(I18N[lang])) {
      assert.equal(typeof value, 'string', `${lang}.${key} ist kein String`);
      assert.ok(value.trim().length > 0, `${lang}.${key} ist leer`);
    }
  }
});

test('roomCode liefert 4 Zeichen aus A-Z/2-9 ohne problematische Zeichen', () => {
  for (let i = 0; i < 500; i++) {
    const code = roomCode();
    assert.equal(code.length, 4, `falsche Länge: ${code}`);
    assert.match(code, /^[A-Z2-9]{4}$/, `unerlaubte Zeichen: ${code}`);
    assert.doesNotMatch(code, /[ILO01]/, `problematisches Zeichen: ${code}`);
  }
});

test('shuffle liefert dieselben Elemente als Permutation und lässt das Original unverändert', () => {
  const original = [3, 1, 4, 1, 5, 9, 2, 6];
  const copy = [...original];
  for (let i = 0; i < 100; i++) {
    const out = shuffle(original);
    assert.notEqual(out, original, 'shuffle muss eine neue Referenz liefern');
    assert.equal(out.length, original.length);
    assert.deepEqual([...out].sort(), [...original].sort());
    assert.deepEqual(original, copy, 'Original wurde verändert');
  }
});

test('shuffle bleibt bei leeren und einelementigen Arrays stabil', () => {
  assert.deepEqual(shuffle([]), []);
  assert.deepEqual(shuffle([7]), [7]);
});
