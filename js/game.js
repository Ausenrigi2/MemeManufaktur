// ============ Meme-Partie: Views + Hot-Seat + LAN ============
import { el, t, rand, shuffle, toast, confetti, roomCode, uid } from './lib.js';
import { MemeCanvas, renderMemeToDataUrl } from './editor.js';
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

function livePreview(canvas, tplBlob) {
  const mc = new MemeCanvas(canvas);
  let topL = null, botL = null, ready = false;
  (async () => {
    try {
      await mc.setImage(tplBlob);
      const base = Math.min(mc.cw, mc.ch);
      topL = mc.addLayer({ text: '', y: Math.round(base * 0.13), fontSize: Math.round(base * 0.11), strokeWidth: Math.max(5, Math.round(base * 0.012)) });
      botL = mc.addLayer({ text: '', y: mc.ch - Math.round(base * 0.13), fontSize: Math.round(base * 0.11), strokeWidth: Math.max(5, Math.round(base * 0.012)) });
      mc.selectedId = null;
      mc.render();
      ready = true;
    } catch (e) { console.error(e); }
  })();
  return {
    set(top, bottom) {
      if (!ready || !topL) return;
      mc.updateLayer(topL.id, { text: String(top) });
      mc.updateLayer(botL.id, { text: String(bottom) });
    },
  };
}

// ============ Gemeinsame Views ============
export function renderSetup(container, { local, onBack }) {
  container.innerHTML = '';
  const players = [
    { id: uid('p'), name: 'Spieler:in 1' },
    { id: uid('p'), name: 'Spieler:in 2' },
  ];
  const maxVotes = () => Math.max(1, Math.min(3, players.length - 1));

  const chipsWrap = el('div', { class: 'player-chips' });
  const relaxedCheck = el('input', { type: 'checkbox' });
  const roundsInput = el('input', { type: 'number', min: 1, max: 8, value: 3, style: { width: '90px' } });
  const timeInput = el('input', { type: 'number', min: 15, max: 300, step: 5, value: 60, style: { width: '110px' } });

  function refreshChips() {
    chipsWrap.innerHTML = '';
    players.forEach((p, i) => {
      chipsWrap.append(el('span', { class: 'chip' },
        p.name,
        players.length > 2 ? el('button', { title: 'Entfernen', onclick: () => { players.splice(i, 1); refreshChips(); } }, '✕') : null,
      ));
    });
  }
  refreshChips();

  const addBtn = el('button', { class: 'btn btn-sm', onclick: () => {
    if (players.length >= 8) return;
    players.push({ id: uid('p'), name: `Spieler:in ${players.length + 1}` });
    refreshChips();
  } }, '+ ' + t('spiel.addPlayer'));

  const startBtn = el('button', { class: 'btn btn-primary', onclick: () => {
    const modeEl = document.querySelector('input[name="mode"]:checked');
    const cfg = {
      mode: modeEl ? modeEl.value : 'random',
      relaxed: relaxedCheck.checked,
      rounds: Math.max(1, Number(roundsInput.value) || 3),
      timeSec: Math.max(15, Number(timeInput.value) || 60),
      maxVotes: maxVotes(),
    };
    onBack && onBack();
    onLocalStart(players, cfg);
  } }, '🚀 ' + t('spiel.start'));

  const modeLabels = [];
  function syncModeCards() {
    for (const l of modeLabels) l.classList.toggle('selected', l.querySelector('input').checked);
  }
  const modeCards = ['random', 'same', 'theme'].map((m) => {
    const label = el('label', { class: 'mode-card' },
      el('input', { type: 'radio', name: 'mode', value: m, ...(m === 'random' ? { checked: 'checked' } : {}) }),
      el('div', {},
        el('div', {}, t(`spiel.modes.${m}`)),
        el('div', { style: 'font-weight:500;font-size:0.85rem;color:var(--muted)' }, t(`spiel.modes.${m}.d`)),
      ),
    );
    label.querySelector('input').addEventListener('change', syncModeCards);
    modeLabels.push(label);
    return label;
  });
  syncModeCards();

  container.append(
    el('div', { class: 'wrap game-grid' },
      el('div', { class: 'card' },
        el('h2', {}, t('spiel.setup.t')),
        el('label', {}, t('spiel.players')),
        chipsWrap,
        el('div', { style: 'margin-bottom:16px' }, addBtn),
        el('label', {}, t('spiel.mode')),
        el('div', { class: 'mode-cards' }, ...modeCards),
        el('div', { style: 'margin-top:14px;display:flex;gap:8px;align-items:center' },
          relaxedCheck, el('span', {}, t('spiel.relaxed')),
        ),
        el('div', { class: 'fieldrow', style: 'margin-top:14px' },
          el('div', {}, el('label', {}, t('spiel.rounds')), roundsInput),
          el('div', {}, el('label', {}, t('spiel.time')), timeInput),
        ),
      ),
      el('div', { class: 'card' },
        el('h2', {}, 'So geht\u2019s'),
        el('ol', { style: 'padding-left:20px' },
          el('li', {}, 'Alle Spieler:innen am Gerät durchklicken – Caption gegen die Uhr.'),
          el('li', {}, 'Danach voten alle für die besten Memes der Runde.'),
          el('li', {}, 'Nach den letzten Runden: Meme-König:innen-Thron und Konfetti.'),
        ),
        local ? el('div', { style: 'margin-top:18px;display:flex;gap:10px;flex-wrap:wrap' }, startBtn) : null,
      ),
    ),
  );
}

