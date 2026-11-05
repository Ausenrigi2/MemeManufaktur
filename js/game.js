// ============ Meme-Partie: Lobby + Spiel-Phasen ============
import { el, t, rand, shuffle, toast, confetti, roomCode, uid } from './lib.js';
import { MemeCanvas, renderMemeToDataUrl } from './editor.js';
import { zoneFor, layerPatch, normLayers } from './textzones.js';
import { Packs, ServerAPI } from './packs.js';
import { Room } from './net.js';

export const THEMES = [
  'Montagmorgen',
  'Dein Browser mit 47 Tabs',
  'Der erste Tag an der Uni',
  'WLAN im Urlaub',
  'Dein Code um 2 Uhr nachts',
  'Veganer in der Grillhütte',
  'Black-Friday-Warenschlachten',
  'Katze vs. Fenster',
  'Der letzte Platz im Kino',
  'Mama ruft zum dritten Mal',
  'Fitnessstudio am Sonntag',
  'Stau um 17:05',
  'Deine Gruppe „Wir antworten nicht"',
  'Prüfungsvorbereitung, Woche 1',
  'Der Drucker, der nie Papier findet',
  'Sushi oder Curry?',
  'Dein Wecker um 6:00',
  'Sommerfest bei den Nachbarn',
  'Die letzte U-Bahn',
  'Excel-Zeile 14.302',
  'Gaming-Abend, Runde 1',
  'Der Kofferraum vor dem Urlaub',
  'Werkstatttermin, Termin 2',
  'Dein Garten im Mai',
  'Silvester um 23:59',
  'Der Meeting-Nachtrag um 22:41',
];

const INSPO_TOPS = ['WHEN THE', 'DER MOMENT ALS', 'POV: DU', 'WANN DICH', 'EINMAL', 'JEDER WEISS, DASS'];
const INSPO_BOTTOMS = ['NIE WIEDER SLEEPS', 'DEIN CHAT VERLÄSST DEN RAUM', 'DAS BÄRKCHEN AUFTAUCHT', 'DU SCHON GEWUSST HAST', 'DER PLAN GEHT AUF', 'SIE DIE TÜR FALSCH AUFMAKT'];

export async function resolveTpl(key) {
  if (!key) return null;
  if (window.__lanTpls?.[key]) {
    const res = await fetch(window.__lanTpls[key]);
    if (!res.ok) return null;
    return { blob: await res.blob(), name: key };
  }
  if (key.startsWith('srv:')) {
    const res = await fetch(ServerAPI.url(key.slice(4)));
    if (!res.ok) return null;
    return { blob: await res.blob(), name: key };
  }
  const tpl = await Packs.getTemplate(key);
  return tpl ? { blob: tpl.blob, name: tpl.name } : null;
}

async function pickTemplates(count, mode, idList = [], ownPools = null) {
  const all = await Packs.allTemplates();
  // ownPools: pro Spieler eigene Keys ('srv:...') – nur wenn der Host sie erlaubt.
  const needPool = !ownPools || idList.some((id) => !ownPools.get(id)?.length);
  if (!all.length && needPool) throw new Error('Keine Templates – erst Bilder in Pakete hochladen.');
  const pool = shuffle(all);
  const out = [];
  for (let i = 0; i < count; i++) {
    // 'same' behält bewusst EIN gemeinsames Template – eigene Packs gelten nur in random/theme
    const own = ownPools && mode !== 'same' ? ownPools.get(idList[i]) : null;
    if (own?.length) { out.push(rand(own)); continue; }
    out.push(mode === 'same' ? pool[0].id : pool[i % pool.length].id);
  }
  return out;
}

// Mini-Studio in der Runde: beliebig viele Textfelder, Klick/Drag auf dem Bild positioniert das fokussierte Feld

