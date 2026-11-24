// ============ Meme-Partie: Lobby + Spiel-Phasen ============
import { el, t, LS, rand, shuffle, toast, confetti, roomCode, uid } from './lib.js';
import { MemeCanvas, renderMemeToDataUrl } from './editor.js';
import { zoneFor, layerPatch, normLayers } from './textzones.js';
import { Packs, ServerAPI } from './packs.js';
import { Room } from './net.js';
import { createZip } from './zip.js';
import { scoreRound, applyTotals } from './scoring.js';

// Spiel-Styles liegen in css/game.css; index.html bleibt unangetastet.
if (!document.querySelector('link[data-game-css]')) {
  document.head.append(el('link', { rel: 'stylesheet', href: 'css/game.css', 'data-game-css': '' }));
}

function fallbackCopy(text) {
  const tmp = el('input', { type: 'text', value: text, readonly: true, 'aria-hidden': 'true', tabindex: '-1', class: 'copy-helper' });
  document.body.append(tmp);
  tmp.select();
  tmp.setSelectionRange(0, text.length);
  const ok = document.execCommand?.('copy');
  tmp.remove();
  if (!ok) throw new Error('copy failed');
}

function copyText(text) {
  return new Promise((resolve, reject) => {
    const done = () => { try { fallbackCopy(text); resolve(); } catch { reject(new Error('copy failed')); } };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(resolve, done);
    else done();
  });
}

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

const THEMES_EN = [
  'Monday morning',
  'Your browser with 47 tabs',
  'First day at university',
  'Wi-Fi on holiday',
  'Your code at 2 a.m.',
  'Vegan at the barbecue',
  'Black Friday panic',
  'Cat vs. window',
  'The last seat in the cinema',
  'Mum calls for the third time',
  'Sunday gym session',
  'Rush hour at 5:05 p.m.',
  'Your group chat “we never reply”',
  'Exam prep, week one',
  'The printer that never finds paper',
  'Sushi or curry?',
  'Your alarm at 6 a.m.',
  'Neighbourhood summer party',
  'The last train home',
  'Spreadsheet row 14,302',
  'Game night, round one',
  'The car boot before the holiday',
  'Garage appointment, take two',
  'Your garden in May',
  'New Year’s Eve at 23:59',
  'The follow-up meeting at 10:41 p.m.',
];

const INSPO_TOPS = ['WHEN THE', 'DER MOMENT ALS', 'POV: DU', 'WANN DICH', 'EINMAL', 'JEDER WEISS, DASS'];
const INSPO_BOTTOMS = ['NIE WIEDER SLEEPS', 'DEIN CHAT VERLÄSST DEN RAUM', 'DAS BÄRKCHEN AUFTAUCHT', 'DU SCHON GEWUSST HAST', 'DER PLAN GEHT AUF', 'SIE DIE TÜR FALSCH AUFMACHT'];
const INSPO_TOPS_EN = ['WHEN THE', 'THE MOMENT', 'POV: YOU', 'EVERY TIME', 'NOBODY TOLD ME', 'ME EXPLAINING'];
const INSPO_BOTTOMS_EN = ['WI-FI DIES AGAIN', 'YOUR CHAT LEAVES THE ROOM', 'THE PLOT TWIST ARRIVES', 'YOU ALREADY KNEW', 'THE PLAN WORKS OUT', 'THEY OPEN THE WRONG DOOR'];

function themesForLang() { return LS.get('lang', 'de') === 'en' ? THEMES_EN : THEMES; }

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

async function templateKeyPool() {
  const local = (await Packs.allTemplates()).map((t) => t.id);
  let server = [];
  if (ServerAPI.available) {
    try {
      server = (await ServerAPI.library())
        .filter((item) => item.public)
        .map((item) => `srv:${item.id}`);
    } catch { /* Server kurz weg – lokale Packs reichen */ }
  }
  return [...local, ...server];
}

async function pickTemplates(count, mode, idList = [], ownPools = null) {
  const keys = await templateKeyPool();
  // ownPacks: pro Spieler eigene Keys ('srv:...') – nur wenn der Host sie erlaubt.
  const needPool = mode === 'same' || !ownPools || idList.some((id) => !ownPools.get(id)?.length);
  if (!keys.length && needPool) throw new Error(t('spiel.noTemplates'));
  const pool = shuffle(keys);
  const out = [];
  for (let i = 0; i < count; i++) {
    // 'same' behält bewusst EIN gemeinsames Template – eigene Packs gelten nur in random/theme
    const own = ownPools && mode !== 'same' ? ownPools.get(idList[i]) : null;
    if (own?.length) { out.push(rand(own)); continue; }
    out.push(mode === 'same' ? pool[0] : pool[i % pool.length]);
  }
  return out;
}

// Mini-Studio in der Runde: beliebig viele Textfelder, Klick/Drag auf dem Bild positioniert das fokussierte Feld