// ============ Hot-Seat (ein Gerät) ============
function onLocalStart(players, cfg) {
  runLocalGame(players, cfg);
}

async function runLocalGame(players, cfg) {
  const app = document.getElementById('app');
  const totals = new Map(players.map((p) => [p.id, 0]));
  const maxVotes = cfg.maxVotes || Math.max(1, players.length - 1);
  let aborted = false;

  function show(title, contentEl) {
    app.innerHTML = '';
    app.append(el('div', { class: 'wrap phase-screen' },
      el('h1', {}, title),
      contentEl,
    ));
  }

  function passGate(name) {
    return new Promise((resolve) => {
      const gate = el('div', { class: 'card', style: 'max-width:520px;margin:0 auto;text-align:left' },
        el('h3', {}, '📱 ' + t('spiel.turn.pass') + ': ' + name),
        el('button', { class: 'btn btn-primary', onclick: () => resolve() }, '▶ ' + t('spiel.turn.continue')),
      );
      app.innerHTML = '';
      app.append(el('div', { class: 'wrap phase-screen' },
        el('div', { class: 'spinner-meme' }, '📱'),
        gate,
      ));
    });
  }

  async function votePhase(voter, memes) {
    return new Promise((resolve) => {
      const picks = new Set();
      const grid = el('div', { class: 'vote-grid' });
      const cards = [];
      for (const m of memes) {
        if (m.playerId === voter.id) continue;
        const img = el('img', { alt: m.name });
        renderMemeToDataUrl({ blob: m.blob, top: m.top, bottom: m.bottom }).then((u) => { img.src = u; });
        const card = el('div', { class: 'vote-card', role: 'button', tabindex: 0 },
          img,
          el('div', { class: 'vote-meta' }, m.name, el('span', { style: 'color:var(--blue)' }, '☑️')),
        );
        const toggle = () => {
          if (picks.has(m.playerId)) picks.delete(m.playerId);
          else {
            if (picks.size >= maxVotes) picks.delete(cards.find((c) => c.id !== m.playerId && picks.has(c.id))?.id || [...picks][0]);
            picks.add(m.playerId);
          }
          grid.querySelectorAll('.vote-card').forEach((c) => c.classList.toggle('picked', false));
          cards.forEach((c) => c.node.classList.toggle('picked', picks.has(c.id)));
        };
        card.addEventListener('click', toggle);
        card.addEventListener('keydown', (e) => { if (e.key === 'Enter') toggle(); });
        grid.append(card);
        cards.push({ id: m.playerId, node: card });
      }
      const hintEl = el('p', { style: 'font-weight:800' }, t('spiel.vote.hint', { n: maxVotes }));
      const submitBtn = el('button', { class: 'btn btn-primary', disabled: true }, '🗳️ ' + t('spiel.vote.submit'));
      grid.addEventListener('click', () => { submitBtn.disabled = picks.size === 0; });
      cards.forEach((c) => c.node.addEventListener('click', () => { submitBtn.disabled = picks.size === 0; }));
      submitBtn.addEventListener('click', () => resolve([...picks]));

      show(t('spiel.vote.title'), el('div', { class: 'card turn-box' },
        el('h3', {}, voter.name + ', ' + t('spiel.vote.title').toLowerCase()),
        hintEl, grid,
        el('div', { style: 'margin-top:16px;display:flex;gap:10px' }, submitBtn),
      ));
    });
  }

  let roundNo = 0;
  for (let r = 1; r <= cfg.rounds; r++) {
    if (aborted) return;
    roundNo = r;
    const theme = cfg.mode === 'theme' ? THEMES[(r * 7) % THEMES.length] : null;
    // Templates zuweisen
    const keys = await pickTemplates(players.length, cfg.mode);
    const blobs = [];
    for (const k of keys) blobs.push((await resolveTpl(k)).blob);

    const memes = [];
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      await passGate(p.name);
      const cap = await new Promise((res) => {
        // turnPhase renderen und abwarten
        runTurn(p, theme, blobs[i], res);
      });
      memes.push({ playerId: p.id, name: p.name, blob: blobs[i], top: cap.top, bottom: cap.bottom });
    }

    // Abstimmung
    const votes = [];
    for (const v of players) {
      const picked = await votePhase(v, memes);
      votes.push({ voterId: v.id, voterName: v.name, picks: picked });
    }

    // Auswertung
    const scores = memes.map((m) => {
      const who = votes.filter((v) => v.picks.includes(m.playerId)).map((v) => v.voterName);
      const pts = who.length;
      if (!cfg.relaxed) totals.set(m.playerId, (totals.get(m.playerId) || 0) + pts);
      return { ...m, pts, voters: who };
    }).sort((a, b) => b.pts - a.pts);

    await resultPhase(r, scores, cfg);
  }

  if (!aborted) await finalPhase(players, totals, cfg);

  function resultPhase(r, scores, cfg2) {
    return new Promise((resolve) => {
      show(`${t('spiel.result.title')} · ${r}/${cfg2.rounds}`, el('div', { class: 'card turn-box' },
        el('div', { class: 'result-list' },
          ...scores.map((s, i) => {
            const img = el('img', { alt: s.name });
            renderMemeToDataUrl({ blob: s.blob, top: s.top, bottom: s.bottom }).then((u) => { img.src = u; });
            return el('div', { class: `result-row${i === 0 && s.pts > 0 ? ' winner' : ''}` },
              img,
              el('div', {},
                el('div', { style: 'font-weight:800' }, s.name),
                el('div', { class: 'voters' }, s.voters.length ? '👍 ' + s.voters.join(', ') : '—'),
              ),
              el('div', { class: 'pts' }, String(s.pts)),
            );
          }),
        ),
        el('div', { style: 'margin-top:18px;display:flex;gap:10px' },
          el('button', { class: 'btn btn-primary', onclick: () => resolve() }, r < cfg2.rounds ? '▶ ' + t('spiel.result.next') : '🏆 ' + t('spiel.final.title')),
        ),
      ));
    });
  }

  function finalPhase(playersArr, totals, cfg3) {
    return new Promise((resolve) => {
      confetti();
      const ranked = [...playersArr].sort((a, b) => (totals.get(b.id) || 0) - (totals.get(a.id) || 0));
      const medals = ['🥇', '🥈', '🥉', '4.', '5.', '6.', '7.', '8.'];
      show('👑 ' + t('spiel.final.title'), el('div', { class: 'card' },
        el('div', { class: 'final-rank' },
          ...ranked.map((p, i) => el('div', { class: `final-row${i === 0 ? ' first' : ''}` },
            el('span', { class: 'medal' }, medals[i]),
            p.name,
            el('span', { class: 'pts' }, String(totals.get(p.id) || 0) + (cfg3.relaxed ? '' : ' P.')),
          )),
        ),
        el('div', { style: 'display:flex;gap:10px;justify-content:center;flex-wrap:wrap' },
          el('button', { class: 'btn btn-primary', onclick: () => { confetti(); window.dispatchEvent(new CustomEvent('mm:goto', { detail: '#/spiel' })); } }, '🔁 ' + t('spiel.final.again')),
          el('button', { class: 'btn', onclick: () => { location.hash = '#/'; } }, '🏠 ' + t('spiel.final.home')),
        ),
      ));
    });
  }

  // turnPhase wrapper
  async function runTurn(player, theme, tplBlob, doneCb) {
    app.innerHTML = '';
    let settled = false;
    const finish = (top, bottom) => { if (!settled) { settled = true; doneCb({ top, bottom }); } };

    const canvas = el('canvas', { width: 640, height: 640 });
    const preview = livePreview(canvas, tplBlob);
    const topIn = el('textarea', { rows: 2, placeholder: t('spiel.turn.top') });
    const botIn = el('textarea', { rows: 2, placeholder: t('spiel.turn.bottom') });
    const timerWrap = el('div', { class: 'timerbar' }, el('i'));
    const submitBtn = el('button', { class: 'btn btn-green', onclick: () => finish(topIn.value, botIn.value) }, '✅ ' + t('spiel.turn.submit'));
    const inspoBtn = el('button', { class: 'btn btn-sm', onclick: () => {
      topIn.value = rand(INSPO_TOPS); botIn.value = rand(INSPO_BOTTOMS);
      preview.set(topIn.value, botIn.value);
    } }, '💡 ' + t('spiel.turn.inspo'));

    const upd = () => preview.set(topIn.value, botIn.value);
    topIn.addEventListener('input', upd);
    botIn.addEventListener('input', upd);

    app.append(el('div', { class: 'wrap phase-screen' },
      el('h1', {}, `${player.name}${theme ? ` · 🎭 ${theme}` : ''}`),
      el('div', { class: 'turn-box card' },
        el('div', { class: 'meme-preview' }, canvas),
        el('label', {}, t('spiel.turn.top')), topIn,
        el('label', { style: 'margin-top:10px' }, t('spiel.turn.bottom')), botIn,
        timerWrap,
        el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' }, submitBtn, inspoBtn),
      ),
    ));

    let left = cfg.timeSec;
    const startedAt = Date.now();
    const iv = setInterval(() => {
      if (settled) return clearInterval(iv);
      left = Math.max(0, cfg.timeSec - Math.floor((Date.now() - startedAt) / 1000));
      timerWrap.firstElementChild.style.width = (left / cfg.timeSec) * 100 + '%';
      timerWrap.classList.toggle('warn', left <= 10);
      if (left <= 0) { clearInterval(iv); finish(topIn.value, botIn.value); }
    }, 250);
  }
}