// ============ Gemeinsame Views ============
// ============ Lobby (erstellen + beitreten) ============
export async function openLobby(container) {
  container.innerHTML = '';
  if (!ServerAPI.available) {
    container.append(el('div', { class: 'card', style: 'max-width:560px' },
      el('h2', {}, t('lobby.title')),
      el('p', { style: 'color:var(--muted)' }, t('lobby.needserver')),
    ));
    return;
  }

  const nameInput = el('input', { type: 'text', name: 'name', autocomplete: 'name', value: 'Gast_' + Math.floor(Math.random() * 900 + 100) });
  const lobbyInput = el('input', { type: 'text', name: 'lobby' });
  const codeInput = el('input', { type: 'text', name: 'code', maxlength: 4, style: 'width:110px;text-transform:uppercase' });
  const statusEl = el('p', { style: 'font-weight:700;color:var(--muted)', 'aria-live': 'polite', hidden: true });
  let poll = null;

  async function join(code, opts) {
    const name = nameInput.value.trim();
    if (!name) { toast(t('spiel.yourName')); return; }
    clearInterval(poll);
    await enterLobby({ code, host: !!opts.host, name, statusEl, lobby: opts.lobby, pub: !!opts.pub });
  }

  function createLobby() {
    const vis = document.querySelector('input[name="vis"]:checked')?.value || 'public';
    join(roomCode(), { host: true, pub: vis === 'public', lobby: lobbyInput.value.trim() || null });
  }
  function joinByCode() {
    const code = codeInput.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code)) { toast(t('lobby.codeBad')); return; }
    join(code, {});
  }

  const listWrap = el('div', { class: 'lobby-list' });
  async function renderLobbies() {
    let list = [];
    try { list = await ServerAPI.lobbies(); } catch { return; }
    listWrap.innerHTML = '';
    if (!list.length) { listWrap.append(el('p', { style: 'color:var(--muted)' }, t('lobby.noOpen'))); return; }
    for (const l of list) {
      listWrap.append(el('div', { class: 'lobby-row' },
        el('span', {}, (l.name || l.code) + ' · ' + t('lobby.playersIn', { n: l.players })),
        el('button', { class: 'btn btn-sm btn-blue', type: 'button', onclick: () => join(l.code, { pub: true }) }, '→ ' + t('lobby.join')),
      ));
    }
  }

  const visCards = ['public', 'private'].map((v) => el('label', { class: 'mode-card' },
    el('input', { type: 'radio', name: 'vis', value: v, ...(v === 'public' ? { checked: 'checked' } : {}) }),
    el('span', {}, t('lobby.' + v)),
  ));

  container.append(
    el('div', { class: 'wrap game-grid' },
      el('div', { class: 'card' },
        el('h2', {}, t('lobby.create')),
        el('label', {}, t('spiel.yourName')), nameInput,
        el('div', { class: 'fieldrow', style: 'margin-top:12px' },
          el('div', { class: 'grow' }, el('label', {}, t('lobby.name')), lobbyInput),
        ),
        el('label', {}, t('lobby.visibility')),
        el('div', { class: 'mode-cards' }, ...visCards),
        el('div', { style: 'margin-top:16px' }, el('button', { class: 'btn btn-primary', type: 'button', onclick: createLobby }, '🚀 ' + t('lobby.create'))),
      ),
      el('div', { class: 'card' },
        el('h2', {}, t('lobby.openList')),
        listWrap,
        el('h3', { style: 'margin-top:18px' }, t('lobby.byCode')),
        el('div', { class: 'fieldrow' }, codeInput, el('button', { class: 'btn btn-blue', type: 'button', onclick: joinByCode }, '🔑 ' + t('lobby.join'))),
        statusEl,
      ),
    ),
  );

  renderLobbies();
  // shortcut: polling alle 5s, wenn die Lobby-Liste lebt; upgrade auf WS-Push, wenn Live-Updates gefordert sind
  poll = setInterval(() => { if (!container.isConnected) return clearInterval(poll); renderLobbies(); }, 5000);
}

