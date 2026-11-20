// ============ Meme-Partie: Lobby + Spiel-Phasen ============
import { el, t, LS, rand, shuffle, toast, confetti, roomCode, uid } from './lib.js';
import { MemeCanvas, renderMemeToDataUrl } from './editor.js';
import { zoneFor, layerPatch, normLayers } from './textzones.js';
import { Packs, ServerAPI, BUILTIN_GROUPS } from './packs.js';
import { Room } from './net.js';

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
    return { blob: await res.blob(), name: key, id: key };
  }
  if (key.startsWith('srv:')) {
    const res = await fetch(ServerAPI.url(key.slice(4)));
    if (!res.ok) return null;
    return { blob: await res.blob(), name: key, id: key };
  }
  const tpl = await Packs.getTemplate(key);
  if (tpl) return { blob: tpl.blob, name: tpl.name, id: tpl.id || key };
  // Fallback, falls IndexedDB noch nicht gefüllt ist: eingebautes Asset direkt laden.
  const builtin = BUILTIN_GROUPS.flatMap((g) => g.files).find(([k]) => `builtin_${k}` === key);
  if (builtin) {
    const [k, name, ext = 'svg'] = builtin;
    const res = await fetch(`assets/templates/${k}.${ext}`);
    if (res.ok) return { blob: await res.blob(), name, id: key };
  }
  return null;
}

function renderAbort(reason) {
  const app = document.getElementById('app');
  app.innerHTML = '';
  app.append(el('div', { class: 'wrap' },
    el('div', { class: 'card', style: 'max-width:520px;margin:34px auto;text-align:center' },
      el('h2', {}, '🫠 ' + t('spiel.abort.title')),
      el('p', { style: 'color:var(--muted);font-weight:700' }, t('spiel.abort.body', { reason: String(reason || '?').slice(0, 160) })),
      el('button', { class: 'btn btn-primary', style: 'margin-top:8px', onclick: () => { location.hash = '#/'; } }, '← ' + t('spiel.final.home')),
    ),
  ));
  window.scrollTo(0, 0);
}