// ============ LAN-Partie ============
export async function openLanSetup(container) {
  container.innerHTML = '';
  const nameInput = el('input', { type: 'text', placeholder: t('spiel.yourName'), value: 'Gast_' + Math.floor(Math.random() * 900 + 100) });
  const codeInput = el('input', { type: 'text', maxlength: 4, style: { width: '110px', textTransform: 'uppercase' } });
  const statusEl = el('p', { style: 'font-weight:700;color:var(--muted)' });

  if (!ServerAPI.available) {
    statusEl.textContent = '⚠️ ' + t('spiel.lan.needserver');
  } else {
    statusEl.textContent = '🟢 ' + t('spiel.lan.connected');
  }

  async function startHost() {
    const codeStr = roomCode();
    await enterLobby({ code: codeStr, host: true, name: nameInput.value.trim() || 'Host', statusEl });
  }
  async function joinRoom() {
    const codeStr = codeInput.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(codeStr)) { toast('Code hat 4 Zeichen'); return; }
    if (!nameInput.value.trim()) { toast(t('spiel.yourName')); return; }
    await enterLobby({ code: codeStr, host: false, name: nameInput.value.trim(), statusEl });
  }

  container.append(
    el('div', { class: 'wrap game-grid' },
      el('div', { class: 'card' },
        el('h2', {}, t('spiel.lan') + ' · ' + t('spiel.createRoom')),
        el('label', {}, t('spiel.yourName')), nameInput,
        el('div', { style: 'margin-top:16px' }, el('button', { class: 'btn btn-primary', onclick: startHost, disabled: !ServerAPI.available }, '🏠 ' + t('spiel.createRoom'))),
      ),
      el('div', { class: 'card' },
        el('h2', {}, t('spiel.lan') + ' · ' + t('spiel.joinRoom')),
        el('label', {}, t('spiel.roomCode')), codeInput,
        el('div', { style: 'margin-top:16px' }, el('button', { class: 'btn btn-blue', onclick: joinRoom, disabled: !ServerAPI.available }, '🔑 ' + t('spiel.joinRoom'))),
        el('div', { style: 'margin-top:14px' }, statusEl),
      ),
    ),
  );
}