function enterLobby({ code, host, name, statusEl, lobby, pub }) {
  return new Promise((resolve) => {
    const app = document.getElementById('app');
    const room = new Room(code, name, { lobby, pub });
    const players = new Map(); // selfId -> name
    let hostId = null;
    let myId = room.selfId;
    let leftGame = false;
    let startedFlag = false; // true sobald „start“ im Raum angekommen ist
    let ownKeys = []; // eigene Server-Keys dieser Person ('srv:...')
    lanState.room = room;

    function setStatus(msg) {
      if (!statusEl) return;
      statusEl.textContent = msg;
      statusEl.hidden = false;
      if (!statusEl.isConnected) lobbyCard.append(statusEl); // nach dem Beitreten ist statusEl nicht mehr im DOM
    }

    const chipsWrap = el('div', { class: 'player-chips' });
    const lobbyCard = el('div', { class: 'card', style: 'max-width:560px;margin:26px auto' });
    let setupCardOuter = null; // Host-Einstellungen (erst nach dem Setup zugewiesen)

    function renderLobby() {
      lobbyCard.innerHTML = '';
      lobbyCard.append(
        el('h2', {}, t('spiel.lobby')),
        el('p', { style: 'font-weight:700' }, t('spiel.lobby.code') + ': ', el('code', { style: 'font-size:1.4rem;background:var(--yellow);border:var(--border);padding:4px 14px;border-radius:10px' }, code)),
        el('label', {}, t('spiel.players')),
        chipsWrap,
      );
      chipsWrap.innerHTML = '';
      for (const [id, pname] of players) {
        chipsWrap.append(el('span', { class: 'chip' }, id === myId ? '⭐ ' : '', pname));
      }
      if (!players.size) chipsWrap.append(el('span', { style: 'color:var(--muted)' }, t('spiel.lobby.wait')));
      if (ownKeys.length && cfg.ownPacks) lobbyCard.append(el('p', { style: 'color:var(--muted);font-size:0.85rem;margin-top:10px' }, t('spiel.ownPacks.use')));
      if (cfg.ownPacks) lobbyCard.append(el('p', { style: 'color:var(--muted);font-size:0.85rem;margin-top:10px' }, t('spiel.ownPacks.on')));
      if (hostId === myId) {
        lobbyCard.append(el('div', { style: 'display:flex;gap:10px;margin-top:16px;flex-wrap:wrap' },
          el('button', { class: 'btn btn-primary', onclick: () => startFromLobby() }, '🚀 ' + t('spiel.start')),
          el('button', { class: 'btn', onclick: () => leave() }, '← ' + t('spiel.final.home')),
        ));
      } else {
        lobbyCard.append(el('div', { style: 'margin-top:16px;display:flex;gap:10px' },
          el('span', { style: 'align-self:center;font-weight:700;color:var(--muted)' }, t('spiel.lobby.wait')),
          el('button', { class: 'btn', onclick: () => leave() }, '← ' + t('spiel.final.home')),
        ));
      }
      if (setupCardOuter) setupCardOuter.style.display = hostId === myId ? '' : 'none';
    }

    // Setup-Formular für Host in der Lobby
    let cfg = { mode: 'random', relaxed: false, rounds: 3, timeSec: 90, ownPacks: false };
    function setupControls() {
      const g = el('div', { class: 'card', style: 'max-width:560px;margin:14px auto' });
      const set = (k, v) => { cfg[k] = v; };
      const radios = el('div', { class: 'mode-cards' });
      for (const m of ['random', 'same', 'theme']) {
        radios.append(el('label', { class: 'mode-card' },
          el('input', { type: 'radio', name: 'lm', value: m, checked: m === 'random' ? 'checked' : '' }),
          el('span', {}, t(`spiel.modes.${m}`)),
        ));
      }
      radios.querySelectorAll('input').forEach((r) => r.addEventListener('change', () => set('mode', radios.querySelector('input:checked').value)));
      const rel = el('input', { type: 'checkbox' });
      rel.addEventListener('change', () => set('relaxed', rel.checked));
      const roundsSel = el('select', {}, ...[3, 4, 5, 6, 7, 8, 9].map((n) => el('option', { value: n, ...(n === 3 ? { selected: '' } : {}) }, String(n))));
      roundsSel.addEventListener('change', () => set('rounds', Number(roundsSel.value) || 3));
      const timeSel = el('select', {}, ...[60, 90, 120, 150].map((n) => el('option', { value: n, ...(n === 90 ? { selected: '' } : {}) }, n + ' s')));
      timeSel.addEventListener('change', () => set('timeSec', Number(timeSel.value) || 90));
      const ownChk = el('input', { type: 'checkbox' });
      ownChk.addEventListener('change', () => set('ownPacks', ownChk.checked));
      g.append(
        el('h3', {}, t('spiel.setup.t')),
        radios,
        el('div', { style: 'display:flex;gap:8px;align-items:center;margin-top:10px' }, rel, el('span', {}, t('spiel.relaxed'))),
        el('div', { style: 'display:flex;gap:8px;align-items:center;margin-top:10px' }, ownChk, el('span', {}, t('spiel.ownPacks'))),
        el('div', { class: 'fieldrow', style: 'margin-top:10px' },
          el('div', {}, el('label', {}, t('spiel.rounds')), roundsSel),
          el('div', {}, el('label', {}, t('spiel.time')), timeSel),
        ),
      );
      return g;
    }

    const gameArea = el('div');
    setupCardOuter = setupControls();
    app.innerHTML = '';
    app.append(el('div', { class: 'wrap' }, lobbyCard, setupCardOuter, gameArea));
    renderLobby();

    function leave() {
      leftGame = true;
      if (lanState.room === room) lanState.room = null;
      room.close();
      location.hash = '#/';
    }

    async function sendOwnPack() {
      try {
        const me = await ServerAPI.me();
        if (!me) return;
        const items = await ServerAPI.library();
        ownKeys = items.filter((x) => x.own).map((x) => 'srv:' + x.id);
        if (ownKeys.length) room.send({ type: 'ownpack', selfId: myId, tpls: ownKeys });
      } catch {}
    }

    room.onStatus((s) => {
      if (s === 'closed') setStatus('⚠️ ' + t('lobby.error'));
      else if (s === 'open' && ownKeys.length) room.send({ type: 'ownpack', selfId: myId, tpls: ownKeys });
    });

    room.onMessage(async (msg) => {
      if (leftGame) return;
      switch (msg.type) {
        case 'ownpack':
          if (hostId === myId) { lanState.ownPacks.set(msg.selfId, msg.tpls || []); renderLobby(); }
          break;
        case 'roster':
          players.clear();
          for (const p of msg.players) players.set(p.selfId, p.name);
          if (msg.players.length) hostId = msg.players[0].selfId;
          renderLobby();
          break;
        case 'joined':
          if (!players.has(msg.selfId)) { hostId = hostId || msg.selfId; }
          players.set(msg.selfId, msg.name);
          renderLobby();
          break;
        case 'left':
          players.delete(msg.selfId);
          if (hostId === msg.selfId) {
            if (!startedFlag) {
              // Noch in der Lobby: nächste:r Spieler:in wird Host
              const next = [...players.keys()][0];
              hostId = next ?? null;
              renderLobby();
            } else if (!leftGame) {
              gameArea.innerHTML = '';
              gameArea.append(el('div', { class: 'card', style: 'max-width:480px;margin:20px auto;text-align:center' },
                el('p', { style: 'font-size:1.1rem;font-weight:700' }, '🫠 Der Host ist gegangen – die Partie endet.'),
                el('button', { class: 'btn', style: 'margin-top:10px', onclick: () => leave() }, '← ' + t('spiel.final.home')),
              ));
            }
            return;
          }
          renderLobby();
          break;
        case 'start':
          startedFlag = true;
          if (msg.hostId !== myId) announceStart(msg);
          break;
        case 'turn':
          // Alle erstellen parallel – nur der eigene Turn betrifft einen selbst
          if (msg.playerId === myId) doTurn(msg);
          break;
        case 'submit':
          // Nur der Host sammelt die Captions der Runde
          if (hostId === myId) handleHostSubmit(msg);
          break;
        case 'vote':
          if (hostId === myId) hostHandleVote(msg);
          break;
        case 'voting-start':
          if (msg.myId === myId) doVote(msg);
          break;
        case 'result':
          doResult(msg);
          break;
        case 'final':
          doFinal(msg);
          break;
      }
    });

    room.connect();
    room.send({ type: 'hello', selfId: myId, name });
    sendOwnPack();

    // Host-Logik in derselben Closure – über Modulebene erreichbar:
    function startFromLobby() { window.__lanHostStart(cfg, room, players, myId); }
    function hostHandleVote(msg) { window.__lanHostVote(msg); }
  });
}