function downloadImage(url, name = 'meme') {
  if (!url) return;
  const slug = String(name).replace(/[^\wäöüÄÖÜß-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'meme';
  const a = el('a', { href: url, download: `${slug}.jpg` });
  document.body.append(a);
  a.click();
  a.remove();
}

async function pickTemplates(count, mode, idList = [], ownPools = null) {
  const all = await Packs.allTemplates();
  // ownPools: pro Spieler eigene Keys ('srv:...') – nur wenn der Host sie erlaubt.
  const ownAllowed = !!ownPools && mode !== 'same';
  const anyOwn = !!ownPools && idList.some((id) => ownPools.get(id)?.length);
  if (!all.length && !anyOwn) throw new Error(t('spiel.noTemplates'));
  const pool = shuffle(all);
  const out = [];
  for (let i = 0; i < count; i++) {
    // 'same' behält bewusst EIN gemeinsames Template – eigene Packs gelten nur in random/theme
    const own = ownAllowed ? ownPools?.get(idList[i]) : null;
    if (own?.length) { out.push(rand(own)); continue; }
    if (!pool.length) throw new Error(t('spiel.noCommonTemplates'));
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
    try { await ServerAPI.check(); } catch { /* offline */ }
  }
  if (!ServerAPI.available) {
    container.append(el('div', { class: 'wrap' },
      el('div', { class: 'card', style: 'max-width:560px;margin:34px auto' },
        el('h2', {}, t('lobby.title')),
        el('p', { style: 'color:var(--muted)' }, t('lobby.needserver')),
      ),
    ));
    return;
  }

  const savedName = LS.get('playerName', '');
  const defaultName = t('spiel.guest') + '_' + Math.floor(Math.random() * 900 + 100);
  const nameInput = el('input', { type: 'text', name: 'name', id: 'player-name', autocomplete: 'name', maxlength: 40, value: savedName || defaultName });
  const lobbyInput = el('input', { type: 'text', name: 'lobby', id: 'lobby-name', maxlength: 40, placeholder: t('lobby.name') });
  const codeInput = el('input', { type: 'text', name: 'code', maxlength: 4, 'aria-label': t('lobby.byCode') });
  // Einladungslink (#/spiel?code=XXXX) füllt den Code direkt vor.
  const wantsCode = new URLSearchParams(location.hash.split('?')[1] || '').get('code');
  if (wantsCode) codeInput.value = wantsCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  const statusEl = el('p', { style: 'font-weight:800;color:var(--muted)', 'aria-live': 'polite', hidden: true });
  let poll = null;
  let entering = false;

  async function join(code, opts = {}) {
    const name = nameInput.value.trim().slice(0, 40);
    if (!name) { toast(t('spiel.yourName')); return; }
    if (entering) return;
    entering = true;
    LS.set('playerName', name);
    clearInterval(poll);
    await enterLobby({ code, host: !!opts.host, name, statusEl, lobby: opts.lobby, pub: !!opts.pub });
  }

  function createLobby(pub) {
    join(roomCode(), { host: true, pub, lobby: lobbyInput.value.trim() || null });
  }

  async function quickPlay() {
    let list = [];
    try { list = await ServerAPI.lobbies(); } catch { list = []; }
    const open = list.find((l) => l.players < (l.max || 30));
    if (open) join(open.code, { pub: true });
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
    if (!list.length) { listWrap.append(el('p', { style: 'color:var(--muted);margin:0' }, t('lobby.noOpen'))); return; }
    for (const l of list) {
      listWrap.append(el('div', { class: 'lobby-row' },
        el('span', {}, (l.name || l.code) + ' · ' + (l.max ? t('lobby.playersInMax', { n: l.players, max: l.max }) : t('lobby.playersIn', { n: l.players }))),
        el('button', { class: 'btn btn-sm btn-blue', type: 'button', onclick: () => join(l.code, { pub: true }) }, '→ ' + t('lobby.join')),
      ));
    }
  }

  function art(names) {
    return el('span', { class: 'pc-stack', 'aria-hidden': 'true' },
      ...names.map((n) => el('img', { src: `assets/templates/${n}`, alt: '' })),
    );
  }

  container.append(
    el('div', { class: 'wrap home' },
      el('section', { class: 'home-hero' },
        el('span', { class: 'kicker' }, '🎉 ' + t('home.kicker')),
        el('h1', { html: t('home.title') }),
        el('p', { class: 'home-lead' }, t('home.lead')),
      ),
      el('div', { class: 'home-fields' },
        el('div', {}, el('label', { for: 'player-name' }, t('spiel.yourName')), nameInput),
        el('div', {}, el('label', { for: 'lobby-name' }, t('home.lobbyName')), lobbyInput),
      ),
      el('div', { class: 'play-grid' },
        el('button', { class: 'play-card quick', type: 'button', onclick: quickPlay },
          el('span', { class: 'pc-emoji' }, '⚡'),
          el('span', { class: 'pc-title' }, t('home.quick')),
          el('span', { class: 'pc-desc' }, t('home.quick.d')),
          el('span', { class: 'pc-cta' }, t('home.quick.cta') + ' →'),
          art(['original-party-parrot.gif', 'awesome-face.svg', 'deepfriedpepsican.jpg']),
        ),
        el('button', { class: 'play-card private', type: 'button', onclick: () => createLobby(false) },
          el('span', { class: 'pc-emoji' }, '🔒'),
          el('span', { class: 'pc-title' }, t('home.private')),
          el('span', { class: 'pc-desc' }, t('home.private.d')),
          el('span', { class: 'pc-cta' }, t('home.private.cta') + ' →'),
          art(['chelovechek.jpg', 'deep-fried-blue-gatorade.jpg', 'yuno-lego.jpg']),
        ),
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
    // Die Spiel-URL bleibt immer auf der Spiel-Route – sonst würde ein Klick auf
    // „Spiel“ die Lobby neu rendern, während die Partie im Hintergrund weiterläuft.
    try { history.replaceState(null, '', '#/spiel'); } catch {}
    const room = new Room(code, name, { lobby, pub, create: !!host });
    const players = new Map(); // selfId -> name
    let myId = room.selfId;
    let hostId = host ? myId : null;
    let leftGame = false;
    let startedFlag = false; // true sobald „start“ im Raum angekommen ist
    let startRequested = false;
    let hostLostTimer = null;
    let roomMax = 12;
    let ownKeys = []; // eigene Server-Keys dieser Person ('srv:...')
    lanState.room = room;
    window.__mmInGame = true;

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
      lanState.myId = myId;
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
        el('label', {}, `${t('spiel.players')} · ${players.size}/${roomMax}`),
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
        const canStart = players.size >= 2 && !startRequested;
        lobbyCard.append(el('div', { class: 'lobby-actions' },
          el('button', {
            class: 'btn btn-primary', type: 'button', disabled: !canStart,
            title: canStart ? null : t('spiel.lobby.needPlayers'),
            onclick: () => startFromLobby(),
          }, '🚀 ' + t('spiel.start')),
          el('button', { class: 'btn', type: 'button', onclick: () => leave() }, '← ' + t('spiel.final.home')),
        ));
        if (players.size < 2) lobbyCard.append(el('p', { class: 'lobby-hint', role: 'status' }, '⏳ ' + t('spiel.lobby.needPlayers')));
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
    let cfg = { mode: 'random', relaxed: false, rounds: 3, timeSec: 90, maxPlayers: 12, ownPacks: false };
    function setupControls() {
      const g = el('div', { class: 'card', style: 'max-width:560px;margin:14px auto' });
      const set = (k, v) => { cfg[k] = v; };
      const radios = el('div', { class: 'mode-cards' });
      for (const m of ['random', 'same', 'theme']) {
        radios.append(el('label', { class: 'mode-card' },
          el('input', { type: 'radio', name: 'lm', value: m, ...(m === 'random' ? { checked: true } : {}) }),
          el('span', { class: 'mode-copy' },
            el('strong', {}, t(`spiel.modes.${m}`)),
            el('small', {}, t(`spiel.modes.${m}.d`)),
          ),
        ));
      }
      const syncModeCards = () => {
        for (const card of radios.querySelectorAll('.mode-card')) {
          card.classList.toggle('selected', !!card.querySelector('input')?.checked);
        }
      };
      syncModeCards();
      radios.querySelectorAll('input').forEach((r) => r.addEventListener('change', () => {
        set('mode', radios.querySelector('input:checked').value);
        syncModeCards();
      }));
      const rel = el('input', { type: 'checkbox', 'aria-label': t('spiel.relaxed') });
      rel.addEventListener('change', () => set('relaxed', rel.checked));
      const roundsSel = el('select', { id: 'setup-rounds' }, ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => el('option', { value: n, ...(n === 3 ? { selected: true } : {}) }, String(n))));
      roundsSel.addEventListener('change', () => set('rounds', Number(roundsSel.value) || 3));
      const timeSel = el('select', { id: 'setup-time' }, ...[30, 45, 60, 90, 120, 180, 240, 300].map((n) => el('option', { value: n, ...(n === 90 ? { selected: true } : {}) }, n + ' s')));
      timeSel.addEventListener('change', () => set('timeSec', Number(timeSel.value) || 90));
      const maxSel = el('select', { id: 'setup-max', 'aria-label': t('lobby.maxPlayers'), 'data-max': '' }, ...Array.from({ length: 29 }, (_, i) => i + 2).map((n) => el('option', { value: n, ...(n === 12 ? { selected: true } : {}) }, String(n))));
      maxSel.addEventListener('change', () => {
        const max = Number(maxSel.value) || 12;
        set('maxPlayers', max);
        lanState.room?.send({ type: 'maxplayers', max });
        renderLobby();
      });
      const ownChk = el('input', { type: 'checkbox', 'aria-label': t('spiel.ownPacks') });
      ownChk.addEventListener('change', () => set('ownPacks', ownChk.checked));
      g.append(
        el('h3', {}, t('spiel.setup.t')),
        radios,
        el('div', { style: 'display:flex;gap:8px;align-items:center;margin-top:10px' }, rel, el('span', {}, t('spiel.relaxed'))),
        el('div', { style: 'display:flex;gap:8px;align-items:center;margin-top:10px' }, ownChk, el('span', {}, t('spiel.ownPacks'))),
        el('div', { class: 'fieldrow', style: 'margin-top:10px' },
          el('div', {}, el('label', { for: 'setup-rounds' }, t('spiel.rounds')), roundsSel),
          el('div', {}, el('label', { for: 'setup-time' }, t('spiel.time')), timeSel),
          el('div', {}, el('label', { for: 'setup-max' }, t('lobby.maxPlayers')), maxSel),
        ),
      );
      return g;
    }

    setupCardOuter = setupControls();
    app.innerHTML = '';
    app.append(el('div', { class: 'wrap' }, lobbyCard, setupCardOuter));
    renderLobby();

    function hardLeave() {
      leftGame = true;
      clearTimeout(hostLostTimer);
      hostLostTimer = null;
      window.__mmInGame = false;
      if (lanState.room === room) lanState.room = null;
      room.close();
    }
    function leave() {
      hardLeave();
      location.hash = '#/';
    }

    function showRejected(reason) {
      if (leftGame) return;
      hardLeave();
      app.innerHTML = '';
      app.append(el('div', { class: 'wrap' },
        el('div', { class: 'card', style: 'max-width:480px;margin:30px auto;text-align:center' },
          el('h2', {}, '🚫'),
          el('p', { style: 'font-weight:700' }, t(reason === 'full' ? 'lobby.full' : reason === 'conflict' ? 'lobby.conflict' : reason === 'taken' ? 'lobby.taken' : reason === 'notfound' ? 'lobby.notfound' : 'lobby.started')),
          el('button', { class: 'btn btn-primary', style: 'margin-top:10px', onclick: () => { location.hash = '#/'; } }, '← ' + t('spiel.final.home')),
        ),
      ));
    }

    function showHostLost() {
      if (leftGame) return;
      app.innerHTML = '';
      app.append(el('div', { class: 'wrap phase-screen' },
        el('div', { class: 'card', style: 'max-width:480px;margin:20px auto;text-align:center' },
          el('p', { style: 'font-size:1.1rem;font-weight:700' }, '🫠 ' + t('spiel.hostLeft')),
          el('button', { class: 'btn', style: 'margin-top:10px', onclick: () => leave() }, '← ' + t('spiel.final.home')),
        ),
      ));
    }

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
      if (s === 'closed' && !leftGame) {
        setStatus('⚠️ ' + t('lobby.reconnecting'));
        if (startedFlag) toast('⚠️ ' + t('lobby.reconnecting'), 4000);
      } else if (s === 'open' && ownKeys.length) room.send({ type: 'ownpack', selfId: myId, tpls: ownKeys });
    });

    room.onMessage(async (msg) => {
      if (leftGame) return;
      switch (msg.type) {
        case 'rejected':
          showRejected(msg.reason);
          break;
        case 'ownpack':
          if (hostId === myId) {
            const keys = (Array.isArray(msg.tpls) ? msg.tpls : [])
              .filter((k) => typeof k === 'string' && k.startsWith('srv:'))
              .slice(0, 200);
            lanState.ownPacks.set(msg.selfId, keys);
            renderLobby();
          }
          break;
        case 'maxplayers':
          roomMax = Number(msg.max) || roomMax;
          cfg.maxPlayers = roomMax;
          if (setupCardOuter) {
            const sel = setupCardOuter.querySelector('[data-max]');
            if (sel) sel.value = String(roomMax);
          }
          renderLobby();
          break;
        case 'roster':
          players.clear();
          for (const p of msg.players) players.set(p.selfId, p.name);
          if (msg.max) roomMax = msg.max;
          if (msg.hostId) hostId = msg.hostId;
          else if (msg.players.length) hostId = msg.players[0].selfId;
          if (players.has(hostId)) { clearTimeout(hostLostTimer); hostLostTimer = null; }
          renderLobby();
          break;
        case 'joined':
          players.set(msg.selfId, msg.name);
          if (msg.max) roomMax = msg.max;
          if (msg.hostId) hostId = msg.hostId;
          else hostId = hostId || msg.selfId;
          if (msg.hostId === msg.selfId) { clearTimeout(hostLostTimer); hostLostTimer = null; }
          renderLobby();
          break;
        case 'left': {
          const wasHost = msg.selfId === hostId;
          players.delete(msg.selfId);
          if (msg.max) roomMax = msg.max;
          if (msg.hostId) hostId = msg.hostId;
          if (hostId === myId && startedFlag) {
            if (lanState.collecting) handleHostSubmit({ selfId: msg.selfId, layers: [] }, true);
            if (lanState.voting) window.__lanHostVote({ selfId: msg.selfId, ups: [], downs: [], peak: null });
          }
          if (wasHost && startedFlag && !leftGame) {
            // Der Host kann nach einem kurzen Verbindungsabbruch zurückkommen –
            // erst nach einer Gnadenfrist gilt die Partie als beendet.
            if (!hostLostTimer) {
              toast(t('spiel.hostLost'), 4000);
              hostLostTimer = setTimeout(() => {
                hostLostTimer = null;
                if (leftGame || players.has(hostId)) return;
                startedFlag = false;
                showHostLost();
              }, 8000);
            }
            renderLobby();
            break;
          }
          renderLobby();
          break;
        }
        case 'start':
          startedFlag = true;
          if (msg.hostId) hostId = msg.hostId;
          if (msg.hostId !== myId) announceStart(msg);
          break;
        case 'abort':
          startedFlag = false;
          renderAbort(msg.reason);
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
          doVote(msg);
          break;
        case 'result':
          doResult(msg);
          break;
        case 'final':
          startedFlag = false;
          doFinal(msg);
          break;
      }
    });

    room.connect();
    room.send({ type: 'hello', selfId: myId, name });
    sendOwnPack();

    // Host-Logik in derselben Closure – über Modulebene erreichbar:
    function startFromLobby() {
      if (startRequested || players.size < 2) return;
      startRequested = true;
      renderLobby();
      window.__lanHostStart(cfg, room, players, myId);
    }
    window.__lanHostRematch = () => {
      if (hostId !== myId || players.size < 2) return false;
      window.__lanHostStart(cfg, room, new Map(players), myId);
      return true;
    };
    function hostHandleVote(msg) { window.__lanHostVote(msg); }
  });
}