// ============ Gemeinsame Views ============
// ============ Lobby (erstellen + beitreten) ============
export async function openLobby(container) {
  container.innerHTML = '';
  if (!ServerAPI.available) {
    container.append(el('div', { class: 'wrap' },
      el('div', { class: 'card', style: 'max-width:560px;margin:34px auto' },
        el('h2', {}, t('lobby.title')),
        el('p', { style: 'color:var(--muted)' }, t('lobby.needserver')),
      ),
    ));
    return;
  }

  const nameInput = el('input', { type: 'text', name: 'name', autocomplete: 'name', value: 'Gast_' + Math.floor(Math.random() * 900 + 100) });
  const lobbyInput = el('input', { type: 'text', name: 'lobby', placeholder: t('lobby.name') });
  const codeInput = el('input', { type: 'text', name: 'code', maxlength: 4, 'aria-label': t('lobby.byCode') });
  // Einladungslink (#/spiel?code=XXXX) füllt den Code direkt vor.
  const wantsCode = new URLSearchParams(location.hash.split('?')[1] || '').get('code');
  if (wantsCode) codeInput.value = wantsCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  const statusEl = el('p', { class: 'panel-note', 'aria-live': 'polite', hidden: true });
  let poll = null;
  let entering = false;

  async function join(code, opts = {}) {
    const name = nameInput.value.trim();
    if (!name) { toast(t('spiel.yourName')); return; }
    if (entering) return;
    entering = true;
    clearInterval(poll);
    await enterLobby({ code, host: !!opts.host, name, statusEl, lobby: opts.lobby, pub: !!opts.pub });
  }

  function createLobby(pub) {
    join(roomCode(), { host: true, pub, lobby: lobbyInput.value.trim() || null });
  }

  async function quickPlay() {
    let list = [];
    try { list = await ServerAPI.lobbies(); } catch { list = []; }
    if (list.length) join(list[0].code, { pub: true });
    else createLobby(true);
  }

  function joinByCode() {
    const code = codeInput.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code)) { toast(t('lobby.codeBad')); return; }
    join(code, {});
  }
  codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinByCode(); });

  const listWrap = el('div', { class: 'lobby-list' });
  async function renderLobbies() {
    let list = [];
    try { list = await ServerAPI.lobbies(); } catch { return; }
    listWrap.innerHTML = '';
    if (!list.length) { listWrap.append(el('p', { class: 'panel-note', style: 'margin:0' }, t('lobby.noOpen'))); return; }
    for (const l of list) {
      listWrap.append(el('div', { class: 'lobby-row' },
        el('span', {}, (l.name || l.code) + ' · ' + t('lobby.playersIn', { n: l.players })),
        el('button', { class: 'btn btn-sm btn-blue', type: 'button', onclick: () => join(l.code, { pub: true }) }, '→ ' + t('lobby.join')),
      ));
    }
  }

  function art(icons) {
    return el('span', { class: 'pc-stack', 'aria-hidden': 'true' },
      ...icons.map((icon) => el('span', { class: 'pc-photo' }, icon)),
    );
  }

  function playCard({ cls, tag = 'button', href, onclick, emoji, title, desc, cta, images }) {
    return el(tag, { class: `play-card ${cls}`, ...(href ? { href } : { type: 'button', onclick }) },
      art(images),
      el('span', { class: 'pc-emoji', 'aria-hidden': 'true' }, emoji),
      el('span', { class: 'pc-copy' },
        el('span', { class: 'pc-title' }, title),
        el('span', { class: 'pc-desc' }, desc),
        el('span', { class: 'pc-cta' }, cta + ' →'),
      ),
    );
  }

  container.append(
    el('div', { class: 'wrap home' },
      el('section', { class: 'home-hero' },
        el('span', { class: 'kicker' }, '🎉 ' + t('home.kicker')),
        el('h1', { html: t('home.title') }),
        el('p', { class: 'home-lead' }, t('home.lead')),
      ),
      el('details', { class: 'home-setup', open: wantsCode ? '' : null },
        el('summary', {}, '👤 ' + t('home.setup')),
        el('div', { class: 'home-fields' },
          el('div', {}, el('label', {}, t('spiel.yourName')), nameInput),
          el('div', {}, el('label', {}, t('home.lobbyName')), lobbyInput),
        ),
      ),
      el('div', { class: 'play-grid' },
        playCard({
          cls: 'quick', onclick: quickPlay, emoji: '⚡',
          title: t('home.quick'), desc: t('home.quick.d'), cta: t('home.quick.cta'),
          images: ['😂', '💥', '⚡'],
        }),
        playCard({
          cls: 'private', onclick: () => createLobby(false), emoji: '🔒',
          title: t('home.private'), desc: t('home.private.d'), cta: t('home.private.cta'),
          images: ['🤫', '🎉', '🔒'],
        }),
        playCard({
          cls: 'studio', tag: 'a', href: '#/studio', emoji: '🖌️',
          title: t('home.studio'), desc: t('home.studio.d'), cta: t('home.studio.cta'),
          images: ['🖌️', '🖼️', '✨'],
        }),
      ),
      el('div', { class: 'home-lower' },
        el('div', { class: 'card home-panel' },
          el('h2', {}, '🌍 ' + t('lobby.openList')),
          listWrap,
          el('h3', {}, t('lobby.byCode')),
          el('div', { class: 'join-code' }, codeInput, el('button', { class: 'btn btn-blue', type: 'button', onclick: joinByCode }, t('lobby.join'))),
          statusEl,
        ),
        el('section', { class: 'how' },
          el('h2', {}, t('home.how')),
          el('div', { class: 'how-grid' },
            ...[t('home.step1'), t('home.step2'), t('home.step3')].map((label, i) =>
              el('div', { class: 'how-step' }, el('b', {}, String(i + 1)), el('span', {}, label)),
            ),
          ),
        ),
      ),
    ),
  );

  renderLobbies();
  // shortcut: polling alle 5s, wenn die Lobby-Liste lebt; upgrade auf WS-Push, wenn Live-Updates gefordert sind
  poll = setInterval(() => { if (!listWrap.isConnected) return clearInterval(poll); renderLobbies(); }, 5000);
}