// ---------- LAN Host/Guest-Phasen (auf Modulebene, da Closure-Shared-State nötig) ----------
const lanState = { cfg: null, room: null, round: 0, rounds: 3, memes: [], votes: [], totals: new Map(), theme: null, players: [], assignments: new Map(), turnAdvance: null, voteAdvance: null, ownPacks: new Map(), collecting: false, voting: false, allMemes: [] }; // ownPacks: selfId -> [srv-Keys]

/** Host: Caption aus einer „submit“-Nachricht in die laufende Runde übernehmen */
export function handleHostSubmit(msg) {
  if (!lanState.collecting) return; // späte Captions nach Ablauf der Runde ignorieren
  if (!msg?.selfId) return;
  const top = String(msg.top ?? '').slice(0, 200);
  const bottom = String(msg.bottom ?? '').slice(0, 200);
  const layers = normLayers(msg.layers);
  const found = lanState.memes.find((m) => m.playerId === msg.selfId);
  if (found) {
    found.top = top; found.bottom = bottom; found.layers = layers;
    lanState.turnAdvance?.();
    return;
  }
  const p = lanState.players.find((x) => x.id === msg.selfId);
  if (!p) return;
  lanState.memes.push({ playerId: p.id, name: p.name, top, bottom, layers, tplKey: lanState.assignments.get(p.id) || null });
  lanState.turnAdvance?.();
}

async function announceStart(msg) {
  lanState.cfg = msg.cfg;
  lanState.round = 0;
  lanState.totals = new Map(msg.players.map((p) => [p.id, 0]));
  const app = document.getElementById('app');
  app.innerHTML = '';
  app.append(el('div', { class: 'wrap phase-screen waiting' },
    el('div', { class: 'spinner-meme' }, '🎬'),
    el('h1', {}, 'Runde 1 beginnt gleich …'),
  ));
}