// ---------- LAN Host/Guest-Phasen (auf Modulebene, da Closure-Shared-State nötig) ----------
const lanState = { cfg: null, room: null, myId: null, hostId: null, round: 0, rounds: 3, memes: [], votes: [], totals: new Map(), theme: null, players: [], assignments: new Map(), turnAdvance: null, voteAdvance: null, ownPacks: new Map(), collecting: false, voting: false, allMemes: [] }; // ownPacks: selfId -> [srv-Keys]

/** Host: Caption aus einer „submit“-Nachricht in die laufende Runde übernehmen */
export function handleHostSubmit(msg, onlyIfMissing = false) {
  if (!lanState.collecting) return; // späte Captions nach Ablauf der Runde ignorieren
  if (!msg?.selfId) return;
  const top = String(msg.top ?? '').slice(0, 200);
  const bottom = String(msg.bottom ?? '').slice(0, 200);
  const layers = normLayers(msg.layers);
  const found = lanState.memes.find((m) => m.playerId === msg.selfId);
  if (found) {
    if (!onlyIfMissing) { found.top = top; found.bottom = bottom; found.layers = layers; }
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
  const startPlayers = Array.isArray(msg.players) ? msg.players : [];
  lanState.totals = new Map(startPlayers.map((p) => [p.id, 0]));
  const app = document.getElementById('app');
  app.innerHTML = '';
  app.append(el('div', { class: 'wrap phase-screen waiting' },
    el('div', { class: 'spinner-meme' }, '🎬'),
    el('h1', {}, t('spiel.round.start', { n: 1 })),
  ));
  window.scrollTo(0, 0);
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
      const inp = el('textarea', { rows: 2, maxlength: 200, placeholder: t('spiel.turn.field', { n: rows.size + 1 }) });
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
    addRow(mc.addLayer({ text: '', ...(layerPatch(mc, z?.top) || def(Math.round(base * 0.15))) }));
    addRow(mc.addLayer({ text: '', ...(layerPatch(mc, z?.bottom) || def(mc.ch - Math.round(base * 0.15))) }));

    const timerWrap = el('div', { class: 'timerbar' }, el('i'));

    function finish() {
      if (settled) return;
      settled = true;
      const room = lanState.room;
      const layers = mc.layers.map((l) => ({ text: String(l.text).slice(0, 200), xF: +(l.x / mc.cw).toFixed(3), yF: +(l.y / mc.ch).toFixed(3), fsF: +(l.fontSize / base).toFixed(3) }));
      room.send({ type: 'submit', selfId: room.selfId, layers });
      mc.destroy(); // Canvas-Blob freigeben; gerendert ist bereits alles
    }

    app.innerHTML = '';
    app.append(el('div', { class: 'wrap phase-screen' },
      el('h1', {}, `${t('spiel.turn.yours')}${msg.theme ? ` · 🎭 ${msg.theme}` : ''}`),
      el('div', { class: 'turn-box card' },
        el('div', { class: 'meme-preview' }, canvas),
        el('p', { style: 'color:var(--muted);font-size:0.85rem' }, t('spiel.turn.place')),
        fieldsWrap,
        el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
          el('button', { class: 'btn btn-sm', type: 'button', onclick: () => { const layer = mc.addLayer({ text: '' }); addRow(layer); const inp = rows.get(layer.id); inp?.focus(); } }, '+ ' + t('studio.addLayer')),
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
        timerWrap,
        el('div', { style: 'margin-top:14px' }, el('button', { class: 'btn btn-green', onclick: finish }, '✅ ' + t('spiel.turn.submit'))),
      ),
    ));
    window.scrollTo(0, 0);

    const leftSec = Math.max(1, Math.round((Number(msg.until) - Date.now()) / 1000) || 90);
    const startedAt = Date.now();
    const iv = setInterval(() => {
      if (settled) return clearInterval(iv);
      const left = Math.max(0, leftSec - Math.floor((Date.now() - startedAt) / 1000));
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
  if (msg.tpls) Object.assign(window.__lanTpls = window.__lanTpls || {}, msg.tpls);
  const app = document.getElementById('app');
  const room = lanState.room;
  const myId = msg.myId || room?.selfId;
  const memes = Array.isArray(msg.memes) ? msg.memes : [];
  const list = memes.filter((m) => m.playerId !== myId);

  if (!list.length) {
    // Keine fremden Memes: sofort leer abstimmen, sonst wartet der Host bis zum Timeout.
    room?.send({ type: 'vote', selfId: room.selfId, ups: [], downs: [], peak: null });
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

  // Zeitbudget kommt vom Host und skaliert mit der Spielerzahl; Fallback für alte Peers.
  const voteSec = Math.max(20, Number(msg.voteSec) || 50);
  const perMeme = Math.max(3, Math.min(10, Math.floor(voteSec / list.length)));
  const ups = new Set(), downs = new Set(), decided = new Set();
  let peak = null; // einmal pro Runde, bis zum Abgeben auf ein anderes Meme verschiebbar
  let sent = false, idx = 0, timer = null, autoTimer = null, showSeq = 0;
  const cache = {}; // dataURLs cachen, damit Zurück nicht neu rendert

  const img = el('img', { class: 'vote-img', alt: '' });
  const meta = el('div', { class: 'vote-meta' });
  const upB = el('button', { class: 'vbtn vbtn-up', type: 'button', title: t('spiel.vote.up'), 'aria-label': t('spiel.vote.up') }, '👍');
  const dnB = el('button', { class: 'vbtn vbtn-down', type: 'button', title: t('spiel.vote.down'), 'aria-label': t('spiel.vote.down') }, '👎');
  const pkB = el('button', { class: 'vbtn vbtn-peak', type: 'button', title: t('spiel.vote.peak'), 'aria-label': t('spiel.vote.peak'), 'aria-pressed': 'false' }, '⛰️ PEAK');
  const timerWrap = el('div', { class: 'timerbar', 'aria-hidden': 'true' }, el('i'));
  const secs = el('span', { class: 'vote-secs', 'aria-hidden': 'true' });
  const step = el('p', { class: 'vote-step', 'aria-live': 'polite' });

  function sendVote() {
    sent = true;
    clearInterval(timer);
    clearTimeout(autoTimer);
    autoTimer = null;
    room?.send({ type: 'vote', selfId: room.selfId, ups: [...ups], downs: [...downs], peak });
    paint();
  }

  function paint() {
    const cur = list[idx];
    upB.classList.toggle('active', ups.has(cur.playerId));
    dnB.classList.toggle('active', downs.has(cur.playerId));
    pkB.classList.toggle('active', peak === cur.playerId);
    pkB.setAttribute('aria-pressed', String(peak === cur.playerId));
    upB.disabled = dnB.disabled = pkB.disabled = sent;
    step.textContent = sent ? t('spiel.vote.wait') : `${idx + 1} / ${list.length}`;
  }

  async function show() {
    const seq = ++showSeq;
    const m = list[idx];
    meta.textContent = m.name;
    if (!cache[m.playerId]) {
      const tpl = await resolveTpl(m.tplKey);
      // Fehlendes Template: Meme ohne Stimme überspringen statt hängen zu bleiben.
      if (!tpl) { decide(); if (!sent) go(1); return; }
      cache[m.playerId] = await renderMemeToDataUrl({ blob: tpl.blob, id: tpl.id, top: m.top, bottom: m.bottom, layers: m.layers });
    }
    if (seq !== showSeq) return; // spätes Rendern eines alten Memes ignorieren
    img.src = cache[m.playerId];
    paint();
    if (!sent) startTimer();
  }

  function startTimer() {
    clearInterval(timer);
    const bar = timerWrap.firstElementChild;
    let left = perMeme;
    bar.style.width = '100%';
    timerWrap.classList.remove('warn');
    secs.textContent = left + ' s';
    timer = setInterval(() => {
      if (sent || !img.isConnected) { clearInterval(timer); return; }
      left = Math.max(0, left - 0.25);
      secs.textContent = Math.ceil(left) + ' s';
      bar.style.width = `${(left / perMeme) * 100}%`;
      timerWrap.classList.toggle('warn', left <= Math.min(3, perMeme / 2));
      if (left <= 0) {
        clearInterval(timer);
        decide(); // abgelaufen = entschieden ohne Stimme
        if (!sent) go(1);
      }
    }, 250);
  }

  // Nach Up/Down-Vote kurz warten, dann weiter – so bleibt Zeit für den PEAK.
  function scheduleAdvance() {
    clearTimeout(autoTimer);
    if (sent || idx >= list.length - 1) return;
    autoTimer = setTimeout(() => {
      autoTimer = null;
      if (sent || !img.isConnected || idx >= list.length - 1) return;
      go(1);
    }, 1000);
  }

  function go(delta) {
    clearInterval(timer); // alte Meme-Uhr nicht weiterlaufen lassen
    clearTimeout(autoTimer);
    autoTimer = null;
    const next = Math.min(list.length - 1, Math.max(0, idx + delta));
    if (next !== idx) { idx = next; show(); }
  }

  upB.addEventListener('click', () => {
    if (sent) return;
    const id = list[idx].playerId;
    if (ups.has(id)) ups.delete(id); else { downs.delete(id); ups.add(id); }
    decide(true);
  });
  dnB.addEventListener('click', () => {
    if (sent) return;
    const id = list[idx].playerId;
    if (downs.has(id)) downs.delete(id); else { ups.delete(id); downs.add(id); }
    decide(true);
  });
  pkB.addEventListener('click', () => {
    if (sent) return;
    clearTimeout(autoTimer); // PEAK-Klick hält das aktuelle Meme fest
    autoTimer = null;
    peak = peak === list[idx].playerId ? null : list[idx].playerId;
    paint();
    if (decided.has(list[idx].playerId)) scheduleAdvance();
  });

  function decide(advance = false) {
    if (sent) return;
    decided.add(list[idx].playerId);
    paint();
    if (decided.size === list.length) { sendVote(); return; }
    if (advance) scheduleAdvance();
  }

  app.innerHTML = '';
  app.append(el('div', { class: 'wrap phase-screen vote-screen' },
    el('h1', {}, t('spiel.vote.title')),
    el('div', { class: 'card turn-box vote-card-live' },
      el('p', { class: 'vote-hint' }, t('spiel.vote.hint'), el('br'), '💡 ' + t('spiel.vote.peakFirst')),
      img,
      meta,
      el('div', { class: 'vote-btns vote-btns-live' }, upB, dnB, pkB),
      el('div', { class: 'vote-nav' },
        el('button', { class: 'btn btn-sm', type: 'button', onclick: () => go(-1) }, '← ' + t('spiel.vote.back')),
        el('button', { class: 'btn btn-sm btn-blue', type: 'button', onclick: () => { decide(); if (!sent) go(1); } }, '→ ' + t('spiel.vote.skip')),
      ),
      el('div', { class: 'vote-timer' }, timerWrap, secs),
      step,
    ),
  ));
  window.scrollTo(0, 0);
  show();
}

function doResult(msg) {
  if (msg.tpls) Object.assign(window.__lanTpls = window.__lanTpls || {}, msg.tpls);
  const app = document.getElementById('app');
  const scores = Array.isArray(msg.scores) ? msg.scores : [];
  const isFinal = msg.round >= msg.rounds;
  const maxPts = scores.length ? Math.max(...scores.map((x) => x.pts)) : 0;
  const rows = el('div', { class: 'result-list' });
  for (const s of scores) {
    const img = el('img', { alt: s.name });
    const saveBtn = el('button', { class: 'btn btn-sm result-save', type: 'button', disabled: true, title: t('spiel.saveMeme'), 'aria-label': t('spiel.saveMeme') }, '⬇ ' + t('spiel.saveMeme'));
    (async () => {
      const tpl = await resolveTpl(s.tplKey);
      if (!tpl) return;
      const url = await renderMemeToDataUrl({ blob: tpl.blob, id: tpl.id, top: s.top, bottom: s.bottom, layers: s.layers }, 720);
      img.src = url;
      saveBtn.disabled = false;
      saveBtn.addEventListener('click', () => downloadImage(url, s.name));
    })();
    rows.append(el('div', { class: `result-row${s.pts === maxPts && s.pts > 0 ? ' winner' : ''}` },
      img,
      el('div', {},
        el('div', { style: 'font-weight:800' }, s.name),
        el('div', { class: 'voters' },
          [s.up?.length ? '👍 ' + s.up.join(', ') : null, s.down?.length ? '👎 ' + s.down.join(', ') : null, s.peaks ? '⛰️ ×' + s.peaks : null].filter(Boolean).join('  ·  ') || '—'),
        saveBtn,
      ),
      el('div', { class: 'pts' }, String(s.pts)),
    ));
  }

  // Kleiner Countdown, passend zur Host-Pause von 5,2 s; keine Protokolländerung.
  const hint = el('p', { class: 'next-hint', role: 'status', 'aria-live': 'polite' });
  let left = 5;
  const paintHint = () => {
    hint.textContent = left > 0
      ? t(isFinal ? 'spiel.result.finalIn' : 'spiel.result.nextIn', { n: left })
      : t(isFinal ? 'spiel.result.finalNow' : 'spiel.result.nextNow');
  };
  paintHint();
  const iv = setInterval(() => {
    if (!hint.isConnected) { clearInterval(iv); return; }
    left -= 1;
    paintHint();
    if (left <= 0) clearInterval(iv);
  }, 1000);

  app.innerHTML = '';
  app.append(el('div', { class: 'wrap phase-screen' },
    el('h1', {}, `${t('spiel.result.title')} · ${msg.round}/${msg.rounds}`),
    el('div', { class: 'card' }, rows),
    hint,
  ));
  window.scrollTo(0, 0);
}

function doFinal(msg) {
  if (msg.tpls) Object.assign(window.__lanTpls = window.__lanTpls || {}, msg.tpls);
  confetti();
  const app = document.getElementById('app');
  const medals = ['🥇', '🥈', '🥉'];
  const standings = Array.isArray(msg.standings) ? msg.standings : [];
  const best = Array.isArray(msg.best) ? msg.best : [];
  const bestCard = best.length ? el('div', { class: 'card', style: 'margin-top:14px' },
    el('h2', {}, '🔥 ' + t('spiel.final.best')),
    el('div', { class: 'vote-grid' },
      ...best.map((m) => {
        const img = el('img', { alt: m.name });
        const saveBtn = el('button', { class: 'btn btn-sm', type: 'button', disabled: true, title: t('spiel.saveMeme'), 'aria-label': t('spiel.saveMeme') }, '⬇');
        (async () => {
          const tpl = await resolveTpl(m.tplKey);
          if (!tpl) return;
          const url = await renderMemeToDataUrl({ blob: tpl.blob, id: tpl.id, top: m.top, bottom: m.bottom, layers: m.layers }, 720);
          img.src = url;
          saveBtn.disabled = false;
          saveBtn.addEventListener('click', () => downloadImage(url, m.name));
        })();
        return el('div', { class: 'vote-card' }, img,
          el('div', { class: 'vote-meta' },
            el('span', {}, m.name + ' · ' + t('spiel.points', { n: m.pts })),
            saveBtn,
          ),
        );
      }),
    ),
  ) : null;

  // Host startet eine neue Partie mit denselben Leuten; Gäste gehen zurück zur Lobby.
  const isHost = !!lanState.room && lanState.room.selfId === lanState.hostId;
  function replay() {
    lanState.room?.close();
    lanState.room = null;
    window.__mmInGame = false;
    if (location.hash === '#/spiel') window.dispatchEvent(new CustomEvent('mm:goto', { detail: '#/spiel' }));
    else location.hash = '#/spiel';
  }

  app.innerHTML = '';
  app.append(el('div', { class: 'wrap phase-screen' },
    el('h1', {}, t('spiel.final.title')),
    el('div', { class: 'card' },
      el('h2', {}, msg.relaxed ? '🎉 ' + t('spiel.final.relaxed') : '🏆 ' + t('spiel.final.podium')),
      el('div', { class: 'final-rank' },
        ...standings.map((s, i) => el('div', { class: `final-row${i === 0 && !msg.relaxed ? ' first' : ''}` },
          el('span', { class: 'medal' }, msg.relaxed ? '🎉' : i < 3 ? medals[i] : `${i + 1}.`),
          s.name,
          msg.relaxed ? null : el('span', { class: 'pts' }, t('spiel.points', { n: s.pts })),
        )),
      ),
    ),
    bestCard,
    el('div', { class: 'final-actions' },
      isHost
        ? el('button', { class: 'btn btn-primary', type: 'button', onclick: () => { if (!window.__lanHostRematch?.()) replay(); } }, '🔁 ' + t('spiel.final.again'))
        : el('button', { class: 'btn btn-primary', type: 'button', onclick: replay }, '← ' + t('spiel.final.home')),
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
    try {
      tplKeys = await pickTemplates(playerList.length, cfg.mode, playerList.map((p) => p.id), cfg.ownPacks ? lanState.ownPacks : null);
    } catch (e) {
      const reason = String(e.message || e);
      room.send({ type: 'abort', reason });
      renderAbort(reason);
      return;
    }
    lanState.assignments = new Map(playerList.map((p, i) => [p.id, tplKeys[i]]));

    // Templates: eingebaute Bilder haben alle Clients lokal; nur eigene/Server-
    // Templates müssen als DataURL mitgeschickt werden (schont Zeit und WS-Budget).
    const tpls = {};
    let missingTpl = 0;
    for (const k of new Set(tplKeys)) {
      if (String(k).startsWith('builtin_')) continue;
      const tpl = await resolveTpl(k);
      if (tpl) tpls[k] = await renderMemeToDataUrl({ blob: tpl.blob, id: tpl.id, top: '', bottom: '' }, 720);
      else missingTpl++;
    }
    if (missingTpl) {
      const reason = t('spiel.templatesFailed');
      room.send({ type: 'abort', reason });
      renderAbort(reason);
      return;
    }
    if (Object.values(tpls).reduce((n, s) => n + s.length, 0) > 6 * 1024 * 1024) {
      const reason = t('spiel.packsTooBig');
      room.send({ type: 'abort', reason });
      renderAbort(reason);
      return;
    }

    // Turn-Phase: alle erstellen parallel, gemeinsames Zeitfenster
    const until = Date.now() + cfg.timeSec * 1000;
    lanState.collecting = true;
    for (let i = 0; i < playerList.length; i++) {
      const ownTpl = tpls[tplKeys[i]] ? { [tplKeys[i]]: tpls[tplKeys[i]] } : null;
      room.send({
        type: 'turn', playerId: playerList[i].id, name: playerList[i].name, round: r,
        theme, tplKey: tplKeys[i], tpls: ownTpl, until,
      });
    }
    let turnDone = false;
    const finishTurn = () => {
      if (turnDone) return;
      turnDone = true;
      lanState.collecting = false;
      lanState.turnAdvance = null;
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
      // Alle voten gleichzeitig; die Zeit wächst mit der Zahl der Memes.
      const voteSec = Math.min(300, Math.max(30, 30 + playerList.length * 6));
      lanState.voting = true;
      // Eine gemeinsame Nachricht für alle – jede:r filtert das eigene Meme heraus.
      room.send({ type: 'voting-start', memes, tpls, voteSec });
      let voteDone = false;
      const finishVote = () => {
        if (voteDone) return;
        voteDone = true;
        lanState.voting = false;
        lanState.voteAdvance = null;
        for (const v of playerList) if (!lanState.votes.some((x) => x.selfId === v.id)) lanState.votes.push({ selfId: v.id, ups: [], downs: [], peak: null });
        tally();
      };
      setTimeout(finishVote, (voteSec + 15) * 1000);
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
  if (!msg?.selfId || !lanState.players.some((p) => p.id === msg.selfId)) return;
  // Nur echte Mitspieler:innen, niemals die eigene Karte, keine Duplikate.
  const valid = new Set(lanState.players.map((p) => p.id));
  const clean = (arr) => [...new Set(Array.isArray(arr) ? arr : [])]
    .filter((id) => typeof id === 'string' && valid.has(id) && id !== msg.selfId);
  const peak = typeof msg.peak === 'string' && valid.has(msg.peak) && msg.peak !== msg.selfId ? msg.peak : null;
  const vote = { selfId: msg.selfId, ups: clean(msg.ups), downs: clean(msg.downs), peak };
  const existing = lanState.votes.find((v) => v.selfId === msg.selfId);
  if (existing) Object.assign(existing, vote);
  else lanState.votes.push(vote);
  lanState.voteAdvance?.();
};
