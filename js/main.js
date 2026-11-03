// ============ MemeManufaktur – Boot, Chrome, Router ============
import { el, t, applyI18n, LS } from './lib.js';
import { Packs, ServerAPI } from './packs.js';
import { openStudio } from './ui-studio.js';
import { openPacks } from './ui-packs.js';
import { openLobby } from './game.js';

// ---------- Routing ----------
function parseHash() { return location.hash || '#/spiel'; }
function parseQuery() {
  const q = parseHash().split('?')[1] || '';
  return Object.fromEntries(new URLSearchParams(q).entries());
}

const ROUTES = [
  { hash: '#/spiel', view: (app) => renderSpiel(app) },
  { hash: '#/pakete', view: (app) => openPacks() },
  { hash: '#/studio', view: (app) => openStudio(parseQuery()) },
  { hash: '#/hilfe', view: (app) => renderHelp(app) },
];

function route() {
  const path = parseHash().split('?')[0];
  const view = (ROUTES.find((r) => r.hash === path) || ROUTES[0]).view;
  const app = document.getElementById('app');
  app.innerHTML = '';
  view(app);
  applyI18n(document);
  markNav(path);
  window.scrollTo({ top: 0 });
}

function markNav(path) {
  if (path === '#/') path = '#/spiel'; // Landing ist die Lobby
  document.querySelectorAll('.topnav a').forEach((a) => {
    a.classList.toggle('current', a.getAttribute('href') === path);
  });
}

// ---------- Chrome: Nav + Footer ----------
function buildChrome() {
  const app = document.getElementById('app');
  const langBtns = el('div', { class: 'langswitch' });

  function syncLangButtons() {
    const lang = LS.get('lang', 'de');
    for (const b of langBtns.children) b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
  }
  for (const code of ['de', 'en']) {
    langBtns.append(el('button', {
      type: 'button', 'data-lang': code, title: code.toUpperCase(),
      onclick: () => { LS.set('lang', code); syncLangButtons(); route(); },
    }, code.toUpperCase()));
  }

  const header = el('header', { class: 'topbar' },
    el('div', { class: 'wrap' },
      el('a', { class: 'logo', href: '#/spiel' }, el('img', { src: 'favicon.svg', alt: '' }), 'MemeManufaktur'),
      el('nav', { class: 'topnav', 'aria-label': 'Hauptnavigation' },
        el('a', { href: '#/spiel', 'data-i18n': 'nav.spiel' }),
        el('a', { href: '#/pakete', 'data-i18n': 'nav.pakete' }),
        el('a', { href: '#/studio', 'data-i18n': 'nav.studio' }),
        el('a', { href: '#/hilfe', 'data-i18n': 'nav.hilfe' }),
      ),
      langBtns,
    ),
  );

  const footer = el('footer', {},
    el('div', { class: 'wrap' },
      el('span', { 'data-i18n': 'footer.left' }),
      el('span', { 'data-i18n': 'footer.right' }),
    ),
  );

  app.before(header);
  app.after(footer);
  if (!document.getElementById('confetti')) document.body.append(el('canvas', { id: 'confetti' }));
  applyI18n(document);
  syncLangButtons();
}

// ---------- Spiel-Seite (Lobby) ----------
function renderSpiel(app) {
  app.innerHTML = '';
  const area = el('div');
  app.append(
    el('div', { class: 'wrap' },
      el('h1', {}, t('spiel.title')),
      el('p', { style: 'color:var(--muted);max-width:70ch' }, t('lobby.lead')),
      area,
    ),
  );
  openLobby(area);
}

// ---------- Hilfe-Seite ----------
function renderHelp(app) {
  app.innerHTML = '';
  const items = [1, 2, 3, 4].map((i) => {
    const q = el('summary', { 'data-i18n': `help.q${i}`, style: 'font-weight:800;font-size:1.05rem;cursor:pointer;padding:6px 2px' });
    const a = el('p', { 'data-i18n-html': `help.a${i}`, style: 'color:var(--muted)' });
    return el('details', { class: 'card', style: 'margin-bottom:14px' }, q, a);
  });
  app.append(el('div', { class: 'wrap' }, el('h1', {}, t('help.title')), ...items));
  applyI18n(app);
}

// ---------- Boot ----------
async function boot() {
  buildChrome();
  try { await Packs.ensureBuiltins(); } catch (e) { console.warn('Built-in Templates:', e); }
  await ServerAPI.check();
  try { window.__serverTpls = ServerAPI.available ? await ServerAPI.library() : []; } catch { window.__serverTpls = []; }
  route();
  window.addEventListener('hashchange', route);
  // Re-Render auf derselben Route (z. B. „Nochmal spielen“)
  window.addEventListener('mm:goto', (e) => {
    const target = e.detail || '#/spiel';
    if (location.hash === target) route();
    else location.hash = target;
  });
}

boot();