function doTurn(msg) {
  if (msg.tpls) Object.assign(window.__lanTpls = window.__lanTpls || {}, msg.tpls);
  const app = document.getElementById('app');
  let settled = false;

  async function setupPreview() {
    const tpl = await resolveTpl(msg.tplKey);
    if (!tpl) throw new Error('Template fehlt');
    const canvas = el('canvas', { width: 640, height: 640 });
    const mc = new MemeCanvas(canvas);
    const fieldsWrap = el('div', { class: 'turn-fields' });
    const rows = new Map();

    function addRow(layer) {
      const inp = el('textarea', { rows: 2, placeholder: t('spiel.turn.field', { n: rows.size + 1 }) });
      const row = el('div', { style: 'display:flex;gap:6px;align-items:flex-start;margin-bottom:8px' },
        inp,
        el('button', { class: 'btn btn-sm btn-red', type: 'button', title: t('pakete.delTpl'), onclick: () => { mc.removeLayer(layer.id); row.remove(); rows.delete(layer.id); } }, '🗑'),
      );
      inp.addEventListener('input', () => { mc.updateLayer(layer.id, { text: inp.value }); });
      inp.addEventListener('focus', () => { if (mc.selectedId !== layer.id) mc.select(layer.id); });
      rows.set(layer.id, inp);
      fieldsWrap.append(row);
    }

    mc.onChange = () => { if (rows.has(mc.selectedId)) rows.get(mc.selectedId).focus(); };
    mc.bindPointer();
    await mc.setImage(tpl.blob);
    const base = Math.min(mc.cw, mc.ch);
    const z = zoneFor(tpl.id);
    const def = (y) => ({ y, fontSize: Math.round(base * 0.11), strokeWidth: Math.max(5, Math.round(base * 0.012)) });
    addRow(mc.addLayer({ text: '', ...(layerPatch(mc, z?.top) || def(Math.round(base * 0.13))) }));
    addRow(mc.addLayer({ text: '', ...(layerPatch(mc, z?.bottom) || def(mc.ch - Math.round(base * 0.13))) }));

    const timerWrap = el('div', { class: 'timerbar' }, el('i'));

    function finish() {
      if (settled) return;
      settled = true;
      const room = lanState.room;
      const layers = mc.layers.map((l) => ({ text: String(l.text).slice(0, 200), xF: +(l.x / mc.cw).toFixed(3), yF: +(l.y / mc.ch).toFixed(3), fsF: +(l.fontSize / base).toFixed(3) }));
      room.send({ type: 'submit', selfId: room.selfId, layers });
    }

    app.innerHTML = '';
    app.append(el('div', { class: 'wrap phase-screen' },
      el('h1', {}, `${t('spiel.turn.yours')}${msg.theme ? ` · 🎭 ${msg.theme}` : ''}`),
      el('div', { class: 'turn-box card' },
        el('div', { class: 'meme-preview' }, canvas),
        el('p', { style: 'color:var(--muted);font-size:0.85rem' }, t('spiel.turn.place')),
        fieldsWrap,
        el('button', { class: 'btn btn-sm', type: 'button', onclick: () => addRow(mc.addLayer({ text: '' })) }, '+ ' + t('studio.addLayer')),
        timerWrap,
        el('div', { style: 'margin-top:14px' }, el('button', { class: 'btn btn-green', onclick: finish }, '✅ ' + t('spiel.turn.submit'))),
      ),
    ));

    const leftSec = Math.max(1, Math.round((msg.until - Date.now()) / 1000));
    const startedAt = Date.now();
    const iv = setInterval(() => {
      if (settled) return clearInterval(iv);
      const left = Math.max(0, leftSec - Math.floor((Date.now() - startedAt) / 1000));
      timerWrap.firstElementChild.style.width = (left / leftSec) * 100 + '%';
      timerWrap.classList.toggle('warn', left <= 10);
      if (left <= 0) { clearInterval(iv); finish(); }
    }, 250);
  }

  setupPreview();
}