function enterLobby({ code, host, name, statusEl }) {
  return new Promise((resolve) => {
    const app = document.getElementById('app');
    const room = new Room(code, name);
    const players = new Map(); // selfId -> name
    let hostId = null;
    let myId = room.selfId;
    let leftGame = false;
    let startedFlag = false; // true sobald „start“ im Raum angekommen ist
    let ownKeys = []; // eigene Server-Keys dieser Person ('srv:...')
    lanState.room = room;

    function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }

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
    let cfg = { mode: 'random', relaxed: false, rounds: 3, timeSec: 60, maxVotes: 2, ownPacks: false };
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
      const roundsIn = el('input', { type: 'number', min: 1, max: 8, value: 3, style: { width: '80px' } });
      roundsIn.addEventListener('input', () => set('rounds', Math.max(1, Number(roundsIn.value) || 3)));
      const timeIn = el('input', { type: 'number', min: 15, max: 300, step: 5, value: 60, style: { width: '90px' } });
      timeIn.addEventListener('input', () => set('timeSec', Math.max(15, Number(timeIn.value) || 60)));
      const ownChk = el('input', { type: 'checkbox' });
      ownChk.addEventListener('change', () => set('ownPacks', ownChk.checked));
      g.append(
        el('h3', {}, t('spiel.setup.t')),
        radios,
        el('div', { style: 'display:flex;gap:8px;align-items:center;margin-top:10px' }, rel, el('span', {}, t('spiel.relaxed'))),
        el('div', { style: 'display:flex;gap:8px;align-items:center;margin-top:10px' }, ownChk, el('span', {}, t('spiel.ownPacks'))),
        el('div', { class: 'fieldrow', style: 'margin-top:10px' },
          el('div', {}, el('label', {}, t('spiel.rounds')), roundsIn),
          el('div', {}, el('label', {}, t('spiel.time')), timeIn),
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
      if (s === 'closed') setStatus('⚠️ ' + t('spiel.lan.error'));
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
          if (msg.playerId === myId) doTurn(msg);
          else showWaiting(players.get(msg.playerId));
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
const lanState = { cfg: null, room: null, round: 0, rounds: 3, memes: [], votes: [], totals: new Map(), theme: null, players: [], assignments: new Map(), turnAdvance: null, voteAdvance: null, ownPacks: new Map() }; // ownPacks: selfId -> [srv-Keys]

/** Host: Caption aus einer „submit“-Nachricht in die laufende Runde übernehmen */
export function handleHostSubmit(msg) {
  if (!msg?.selfId) return;
  const top = String(msg.top ?? '').slice(0, 200);
  const bottom = String(msg.bottom ?? '').slice(0, 200);
  const found = lanState.memes.find((m) => m.playerId === msg.selfId);
  if (found) {
    found.top = top; found.bottom = bottom;
    lanState.turnAdvance?.();
    return;
  }
  const p = lanState.players.find((x) => x.id === msg.selfId);
  if (!p) return;
  lanState.memes.push({ playerId: p.id, name: p.name, top, bottom, tplKey: lanState.assignments.get(p.id) || null });
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

function showWaiting(name) {
  const app = document.getElementById('app');
  app.innerHTML = '';
  app.append(el('div', { class: 'wrap phase-screen waiting' },
    el('div', { class: 'spinner-meme' }, '⏳'),
    el('h1', {}, t('spiel.waiting') + ': ', el('strong', {}, name || '…')),
    el('p', { style: 'color:var(--muted)' }, 'Gleich bist du dran.'),
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
    const preview = livePreview(canvas, tpl.blob);
    const topIn = el('textarea', { rows: 2, placeholder: t('spiel.turn.top') });
    const botIn = el('textarea', { rows: 2, placeholder: t('spiel.turn.bottom') });
    const timerWrap = el('div', { class: 'timerbar' }, el('i'));
    const submitBtn = el('button', { class: 'btn btn-green', onclick: () => finish(topIn.value, botIn.value) }, '✅ ' + t('spiel.turn.submit'));
    const upd = () => preview.set(topIn.value, botIn.value);
    topIn.addEventListener('input', upd);
    botIn.addEventListener('input', upd);

    app.innerHTML = '';
    app.append(el('div', { class: 'wrap phase-screen' },
      el('h1', {}, `${t('spiel.turn.yours')}${msg.theme ? ` · 🎭 ${msg.theme}` : ''}`),
      el('div', { class: 'turn-box card' },
        el('div', { class: 'meme-preview' }, canvas),
        el('label', {}, t('spiel.turn.top')), topIn,
        el('label', { style: 'margin-top:10px' }, t('spiel.turn.bottom')), botIn,
        timerWrap,
        el('div', { style: 'margin-top:14px' }, submitBtn),
      ),
    ));

    const leftSec = Math.max(1, Math.round((msg.until - Date.now()) / 1000));
    const startedAt = Date.now();
    const iv = setInterval(() => {
      if (settled) return clearInterval(iv);
      const left = Math.max(0, leftSec - Math.floor((Date.now() - startedAt) / 1000));
      timerWrap.firstElementChild.style.width = (left / leftSec) * 100 + '%';
      timerWrap.classList.toggle('warn', left <= 10);
      if (left <= 0) { clearInterval(iv); finish(topIn.value, botIn.value); }
    }, 250);
  }

  function finish(top, bottom) {
    if (settled) return;
    settled = true;
    const room = lanState.room;
    room.send({ type: 'submit', selfId: room.selfId, top: String(top).slice(0, 200), bottom: String(bottom).slice(0, 200) });
  }

  setupPreview();
}

function doVote(msg) {
  if (msg.tpls) Object.assign(window.__lanTpls = window.__lanTpls || {}, msg.tpls);
  const app = document.getElementById('app');
  let maxVotes = msg.maxVotes || 2;
  const picks = new Set();
  const grid = el('div', { class: 'vote-grid' });
  const cards = [];
  for (const m of msg.memes) {
    if (m.playerId === msg.myId) continue;
    const img = el('img', { alt: m.name });
    (async () => {
      const tpl = await resolveTpl(m.tplKey);
      if (!tpl) return;
      img.src = await renderMemeToDataUrl({ blob: tpl.blob, top: m.top, bottom: m.bottom });
    })();
    const card = el('div', { class: 'vote-card' }, img, el('div', { class: 'vote-meta' }, m.name));
    card.addEventListener('click', () => toggle(card, m.playerId));
    grid.append(card);
    cards.push({ id: m.playerId, node: card });
  }
  const submitBtn = el('button', { class: 'btn btn-primary', disabled: true }, '🗳️ ' + t('spiel.vote.submit'));

  function toggle(card, pid) {
    if (picks.has(pid)) picks.delete(pid);
    else {
      if (picks.size >= maxVotes) { const first = cards.find((c) => c.id !== pid && picks.has(c.id)); if (first) picks.delete(first.id); }
      picks.add(pid);
    }
    cards.forEach((c) => c.node.classList.toggle('picked', picks.has(c.id)));
    submitBtn.disabled = picks.size === 0;
  }
  submitBtn.addEventListener('click', () => {
    lanState.room.send({ type: 'vote', selfId: lanState.room.selfId, picks: [...picks] });
  });

  app.innerHTML = '';
  app.append(el('div', { class: 'wrap phase-screen' },
    el('h1', {}, t('spiel.vote.title')),
    el('div', { class: 'card turn-box' },
      el('p', { style: 'font-weight:800' }, t('spiel.vote.hint', { n: maxVotes })),
      grid,
      el('div', { style: 'margin-top:16px' }, submitBtn),
    ),
  ));
}

function doResult(msg) {
  const app = document.getElementById('app');
  const rows = el('div', { class: 'result-list' });
  for (const s of msg.scores) {
    const img = el('img', { alt: s.name });
    (async () => {
      const tpl = await resolveTpl(s.tplKey);
      if (tpl) img.src = await renderMemeToDataUrl({ blob: tpl.blob, top: s.top, bottom: s.bottom });
    })();
    rows.append(el('div', { class: `result-row${s.pts === Math.max(...msg.scores.map((x) => x.pts)) && s.pts > 0 ? ' winner' : ''}` },
      img,
      el('div', {}, el('div', { style: 'font-weight:800' }, s.name), el('div', { class: 'voters' }, s.voters.length ? '👍 ' + s.voters.join(', ') : '—')),
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
  const medals = ['🥇', '🥈', '🥉', '4.', '5.', '6.', '7.', '8.'];
  app.innerHTML = '';
  app.append(el('div', { class: 'wrap phase-screen' },
    el('h1', {}, '👑 ' + t('spiel.final.title')),
    el('div', { class: 'card' },
      el('div', { class: 'final-rank' },
        ...msg.standings.map((s, i) => el('div', { class: `final-row${i === 0 ? ' first' : ''}` },
          el('span', { class: 'medal' }, medals[i]),
          s.name,
          el('span', { class: 'pts' }, String(s.pts) + (msg.relaxed ? '' : ' P.')),
        )),
      ),
      el('div', { style: 'display:flex;gap:10px;justify-content:center' },
        el('button', { class: 'btn', onclick: () => { location.hash = '#/'; } }, '🏠 ' + t('spiel.final.home')),
      ),
    ),
  ));
}

// Host-Seite (wird von der Lobby-Closure aufgerufen)
window.__lanHostStart = function (cfg, room, playersMap, myId) {
  lanState.cfg = cfg;
  lanState.room = room;
  lanState.rounds = cfg.rounds;
  lanState.totals = new Map([...playersMap.keys()].map((id) => [id, 0]));
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
      if (tpl) tpls[k] = await renderMemeToDataUrl({ blob: tpl.blob, top: '', bottom: '' }, 900);
    }

    // Runden an den Host senden → Broadcast
    // Turn-Phase
    let i = 0;
    function nextTurn() {
      if (i >= playerList.length) { startVoting(); return; }
      const p = playerList[i];
      const tplKey = tplKeys[i];
      i++;
      room.send({
        type: 'turn', playerId: p.id, name: p.name, round: r,
        theme, tplKey, tpls,
        until: Date.now() + cfg.timeSec * 1000,
      });
      let moved = false;
      const advance = () => { if (moved) return; moved = true; clearTimeout(timer); lanState.turnAdvance = null; nextTurn(); };
      const timer = setTimeout(() => {
        if (!lanState.memes.some((m) => m.playerId === p.id)) {
          lanState.memes.push({ playerId: p.id, name: p.name, top: '', bottom: '', tplKey });
        }
        advance();
      }, cfg.timeSec * 1000 + 400);
      // Sobald die Caption dieser Person da ist, direkt weiter
      lanState.turnAdvance = () => {
        if (lanState.memes.some((m) => m.playerId === p.id)) advance();
      };
    }
    nextTurn();

    function startVoting() {
      const memes = lanState.memes.map((m) => ({ playerId: m.playerId, name: m.name, top: m.top, bottom: m.bottom, tplKey: m.tplKey }));
      // Voting pro Spieler
      let vi = 0;
      function nextVote() {
        if (vi >= playerList.length) { tally(); return; }
        const v = playerList[vi]; vi++;
        room.send({
          type: 'voting-start',
          myId: v.id, maxVotes: cfg.maxVotes || Math.max(1, playerList.length - 1),
          memes, tpls,
        });
        let moved = false;
        const advance = () => { if (moved) return; moved = true; clearTimeout(timer); lanState.voteAdvance = null; nextVote(); };
        const timer = setTimeout(() => {
          if (!lanState.votes.some((x) => x.selfId === v.id)) lanState.votes.push({ selfId: v.id, picks: [] });
          advance();
        }, (cfg.timeSec + 20) * 1000);
        lanState.voteAdvance = () => {
          if (lanState.votes.some((x) => x.selfId === v.id)) advance();
        };
      }
      nextVote();
    }

    function tally() {
      const scores = lanState.memes.map((m) => {
        const voters = lanState.votes.filter((v) => v.picks.includes(m.playerId)).map((v) => playerList.find((p) => p.id === v.selfId)?.name || '?');
        const pts = voters.length;
        if (!cfg.relaxed) lanState.totals.set(m.playerId, (lanState.totals.get(m.playerId) || 0) + pts);
        return { ...m, pts, voters };
      }).sort((a, b) => b.pts - a.pts);

      const isLast = r >= lanState.rounds;
      room.send({ type: 'result', round: r, rounds: lanState.rounds, scores });

      setTimeout(() => {
        if (isLast) {
          const standings = playerList
            .map((p) => ({ id: p.id, name: p.name, pts: lanState.totals.get(p.id) || 0 }))
            .sort((a, b) => b.pts - a.pts);
          room.send({ type: 'final', standings, relaxed: cfg.relaxed });
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
  if (!lanState.votes.some((v) => v.selfId === msg.selfId)) {
    lanState.votes.push({ selfId: msg.selfId, picks: msg.picks || [] });
  }
  lanState.voteAdvance?.();
};
