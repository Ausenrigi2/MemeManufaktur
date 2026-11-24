// ============ Invarianten-Test (Zero-Dep): node --test ============
// Prüft i18n-Parität, Punkte, ZIP und die kleinen Utils (roomCode, shuffle).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { I18N, roomCode, shuffle } from '../js/lib.js';
import { createZip } from '../js/zip.js';
import { scoreRound, applyTotals } from '../js/scoring.js';

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

test('createZip schreibt gültige Store-Einträge mit Dateinamen und Inhalt', async () => {
  const files = [
    { name: 'meme-1.jpg', data: new TextEncoder().encode('erste Datei') },
    { name: 'meme-2.jpg', data: new TextEncoder().encode('zweite Datei') },
  ];
  const bytes = new Uint8Array(await createZip(files).arrayBuffer());
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50, 'Local header fehlt');
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50, 'EOCD fehlt');
  assert.equal(view.getUint16(bytes.length - 12, true), 2, 'falsche Eintragszahl');
  const text = new TextDecoder().decode(bytes);
  assert.match(text, /meme-1\.jpg/);
  assert.match(text, /meme-2\.jpg/);
  assert.match(text, /zweite Datei/);
});

test('scoreRound zählt Krocha, Gschissn, Najo und Peak korrekt', () => {
  const players = [{ id: 'a', name: 'Anna' }, { id: 'b', name: 'Ben' }, { id: 'c', name: 'Cleo' }];
  const memes = [{ playerId: 'a' }, { playerId: 'b' }, { playerId: 'c' }];
  const votes = [
    { selfId: 'a', ups: ['b'], downs: ['c'], mehs: [], peak: 'b' },
    { selfId: 'b', ups: ['a'], downs: [], mehs: ['c'], peak: 'c' },
    { selfId: 'c', ups: [], downs: [], mehs: ['b'], peak: 'a' },
  ];
  const scores = scoreRound({ memes, votes, players, round: 2 });
  assert.deepEqual(scores.map((s) => [s.playerId, s.pts]), [['a', 510], ['b', 510], ['c', -490]]);
  assert.deepEqual(scores[0].up, ['Ben']);
  assert.deepEqual(scores[1].meh, ['Cleo']);
  assert.equal(scores[0].round, 2);

  const totals = applyTotals(new Map(players.map((p) => [p.id, 0])), scores, votes);
  assert.equal(totals.get('a'), 765);  // 510 + halber Peak auf B
  assert.equal(totals.get('b'), 265);  // 510 + halber Peak auf C
  assert.equal(totals.get('c'), -235); // -490 + halber Peak auf A
});

test('scoreRound ignoriert Stimmen und Peaks auf das eigene Meme', () => {
  const players = [{ id: 'a', name: 'Anna' }, { id: 'b', name: 'Ben' }];
  const memes = [{ playerId: 'a' }, { playerId: 'b' }];
  const votes = [{ selfId: 'a', ups: ['a'], downs: [], mehs: [], peak: 'a' }];
  const scores = scoreRound({ memes, votes, players, round: 1 });
  assert.deepEqual(scores.map((s) => [s.playerId, s.pts]), [['a', 0], ['b', 0]]);
});