function doVote(msg) {
  if (msg.tpls) Object.assign(window.__lanTpls = window.__lanTpls || {}, msg.tpls);
  const app = document.getElementById('app');
  const list = msg.memes.filter((m) => m.playerId !== msg.myId);
  if (!list.length) return;
  const ups = new Set(), downs = new Set(), decided = new Set();
  let peak = null; // einmal pro Runde, bis zum Abgeben auf ein anderes Meme verschiebbar
  let sent = false, idx = 0, timer = null;
  const cache = {}; // dataURLs cachen, damit Zurück nicht neu rendert

  const img = el('img', { alt: '' });
  const meta = el('div', { class: 'vote-meta' });
  const upB = el('button', { class: 'vbtn vbtn-up', title: t('spiel.vote.up') }, '👍');
  const dnB = el('button', { class: 'vbtn vbtn-down', title: t('spiel.vote.down') }, '👎');
  const pkB = el('button', { class: 'vbtn vbtn-peak', title: t('spiel.vote.peak') }, '⛰️ PEAK');
  const timerWrap = el('div', { class: 'timerbar' }, el('i'));
  const status = el('p', { style: 'color:var(--muted)' });

  function paint() {
    const cur = list[idx];
    upB.classList.toggle('active', ups.has(cur.playerId));
    dnB.classList.toggle('active', downs.has(cur.playerId));
    pkB.classList.toggle('active', peak === cur.playerId);
    status.textContent = sent ? t('spiel.vote.wait') : `${idx + 1} / ${list.length}`;
  }

  async function show() {
    const m = list[idx];
    meta.textContent = m.name;
    if (!cache[m.playerId]) {
      const tpl = await resolveTpl(m.tplKey);
      if (!tpl) return;
      cache[m.playerId] = await renderMemeToDataUrl({ blob: tpl.blob, id: tpl.id, top: m.top, bottom: m.bottom, layers: m.layers });
    }
    img.src = cache[m.playerId];
    paint();
    if (!sent) startTimer();
  }

  function startTimer() {
    clearInterval(timer);
    const bar = timerWrap.firstElementChild;
    let left = 10;
    bar.style.width = '100%';
    timer = setInterval(() => {
      if (sent) { clearInterval(timer); return; }
      left -= 0.25;
      if (left <= 0) { clearInterval(timer); decide(); go(1); return; } // abgelaufen = entschieden ohne Stimme
      bar.style.width = `${(left / 10) * 100}%`;
    }, 250);
  }

  function go(delta) {
    const next = Math.min(list.length - 1, Math.max(0, idx + delta));
    if (next !== idx) { idx = next; show(); }
  }

  upB.addEventListener('click', () => { if (ups.has(list[idx].playerId)) ups.delete(list[idx].playerId); else { downs.delete(list[idx].playerId); ups.add(list[idx].playerId); } decide(); });
  dnB.addEventListener('click', () => { if (downs.has(list[idx].playerId)) downs.delete(list[idx].playerId); else { ups.delete(list[idx].playerId); downs.add(list[idx].playerId); } decide(); });
  pkB.addEventListener('click', () => { peak = peak === list[idx].playerId ? null : list[idx].playerId; paint(); });

  function decide() {
    if (sent) return;
    decided.add(list[idx].playerId);
    paint();
    if (decided.size === list.length) {
      sent = true;
      clearInterval(timer);
      lanState.room.send({ type: 'vote', selfId: lanState.room.selfId, ups: [...ups], downs: [...downs], peak });
      paint();
    }
  }

  app.innerHTML = '';
  app.append(el('div', { class: 'wrap phase-screen' },
    el('h1', {}, t('spiel.vote.title')),
    el('div', { class: 'card turn-box' },
      el('p', { style: 'font-weight:800' }, t('spiel.vote.hint')),
      img,
      meta,
      el('div', { class: 'vote-btns' }, upB, dnB, pkB),
      el('div', { style: 'display:flex;gap:8px;margin-top:12px' },
        el('button', { class: 'btn btn-sm', type: 'button', onclick: () => go(-1) }, '← ' + t('spiel.vote.back')),
        el('button', { class: 'btn btn-sm btn-blue', type: 'button', onclick: () => { decide(); if (!sent) go(1); } }, '→ ' + t('spiel.vote.skip')),
      ),
      timerWrap,
      status,
    ),
  ));
  show();
}

function doResult(msg) {
  const app = document.getElementById('app');
  const rows = el('div', { class: 'result-list' });
  for (const s of msg.scores) {
    const img = el('img', { alt: s.name });
    (async () => {
      const tpl = await resolveTpl(s.tplKey);
      if (tpl) img.src = await renderMemeToDataUrl({ blob: tpl.blob, id: tpl.id, top: s.top, bottom: s.bottom, layers: s.layers });
    })();
    rows.append(el('div', { class: `result-row${s.pts === Math.max(...msg.scores.map((x) => x.pts)) && s.pts > 0 ? ' winner' : ''}` },
      img,
      el('div', {}, el('div', { style: 'font-weight:800' }, s.name), el('div', { class: 'voters' },
        [s.up?.length ? '👍 ' + s.up.join(', ') : null, s.down?.length ? '👎 ' + s.down.join(', ') : null, s.peaks ? '⛰️ ×' + s.peaks : null].filter(Boolean).join('  ·  ') || '—')),
      el('div', { class: 'pts' }, String(s.pts)),
    ));
  }
  app.innerHTML = '';
  app.append(el('div', { class: 'wrap phase-screen' },
    el('h1', {}, `${t('spiel.result.title')} · ${msg.round}/${msg.rounds}`),
    el('div', { class: 'card' }, rows),
  ));
}