function enterLobby({ code, host, name, statusEl, lobby, pub }) {
  return new Promise((resolve) => {
    const app = document.getElementById('app');
    const room = new Room(code, name, { lobby, pub });
    const players = new Map(); // selfId -> name
    let myId = room.selfId;
    let hostId = host ? myId : null;
    let leftGame = false;
    let startedFlag = false; // true sobald „start“ im Raum angekommen ist
    let ownKeys = []; // eigene Server-Keys dieser Person ('srv:...')
    lanState.room = room;
    window.__mmInGame = true;
    document.body.classList.add('in-game');

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
      lanState.hostId = hostId;
      lobbyCard.innerHTML = '';
      const inviteUrl = `${location.origin}${location.pathname}#/spiel?code=${encodeURIComponent(code)}`;

      async function copyInvite() {
        try {
          await copyText(`${t('spiel.invite.text', { code })} ${inviteUrl}`);
          toast(t('spiel.invite.copied'));
        } catch {
          toast(t('spiel.invite.failed'));
        }
      }

      lobbyCard.append(
        el('h2', {}, t('spiel.lobby')),
        el('div', { class: 'lobby-code' },
          el('span', { class: 'lobby-code-label' }, t('spiel.lobby.code')),
          el('div', { class: 'invite-bar' },
            el('code', { class: 'invite-code' }, code),
            el('button', {
              class: 'btn btn-sm invite-copy', type: 'button',
              title: t('spiel.invite.copy'), 'aria-label': t('spiel.invite.copy'),
              onclick: copyInvite,
            }, '🔗 ' + t('spiel.invite.copy')),
          ),
        ),
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
        const canStart = players.size >= 2;
        lobbyCard.append(el('div', { class: 'lobby-actions' },
          el('button', {
            class: 'btn btn-primary', type: 'button', disabled: !canStart,
            title: canStart ? null : t('spiel.lobby.needPlayers'),
            onclick: () => startFromLobby(),
          }, '🚀 ' + t('spiel.start')),
          el('button', { class: 'btn', type: 'button', onclick: () => leave() }, '← ' + t('spiel.final.home')),
        ));
        if (!canStart) lobbyCard.append(el('p', { class: 'lobby-hint', role: 'status' }, '⏳ ' + t('spiel.lobby.needPlayers')));
      } else {
        lobbyCard.append(
          el('div', { class: 'lobby-waitbox', role: 'status', 'aria-live': 'polite' },
            el('span', { class: 'wait-dots', 'aria-hidden': 'true' }, el('i'), el('i'), el('i')),
            el('strong', {}, t('spiel.lobby.hostWait')),
            el('p', { class: 'lobby-hint' }, t('spiel.lobby.guestHint')),
          ),
          el('div', { class: 'lobby-actions' },
            el('button', { class: 'btn', type: 'button', onclick: () => leave() }, '← ' + t('spiel.final.home')),
          ),
        );
      }
      if (setupCardOuter) setupCardOuter.style.display = hostId === myId ? '' : 'none';
    }

    // Setup-Formular für Host in der Lobby
    let cfg = { mode: 'random', relaxed: false, rounds: 3, timeSec: 90, ownPacks: false, autoNext: false };
    function setupControls() {
      const g = el('div', { class: 'card', style: 'max-width:560px;margin:14px auto' });
      const set = (k, v) => { cfg[k] = v; };
      const radios = el('div', { class: 'mode-cards' });
      for (const m of ['random', 'same', 'theme']) {
        radios.append(el('label', { class: 'mode-card' },
          el('input', { type: 'radio', name: 'lm', value: m, checked: m === 'random' ? 'checked' : '' }),
          el('span', { class: 'mode-copy' },
            el('strong', {}, t(`spiel.modes.${m}`)),
            el('small', {}, t(`spiel.modes.${m}.d`)),
          ),
        ));
      }
      radios.querySelectorAll('input').forEach((r) => r.addEventListener('change', () => set('mode', radios.querySelector('input:checked').value)));
      const rel = el('input', { type: 'checkbox' });
      rel.addEventListener('change', () => set('relaxed', rel.checked));
      const roundsSel = el('select', {}, ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => el('option', { value: n, ...(n === 3 ? { selected: '' } : {}) }, String(n))));
      roundsSel.addEventListener('change', () => set('rounds', Number(roundsSel.value) || 3));
      const timeSel = el('select', {}, ...[45, 60, 90, 120].map((n) => el('option', { value: n, ...(n === 90 ? { selected: '' } : {}) }, n + ' s')));
      timeSel.addEventListener('change', () => set('timeSec', Number(timeSel.value) || 90));
      const ownChk = el('input', { type: 'checkbox' });
      ownChk.addEventListener('change', () => set('ownPacks', ownChk.checked));
      const autoChk = el('input', { type: 'checkbox' });
      autoChk.addEventListener('change', () => set('autoNext', autoChk.checked));
      g.append(
        el('h3', {}, t('spiel.setup.t')),
        radios,
        el('div', { style: 'display:flex;gap:8px;align-items:center;margin-top:10px' }, rel, el('span', {}, t('spiel.relaxed'))),
        el('div', { style: 'display:flex;gap:8px;align-items:center;margin-top:10px' }, autoChk, el('span', { title: t('spiel.autoNext.d') }, t('spiel.autoNext'))),
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
    window.scrollTo(0, 0);

    function hardLeave() {
      leftGame = true;
      window.__mmInGame = false;
      window.__mmLeaveGame = null;
      lanState.phase = 'idle';
      clearTimeout(lanState.reviewTimer);
      lanState.reviewTimer = null;
      lanState.reviewAdvance = null;
      document.body.classList.remove('in-game');
      if (lanState.room === room) lanState.room = null;
      room.close();
    }
    function leave() {
      hardLeave();
      location.hash = '#/';
    }
    window.__mmLeaveGame = leave;

    // Wer die Spiel-Route per Navigation verlässt, verlässt auch den Raum –
    // sonst warten die anderen auf eine Caption/Stimme, die nie kommt.
    window.addEventListener('hashchange', () => {
      if (!leftGame && !location.hash.startsWith('#/spiel')) hardLeave();
    });
    window.addEventListener('pagehide', () => { try { room.close(); } catch {} }, { once: true });

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
          if (hostId === myId && startedFlag) {
            if (lanState.collecting) handleHostSubmit({ selfId: msg.selfId, layers: [] });
            if (lanState.voting) window.__lanHostVote({ selfId: msg.selfId, ups: [], downs: [], mehs: [], peak: null });
          }
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
        case 'reroll':
          if (hostId === myId) window.__lanHostReroll?.(msg);
          break;
        case 'rerolled':
          lanState.rerollApply?.(msg);
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
const lanState = { cfg: null, room: null, round: 0, rounds: 3, memes: [], votes: [], totals: new Map(), theme: null, players: [], assignments: new Map(), tpls: {}, turnAdvance: null, voteAdvance: null, reviewAdvance: null, reviewTimer: null, ownPacks: new Map(), collecting: false, voting: false, allMemes: [], phase: 'idle' }; // ownPacks: selfId -> [srv-Keys]

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
  lanState.phase = 'start';
  lanState.cfg = msg.cfg;
  lanState.round = 0;
  lanState.totals = new Map(msg.players.map((p) => [p.id, 0]));
  const app = document.getElementById('app');
  app.innerHTML = '';
  app.append(el('div', { class: 'wrap phase-screen waiting' },
    el('div', { class: 'spinner-meme' }, '🎬'),
    el('h1', {}, t('spiel.round.start', { n: 1 })),
  ));
  window.scrollTo(0, 0);
}

function doTurn(msg) {
  lanState.phase = 'turn';
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
    const turnSecs = el('span', { class: 'vote-secs', 'aria-hidden': 'true' });
    const timerRow = el('div', { class: 'turn-timer' }, timerWrap, turnSecs);

    function finish() {
      if (settled) return;
      settled = true;
      clearInterval(iv);
      let preview = null;
      try { preview = canvas.toDataURL('image/png'); } catch { /* Canvas gesperrt – ohne Vorschau weitermachen */ }
      mc.dispose();
      const room = lanState.room;
      const layers = mc.layers.map((l) => ({ text: String(l.text).slice(0, 200), xF: +(l.x / mc.cw).toFixed(3), yF: +(l.y / mc.ch).toFixed(3), fsF: +(l.fontSize / base).toFixed(3) }));
      lanState.rerollApply = null;
      room?.send({ type: 'submit', selfId: room.selfId, layers });
      showSubmitted(preview);
    }

    function showSubmitted(preview) {
      if (lanState.phase !== 'turn') return;
      const hooks = ['spiel.turn.quip1', 'spiel.turn.quip2', 'spiel.turn.quip3', 'spiel.turn.quip4'];
      const quip = el('p', { class: 'submitted-quip', 'aria-live': 'polite' }, t(rand(hooks)));
      const box = el('div', { class: 'wrap phase-screen turn-screen submitted-screen' },
        el('h1', {}, '🏆 ' + t('spiel.turn.submitted')),
        el('div', { class: 'card submitted-card' },
          preview ? el('img', { class: 'submitted-meme', src: preview, alt: '' }) : null,
          el('h2', { class: 'submitted-hook' }, t('spiel.turn.waitTitle')),
          quip,
          el('p', { class: 'lobby-hint' }, t('spiel.turn.waitOthers')),
        ),
      );
      app.innerHTML = '';
      app.append(box);
      window.scrollTo(0, 0);
      const quipIv = setInterval(() => {
        if (!box.isConnected) { clearInterval(quipIv); return; }
        quip.textContent = t(rand(hooks));
      }, 2600);
    }

    let rerollBusy = false;
    const rerollBtn = el('button', {
      class: 'btn btn-sm', type: 'button', title: t('spiel.turn.reroll'),
      onclick: () => {
        if (settled || rerollBusy || !lanState.room) return;
        rerollBusy = true;
        rerollBtn.disabled = true;
        rerollBtn.textContent = '… ' + t('spiel.turn.reroll');
        lanState.room.send({ type: 'reroll', selfId: msg.playerId });
        setTimeout(() => {
          if (settled || !rerollBusy) return;
          rerollBusy = false;
          rerollBtn.disabled = false;
          rerollBtn.textContent = '🎲 ' + t('spiel.turn.reroll');
        }, 5000);
      },
    }, '🎲 ' + t('spiel.turn.reroll'));

    lanState.rerollApply = async (m) => {
      if (settled || !canvas.isConnected || m.playerId !== msg.playerId) return;
      try {
        const res = await fetch(m.tpl);
        if (!res.ok) throw new Error('Template');
        await mc.setImage(await res.blob(), m.name || m.tplKey);
        window.__lanTpls = window.__lanTpls || {};
        window.__lanTpls[m.tplKey] = m.tpl;
      } catch (e) {
        console.error(e);
        toast('⚠️ ' + t('spiel.turn.error'));
      } finally {
        rerollBusy = false;
        rerollBtn.disabled = false;
        rerollBtn.textContent = '🎲 ' + t('spiel.turn.reroll');
      }
    };

    app.innerHTML = '';
    app.append(el('div', { class: 'wrap phase-screen turn-screen' },
      el('h1', {}, `${t('spiel.turn.yours')}${msg.theme ? ` · 🎭 ${msg.theme}` : ''}`),
      el('div', { class: 'turn-box card turn-layout' },
        el('div', { class: 'turn-canvas' },
          el('div', { class: 'meme-preview' }, canvas),
          el('p', { class: 'turn-place' }, t('spiel.turn.place')),
          timerRow,
          rerollBtn,
        ),
        el('div', { class: 'turn-controls' },
          fieldsWrap,
          el('div', { class: 'turn-actions' },
            el('button', { class: 'btn btn-sm', type: 'button', onclick: () => addRow(mc.addLayer({ text: '' })) }, '+ ' + t('studio.addLayer')),
            el('button', {
              class: 'btn btn-sm', type: 'button',
              onclick: () => {
                const target = rows.get(mc.selectedId) || [...rows.values()].find((n) => !n.value.trim()) || [...rows.values()][0];
                if (!target) return;
                const en = LS.get('lang', 'de') === 'en';
                target.value = en ? rand(INSPO_TOPS_EN.concat(INSPO_BOTTOMS_EN)) : rand(INSPO_TOPS.concat(INSPO_BOTTOMS));
                target.dispatchEvent(new Event('input', { bubbles: true }));
                target.focus();
              },
            }, '💡 ' + t('spiel.turn.inspo')),
          ),
          el('div', { class: 'turn-submit' }, el('button', { class: 'btn btn-green', onclick: finish }, '✅ ' + t('spiel.turn.submit'))),
        ),
      ),
    ));
    window.scrollTo(0, 0);

    // Lokale Rundenzeit statt Geräteuhr: verhindert, dass ein Handy mit falscher Uhrzeit sofort abgibt.
    const leftSec = Math.max(1, Number(msg.timeSec) || Math.round((msg.until - Date.now()) / 1000));
    turnSecs.textContent = leftSec + ' s';
    const startedAt = Date.now();
    const iv = setInterval(() => {
      if (settled || !timerRow.isConnected) return clearInterval(iv);
      const left = Math.max(0, leftSec - Math.floor((Date.now() - startedAt) / 1000));
      turnSecs.textContent = left + ' s';
      timerWrap.firstElementChild.style.width = (left / leftSec) * 100 + '%';
      timerWrap.classList.toggle('warn', left <= 10);
      if (left <= 0) { clearInterval(iv); finish(); }
    }, 250);
  }

  setupPreview().catch((e) => {
    console.error(e);
    if (settled) return;
    settled = true;
    toast('⚠️ ' + t('spiel.turn.error'));
    const room = lanState.room;
    room?.send({ type: 'submit', selfId: room.selfId, layers: [] });
    app.innerHTML = '';
    app.append(el('div', { class: 'wrap phase-screen' },
      el('h1', {}, t('spiel.turn.yours')),
      el('div', { class: 'card phase-wait' },
        el('div', { class: 'spinner-meme', 'aria-hidden': 'true' }, '⏭️'),
        el('p', { class: 'wait-title' }, t('spiel.turn.error')),
        el('p', { class: 'lobby-hint' }, t('spiel.vote.wait')),
      ),
    ));
  });
}

function doVote(msg) {
  lanState.phase = 'vote';
  if (msg.tpls) Object.assign(window.__lanTpls = window.__lanTpls || {}, msg.tpls);
  const app = document.getElementById('app');
  const room = lanState.room;
  // Der Host hat die Reihenfolge gemischt; alle sehen exakt dieselbe Reihenfolge.
  const list = msg.memes;
  const myId = msg.myId;

  if (!list.length) {
    room?.send({ type: 'vote', selfId: room.selfId, ups: [], downs: [], mehs: [], peak: null });
    app.innerHTML = '';
    app.append(el('div', { class: 'wrap phase-screen' },
      el('h1', {}, t('spiel.vote.title')),
      el('div', { class: 'card phase-wait' },
        el('div', { class: 'spinner-meme', 'aria-hidden': 'true' }, '🗳️'),
        el('p', { class: 'wait-title' }, t('spiel.vote.none')),
        el('p', { class: 'lobby-hint', role: 'status' }, t('spiel.vote.wait')),
      ),
    ));
    return;
  }

  const perMeme = 10; // Sekunden pro Meme, für alle gleich
  const startedAt = Date.now();
  const ups = new Set(), downs = new Set(), mehs = new Set();
  const cache = {};
  let peak = null, sent = false, ended = false, idx = 0, showSeq = 0, clock = null;

  const img = el('img', { class: 'vote-img', alt: '' });
  const meta = el('div', { class: 'vote-meta' });
  const upB = el('button', { class: 'vbtn vbtn-up', type: 'button', title: t('spiel.vote.up'), 'aria-label': t('spiel.vote.up'), 'aria-pressed': 'false' }, t('spiel.vote.upBtn'));
  const dnB = el('button', { class: 'vbtn vbtn-down', type: 'button', title: t('spiel.vote.down'), 'aria-label': t('spiel.vote.down'), 'aria-pressed': 'false' }, t('spiel.vote.downBtn'));
  const pkB = el('button', { class: 'vbtn vbtn-peak', type: 'button', title: t('spiel.vote.peak'), 'aria-label': t('spiel.vote.peak'), 'aria-pressed': 'false' }, '⛰️ ' + t('spiel.vote.peakBtn'));
  const mehB = el('button', { class: 'vbtn vbtn-meh', type: 'button', title: t('spiel.vote.meh'), 'aria-label': t('spiel.vote.meh'), 'aria-pressed': 'false' }, '😐 ' + t('spiel.vote.mehBtn'));
  const submitB = el('button', { class: 'btn btn-primary', type: 'button' }, t('spiel.vote.submit'));
  const timerWrap = el('div', { class: 'timerbar', 'aria-hidden': 'true' }, el('i'));
  const secs = el('span', { class: 'vote-secs', 'aria-hidden': 'true' });
  const step = el('p', { class: 'vote-step', 'aria-live': 'polite' });
  const ownNote = el('p', { class: 'vote-own-note', hidden: true }, '🙈 ' + t('spiel.vote.ownBlocked'));
  const dots = el('div', { class: 'vote-dots', 'aria-hidden': 'true' });
  const dotBtns = list.map((m, i) => el('span', { class: 'vote-dot' }, String(i + 1)));
  dots.append(...dotBtns);

  function isMine() { return list[idx].playerId === myId; }

  function sendVote() {
    if (sent) return;
    sent = true;
    room?.send({ type: 'vote', selfId: room.selfId, ups: [...ups], downs: [...downs], mehs: [...mehs], peak });
    paint();
  }

  function editVote() {
    if (!sent || ended) return;
    sent = false;
    paint();
  }

  function paint() {
    const cur = list[idx];
    const mine = cur.playerId === myId;
    upB.classList.toggle('active', ups.has(cur.playerId));
    dnB.classList.toggle('active', downs.has(cur.playerId));
    mehB.classList.toggle('active', mehs.has(cur.playerId));
    pkB.classList.toggle('active', peak === cur.playerId);
    upB.setAttribute('aria-pressed', String(ups.has(cur.playerId)));
    dnB.setAttribute('aria-pressed', String(downs.has(cur.playerId)));
    mehB.setAttribute('aria-pressed', String(mehs.has(cur.playerId)));
    pkB.setAttribute('aria-pressed', String(peak === cur.playerId));
    upB.disabled = dnB.disabled = pkB.disabled = mehB.disabled = sent || mine || ended;
    dotBtns.forEach((b, i) => b.classList.toggle('active', i === idx));
    ownNote.hidden = !mine;
    submitB.disabled = ended;
    submitB.textContent = sent ? t('spiel.vote.edit') : t('spiel.vote.submit');
    submitB.classList.toggle('btn-blue', sent);
    submitB.classList.toggle('btn-primary', !sent);
    step.textContent = ended ? t('spiel.vote.wait') : sent ? t('spiel.vote.submitted') : `${idx + 1} / ${list.length}`;
  }

  async function show() {
    const seq = ++showSeq;
    const m = list[idx];
    meta.textContent = m.name;
    paint();
    if (!cache[m.playerId]) {
      const tpl = await resolveTpl(m.tplKey);
      if (!tpl) {
        if (seq !== showSeq) return;
        img.removeAttribute('src');
        paint();
        return;
      }
      cache[m.playerId] = await renderMemeToDataUrl({ blob: tpl.blob, id: tpl.id, top: m.top, bottom: m.bottom, layers: m.layers });
    }
    if (seq !== showSeq) return;
    img.src = cache[m.playerId];
    paint();
  }

  upB.addEventListener('click', () => {
    if (sent || ended || isMine()) return;
    const id = list[idx].playerId;
    if (ups.has(id)) ups.delete(id); else { downs.delete(id); mehs.delete(id); ups.add(id); }
    paint();
  });
  dnB.addEventListener('click', () => {
    if (sent || ended || isMine()) return;
    const id = list[idx].playerId;
    if (downs.has(id)) downs.delete(id); else { ups.delete(id); mehs.delete(id); downs.add(id); }
    paint();
  });
  mehB.addEventListener('click', () => {
    if (sent || ended || isMine()) return;
    const id = list[idx].playerId;
    if (mehs.has(id)) mehs.delete(id); else { ups.delete(id); downs.delete(id); mehs.add(id); }
    paint();
  });
  pkB.addEventListener('click', () => {
    if (sent || ended || isMine()) return;
    peak = peak === list[idx].playerId ? null : list[idx].playerId;
    paint();
  });
  submitB.addEventListener('click', () => { if (sent) editVote(); else sendVote(); });

  // Eine gemeinsame Uhr: alle Geräte zeigen denselben Index, auch wenn das eigene Meme dran ist.
  clock = setInterval(() => {
    if (!img.isConnected) { clearInterval(clock); return; }
    const elapsed = Date.now() - startedAt;
    const total = list.length * perMeme * 1000;
    if (elapsed >= total) {
      clearInterval(clock);
      ended = true;
      secs.textContent = '0 s';
      timerWrap.firstElementChild.style.width = '0%';
      sendVote();
      paint();
      return;
    }
    const next = Math.floor(elapsed / (perMeme * 1000));
    const left = perMeme - (elapsed % (perMeme * 1000)) / 1000;
    secs.textContent = Math.ceil(left) + ' s';
    timerWrap.firstElementChild.style.width = `${(left / perMeme) * 100}%`;
    timerWrap.classList.toggle('warn', left <= 3);
    if (next !== idx) { idx = next; show(); }
  }, 100);

  app.innerHTML = '';
  app.append(el('div', { class: 'wrap phase-screen vote-screen' },
    el('h1', {}, t('spiel.vote.title')),
    el('div', { class: 'card turn-box vote-card-live' },
      el('p', { class: 'vote-hint' }, t('spiel.vote.hint')),
      ownNote,
      el('div', { class: 'vote-main' },
        el('div', { class: 'vote-media' },
          img,
          meta,
          dots,
        ),
        el('div', { class: 'vote-controls' },
          el('p', { class: 'vote-timing' }, t('spiel.vote.timing')),
          el('div', { class: 'vote-btns vote-btns-live' }, upB, pkB, dnB, mehB),
          el('div', { class: 'vote-timer' }, timerWrap, secs),
          el('div', { class: 'vote-submit-row' }, submitB),
          step,
        ),
      ),
    ),
  ));
  window.scrollTo(0, 0);
  show();
}

function memeFileName(m, rank) {
  const safe = String(m.name || 'meme')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'meme';
  return `meme-${String(rank).padStart(2, '0')}-${safe}${m.round ? `-r${m.round}` : ''}.jpg`;
}

function voteSummary(m) {
  return [
    m.up?.length ? t('spiel.vote.upBtn') + ': ' + m.up.join(', ') : null,
    m.down?.length ? t('spiel.vote.downBtn') + ': ' + m.down.join(', ') : null,
    m.meh?.length ? t('spiel.vote.mehBtn') + ': ' + m.meh.join(', ') : null,
    m.peaks ? t('spiel.vote.peakBtn') + ' ×' + m.peaks : null,
  ].filter(Boolean).join('  ·  ') || '—';
}

/** Galerie für Runden-Review und Game-Review; liefert Karten + Download-Daten. */
function buildMemeReview(memes) {
  const grid = el('div', { class: 'review-grid' });
  const items = memes.map((m, i) => {
    const img = el('img', { class: 'review-img', alt: '', loading: 'lazy' });
    const dl = el('a', {
      class: 'btn btn-sm review-dl', download: memeFileName(m, i + 1),
      'aria-disabled': 'true', href: '#',
    }, '⬇ ' + t('spiel.review.download'));
    grid.append(el('article', { class: 'review-card' },
      el('span', { class: 'review-rank' }, '#' + (i + 1)),
      el('div', { class: 'review-img-wrap' }, img),
      el('div', { class: 'review-meta' },
        el('strong', {}, m.name, m.round ? el('span', { class: 'review-round' }, ` · R${m.round}`) : null),
        el('span', { class: 'review-pts' }, `${m.pts ?? 0} P.`),
      ),
      el('div', { class: 'voters' }, voteSummary(m)),
      dl,
    ));
    const item = { m, url: null, promise: null };
    item.promise = (async () => {
      const tpl = await resolveTpl(m.tplKey);
      if (!tpl) return null;
      const url = await renderMemeToDataUrl({ blob: tpl.blob, id: tpl.id, top: m.top, bottom: m.bottom, layers: m.layers }, 900);
      item.url = url;
      img.src = url;
      dl.href = url;
      dl.removeAttribute('aria-disabled');
      return url;
    })().catch(() => null);
    return item;
  });
  return { grid, items };
}

async function dataUrlBytes(url) {
  const res = await fetch(url);
  return new Uint8Array(await res.arrayBuffer());
}

function saveBlob(blob, filename) {
  const a = el('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

function doResult(msg) {
  lanState.phase = 'review';
  const app = document.getElementById('app');
  const isFinal = msg.round >= msg.rounds;
  const isHost = lanState.hostId === lanState.room?.selfId;
  const autoNext = !!msg.autoNext;
  const advanceIn = Number(msg.advanceIn) || 0;
  const { grid } = buildMemeReview(msg.scores);

  const action = isHost
    ? el('button', {
      class: 'btn btn-primary', type: 'button',
      onclick: (e) => {
        e.currentTarget.disabled = true;
        e.currentTarget.textContent = t('spiel.review.waitHost');
        window.__lanAdvanceReview?.();
      },
    }, autoNext ? t('spiel.review.now') : (isFinal ? t('spiel.review.final') : t('spiel.review.next')))
    : (autoNext ? null : el('p', { class: 'review-wait', role: 'status' }, '⏳ ' + t('spiel.review.waitHost')));

  const autoStatus = autoNext && advanceIn > 0
    ? el('p', { class: 'review-countdown', 'aria-live': 'polite' }, t('spiel.review.autoIn', { n: advanceIn }))
    : null;
  if (autoStatus) {
    let left = advanceIn;
    const iv = setInterval(() => {
      if (!autoStatus.isConnected) { clearInterval(iv); return; }
      left -= 1;
      if (left <= 0) { clearInterval(iv); autoStatus.textContent = t('spiel.review.autoNow'); }
      else autoStatus.textContent = t('spiel.review.autoIn', { n: left });
    }, 1000);
  }

  app.innerHTML = '';
  app.append(el('div', { class: 'wrap phase-screen review-screen' },
    el('h1', {}, '🏆 ' + t('spiel.review.title')),
    el('p', { class: 'review-sub' }, `${t('spiel.review.round', { n: msg.round, total: msg.rounds })} · ${t('spiel.review.subtitle')}`),
    grid,
    el('div', { class: 'review-actions' }, action, autoStatus),
  ));
  window.scrollTo(0, 0);
}

function doFinal(msg) {
  lanState.phase = 'final';
  confetti();
  const app = document.getElementById('app');
  const medals = ['🥇', '🥈', '🥉'];
  const allMemes = (msg.allMemes?.length ? msg.allMemes : msg.best || [])
    .slice().sort((a, b) => (b.pts || 0) - (a.pts || 0));
  const { grid, items } = buildMemeReview(allMemes);

  const zipBtn = el('button', { class: 'btn btn-primary', type: 'button' }, '⬇ ' + t('spiel.final.zip'));
  zipBtn.addEventListener('click', async () => {
    const label = zipBtn.textContent;
    zipBtn.disabled = true;
    zipBtn.textContent = t('spiel.final.zipping');
    try {
      const urls = await Promise.all(items.map((it) => it.url || it.promise));
      const files = [];
      for (let i = 0; i < items.length; i++) {
        const url = urls[i];
        if (!url) continue;
        files.push({ name: memeFileName(items[i].m, i + 1), data: await dataUrlBytes(url) });
      }
      if (!files.length) throw new Error('keine Memes');
      saveBlob(createZip(files), 'meme-manufaktur-alle-memes.zip');
    } catch (e) {
      console.error(e);
      toast('⚠️ ' + t('spiel.final.zipFailed'));
    } finally {
      zipBtn.disabled = false;
      zipBtn.textContent = label;
    }
  });

  // Zurück zur Startseite/Lobby und den Raum sauber schließen.
  function replay() {
    lanState.room?.close();
    lanState.room = null;
    window.__mmInGame = false;
    window.__mmLeaveGame = null;
    clearTimeout(lanState.reviewTimer);
    lanState.reviewTimer = null;
    lanState.reviewAdvance = null;
    document.body.classList.remove('in-game');
    if (location.hash === '#/spiel') window.dispatchEvent(new CustomEvent('mm:goto', { detail: '#/spiel' }));
    else location.hash = '#/spiel';
  }

  app.innerHTML = '';
  app.append(el('div', { class: 'wrap phase-screen final-screen' },
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
    el('section', { class: 'final-review' },
      el('div', { class: 'final-review-head' },
        el('div', {},
          el('h2', {}, '🖼️ ' + t('spiel.final.reviewTitle')),
          el('p', { class: 'review-sub' }, t('spiel.final.reviewLead')),
        ),
        zipBtn,
      ),
      grid,
    ),
    el('div', { class: 'final-actions' },
      el('button', { class: 'btn btn-primary', type: 'button', onclick: replay }, '🔁 ' + t('spiel.final.again')),
    ),
  ));
  window.scrollTo(0, 0);
}

// Host-Seite (wird von der Lobby-Closure aufgerufen)
window.__lanHostStart = function (cfg, room, playersMap, myId) {
  lanState.cfg = cfg;
  lanState.room = room;
  lanState.hostId = myId;
  lanState.rounds = cfg.rounds;
  lanState.totals = new Map([...playersMap.keys()].map((id) => [id, 0]));
  lanState.allMemes = [];
  lanState.tpls = {};
  clearTimeout(lanState.reviewTimer);
  lanState.reviewTimer = null;
  lanState.reviewAdvance = null;
  lanState.collecting = false;
  lanState.voting = false;
  const playerList = [...playersMap.entries()].map(([id, name]) => ({ id, name }));
  if (playerList.length < 2) { toast(t('spiel.lobby.needPlayers')); return; }
  lanState.players = playerList;

  async function runRound(r) {
    lanState.round = r;
    lanState.memes = [];
    lanState.votes = [];
    const themes = themesForLang();
    const theme = cfg.mode === 'theme' ? themes[(r * 7) % themes.length] : null;
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
    lanState.tpls = tpls;

    // Turn-Phase: alle erstellen parallel, gemeinsames Zeitfenster
    const until = Date.now() + cfg.timeSec * 1000;
    lanState.collecting = true;
    for (let i = 0; i < playerList.length; i++) {
      room.send({
        type: 'turn', playerId: playerList[i].id, name: playerList[i].name, round: r,
        theme, tplKey: tplKeys[i], tpls, until, timeSec: cfg.timeSec,
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
    const turnTimer = setTimeout(finishTurn, cfg.timeSec * 1000 + 1500);
    // Wenn alle Captions da sind, geht es sofort ins Voting
    lanState.turnAdvance = () => {
      if (playerList.every((p) => lanState.memes.some((m) => m.playerId === p.id))) finishTurn();
    };

    function startVoting() {
      const memes = shuffle(lanState.memes.map((m) => ({ playerId: m.playerId, name: m.name, top: m.top, bottom: m.bottom, layers: m.layers, tplKey: m.tplKey })));
      // Alle voten gleichzeitig in derselben zufälligen Reihenfolge
      lanState.voting = true;
      for (const v of playerList) {
        room.send({ type: 'voting-start', myId: v.id, memes, tpls });
      }
      let voteDone = false;
      const finishVote = () => {
        if (voteDone) return;
        voteDone = true;
        lanState.voting = false;
        for (const v of playerList) if (!lanState.votes.some((x) => x.selfId === v.id)) lanState.votes.push({ selfId: v.id, ups: [], downs: [], mehs: [], peak: null });
        tally();
      };
      setTimeout(finishVote, Math.max(35, playerList.length * 10 + 15) * 1000);
      // Wenn alle abgestimmt haben, Auswertung sofort
      lanState.voteAdvance = () => {
        if (playerList.every((p) => lanState.votes.some((x) => x.selfId === p.id))) finishVote();
      };
    }

    function tally() {
      // Punkte: ±1000 relativ zur Spielerzahl (Krocha − Gschissn), dazu +10 pro ⛰️ Peak.
      const scores = scoreRound({ memes: lanState.memes, votes: lanState.votes, players: playerList, round: r });
      if (!cfg.relaxed) applyTotals(lanState.totals, scores, lanState.votes);

      lanState.allMemes.push(...scores);
      const isLast = r >= lanState.rounds;
      const autoNext = !!cfg.autoNext;
      const advanceIn = autoNext ? 10 : 0;
      room.send({ type: 'result', round: r, rounds: lanState.rounds, scores, autoNext, advanceIn });

      // Review bleibt stehen, bis der Host weiterklickt – oder läuft automatisch weiter.
      let advanced = false;
      clearTimeout(lanState.reviewTimer);
      lanState.reviewAdvance = () => {
        if (advanced) return;
        advanced = true;
        clearTimeout(lanState.reviewTimer);
        lanState.reviewTimer = null;
        lanState.reviewAdvance = null;
        if (isLast) {
          const standings = playerList
            .map((p) => ({ id: p.id, name: p.name, pts: lanState.totals.get(p.id) || 0 }))
            .sort((a, b) => b.pts - a.pts);
          const allMemes = [...lanState.allMemes].sort((a, b) => b.pts - a.pts);
          room.send({ type: 'final', standings, relaxed: cfg.relaxed, best: allMemes.slice(0, 5), allMemes });
        } else {
          runRound(r + 1);
        }
      };
      if (autoNext) lanState.reviewTimer = setTimeout(() => lanState.reviewAdvance?.(), advanceIn * 1000);
    }
  }

  room.send({ type: 'start', hostId: myId, players: playerList, cfg });
  runRound(1);
};

window.__lanHostVote = function (msg) {
  if (!lanState.voting) return; // späte Stimmen nach der Auswertung ignorieren
  const next = { selfId: msg.selfId, ups: msg.ups || [], downs: msg.downs || [], mehs: msg.mehs || [], peak: msg.peak || null };
  const existing = lanState.votes.find((v) => v.selfId === msg.selfId);
  if (existing) Object.assign(existing, next);
  else lanState.votes.push(next);
  lanState.voteAdvance?.();
};

window.__lanHostReroll = async function (msg) {
  if (!lanState.collecting || lanState.phase !== 'turn' || !msg?.selfId) return;
  if (!lanState.players.some((p) => p.id === msg.selfId)) return;
  const current = lanState.assignments.get(msg.selfId);
  const pool = (await templateKeyPool()).filter((key) => key !== current);
  if (!pool.length) return;
  const tplKey = rand(pool);
  const tpl = await resolveTpl(tplKey);
  if (!tpl) return;
  const dataUrl = await renderMemeToDataUrl({ blob: tpl.blob, id: tplKey, top: '', bottom: '' }, 900);
  lanState.assignments.set(msg.selfId, tplKey);
  lanState.tpls = lanState.tpls || {};
  lanState.tpls[tplKey] = dataUrl;
  lanState.room?.send({ type: 'rerolled', playerId: msg.selfId, tplKey, name: tpl.name, tpl: dataUrl });
};

window.__lanAdvanceReview = function () {
  lanState.reviewAdvance?.();
};