function doFinal(msg) {
  confetti();
  const app = document.getElementById('app');
  const medals = ['🥇', '🥈', '🥉'];
  const bestCard = msg.best?.length ? el('div', { class: 'card', style: 'margin-top:14px' },
    el('h2', {}, '🔥 ' + t('spiel.final.best')),
    el('div', { class: 'vote-grid' },
      ...msg.best.map((m) => {
        const img = el('img', { alt: m.name });
        (async () => {
          const tpl = await resolveTpl(m.tplKey);
          if (tpl) img.src = await renderMemeToDataUrl({ blob: tpl.blob, id: tpl.id, top: m.top, bottom: m.bottom, layers: m.layers });
        })();
        return el('div', { class: 'vote-card' }, img, el('div', { class: 'vote-meta' }, m.name, ' · ' + m.pts + ' P.'));
      }),
    ),
  ) : null;
  app.innerHTML = '';
  app.append(el('div', { class: 'wrap phase-screen' },
    el('h1', {}, '👑 ' + t('spiel.final.title')),
    el('div', { class: 'card' },
      el('h2', {}, '🏆 ' + t('spiel.final.podium')),
      el('div', { class: 'final-rank' },
        ...msg.standings.map((s, i) => el('div', { class: `final-row${i === 0 ? ' first' : ''}` },
          el('span', { class: 'medal' }, i < 3 ? medals[i] : `${i + 1}.`),
          s.name,
          el('span', { class: 'pts' }, String(s.pts) + (msg.relaxed ? '' : ' P.')),
        )),
      ),
    ),
    bestCard,
    el('div', { style: 'display:flex;gap:10px;justify-content:center;margin-top:14px' },
      el('button', { class: 'btn', onclick: () => { location.hash = '#/'; } }, '🏠 ' + t('spiel.final.home')),
    ),
  ));
}

// Host-Seite (wird von der Lobby-Closure aufgerufen)
window.__lanHostStart = function (cfg, room, playersMap, myId) {
  lanState.cfg = cfg;
  lanState.room = room;
  lanState.rounds = cfg.rounds;
  lanState.totals = new Map([...playersMap.keys()].map((id) => [id, 0]));
  lanState.allMemes = [];
  lanState.collecting = false;
  lanState.voting = false;
  const playerList = [...playersMap.entries()].map(([id, name]) => ({ id, name }));
  if (playerList.length < 2) { toast('Mindestens 2 Spieler:innen nötig'); return; }
  lanState.players = playerList;

  async function runRound(r) {
    lanState.round = r;
    lanState.memes = [];
    lanState.votes = [];
    const theme = cfg.mode === 'theme' ? THEMES[(r * 7) % THEMES.length] : null;
    lanState.theme = theme;
    let tplKeys;
    try { tplKeys = await pickTemplates(playerList.length, cfg.mode, playerList.map((p) => p.id), cfg.ownPacks ? lanState.ownPacks : null); } catch (e) { toast(e.message); return; }
    lanState.assignments = new Map(playerList.map((p, i) => [p.id, tplKeys[i]]));

    // DataURLs für Gäste
    const tpls = {};
    for (const k of new Set(tplKeys)) {
      const tpl = await resolveTpl(k);
      if (tpl) tpls[k] = await renderMemeToDataUrl({ blob: tpl.blob, id: tpl.id, top: '', bottom: '' }, 900);
    }

    // Turn-Phase: alle erstellen parallel, gemeinsames Zeitfenster
    const until = Date.now() + cfg.timeSec * 1000;
    lanState.collecting = true;
    for (let i = 0; i < playerList.length; i++) {
      room.send({
        type: 'turn', playerId: playerList[i].id, name: playerList[i].name, round: r,
        theme, tplKey: tplKeys[i], tpls, until,
      });
    }
    let turnDone = false;
    const finishTurn = () => {
      if (turnDone) return;
      turnDone = true;
      lanState.collecting = false;
      clearTimeout(turnTimer);
      for (const p of playerList) {
        if (!lanState.memes.some((m) => m.playerId === p.id)) {
          lanState.memes.push({ playerId: p.id, name: p.name, top: '', bottom: '', tplKey: lanState.assignments.get(p.id) || null });
        }
      }
      startVoting();
    };
    const turnTimer = setTimeout(finishTurn, cfg.timeSec * 1000 + 400);
    // Wenn alle Captions da sind, geht es sofort ins Voting
    lanState.turnAdvance = () => {
      if (playerList.every((p) => lanState.memes.some((m) => m.playerId === p.id))) finishTurn();
    };

    function startVoting() {
      const memes = lanState.memes.map((m) => ({ playerId: m.playerId, name: m.name, top: m.top, bottom: m.bottom, layers: m.layers, tplKey: m.tplKey }));
      // Alle voten gleichzeitig
      lanState.voting = true;
      for (const v of playerList) {
        room.send({ type: 'voting-start', myId: v.id, memes, tpls });
      }
      let voteDone = false;
      const finishVote = () => {
        if (voteDone) return;
        voteDone = true;
        lanState.voting = false;
        for (const v of playerList) if (!lanState.votes.some((x) => x.selfId === v.id)) lanState.votes.push({ selfId: v.id, ups: [], downs: [], peak: null });
        tally();
      };
      setTimeout(finishVote, (cfg.timeSec + 20) * 1000);
      // Wenn alle abgestimmt haben, Auswertung sofort
      lanState.voteAdvance = () => {
        if (playerList.every((p) => lanState.votes.some((x) => x.selfId === p.id))) finishVote();
      };
    }

    function tally() {
      // Punkte: ±1000 relativ zur Spielerzahl (up − down), dazu +10 pro ⛰️ PEAK aufs Meme
      const denom = Math.max(1, playerList.length - 1);
      const nameOf = (id) => playerList.find((p) => p.id === id)?.name || '?';
      const peakCount = {};
      for (const v of lanState.votes) if (v.peak) peakCount[v.peak] = (peakCount[v.peak] || 0) + 1;
      const scores = lanState.memes.map((m) => {
        const up = lanState.votes.filter((v) => (v.ups || []).includes(m.playerId)).map((v) => nameOf(v.selfId));
        const down = lanState.votes.filter((v) => (v.downs || []).includes(m.playerId)).map((v) => nameOf(v.selfId));
        const peaks = peakCount[m.playerId] || 0;
        const pts = Math.round(1000 * (up.length - down.length) / denom) + peaks * 10;
        return { ...m, pts, up, down, peaks };
      }).sort((a, b) => b.pts - a.pts);
      if (!cfg.relaxed) {
        for (const s of scores) lanState.totals.set(s.playerId, (lanState.totals.get(s.playerId) || 0) + s.pts);
        // Wer den PEAK gesetzt hat, bekommt die Hälfte des End-Scores dieses Memes (auch negativ)
        const byId = new Map(scores.map((s) => [s.playerId, s]));
        for (const v of lanState.votes) if (v.peak && byId.has(v.peak)) lanState.totals.set(v.selfId, (lanState.totals.get(v.selfId) || 0) + Math.round(byId.get(v.peak).pts / 2));
      }

      lanState.allMemes.push(...scores);
      const isLast = r >= lanState.rounds;
      room.send({ type: 'result', round: r, rounds: lanState.rounds, scores });

      setTimeout(() => {
        if (isLast) {
          const standings = playerList
            .map((p) => ({ id: p.id, name: p.name, pts: lanState.totals.get(p.id) || 0 }))
            .sort((a, b) => b.pts - a.pts);
          // Die besten 5 Memes des gesamten Spiels
          const best = [...lanState.allMemes]
            .sort((a, b) => b.pts - a.pts)
            .slice(0, 5)
            .map((m) => ({ playerId: m.playerId, name: m.name, top: m.top, bottom: m.bottom, layers: m.layers, tplKey: m.tplKey, pts: m.pts }));
          room.send({ type: 'final', standings, relaxed: cfg.relaxed, best });
        } else {
          runRound(r + 1);
        }
      }, 5200);
    }
  }

  room.send({ type: 'start', hostId: myId, players: playerList, cfg });
  runRound(1);
};

window.__lanHostVote = function (msg) {
  if (!lanState.voting) return; // späte Stimmen nach der Auswertung ignorieren
  if (!lanState.votes.some((v) => v.selfId === msg.selfId)) {
    lanState.votes.push({ selfId: msg.selfId, ups: msg.ups || [], downs: msg.downs || [], peak: msg.peak || null });
  }
  lanState.voteAdvance?.();
};
