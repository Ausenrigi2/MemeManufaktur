// ============ MemeManufaktur – Boot, Chrome, Router ============
import { el, t, applyI18n, LS, toast } from './lib.js';
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
  { hash: '#/spiel', title: 'title.spiel', view: (app) => renderSpiel(app) },
  { hash: '#/pakete', title: 'title.pakete', view: (app) => openPacks() },
  { hash: '#/studio', title: 'title.studio', view: (app) => openStudio(parseQuery()) },
  { hash: '#/hilfe', title: 'title.hilfe', view: (app) => renderHelp(app) },
];

function route(focusMain = true) {
  const path = parseHash().split('?')[0];
  const current = ROUTES.find((r) => r.hash === path) || ROUTES[0];
  const app = document.getElementById('app');
  app.innerHTML = '';
  try { current.view(app); }
  catch (err) { console.error('Router:', path, err); app.innerHTML = ''; renderError(app); }
  applyI18n(document);
  document.documentElement.lang = LS.get('lang', 'de');
  document.title = t(current.title);
  markNav(current.hash);
  window.scrollTo({ top: 0 });
  if (focusMain) app.focus({ preventScroll: true });
}

function markNav(path) {
  if (path === '#/') path = '#/spiel'; // Landing ist die Lobby
  document.querySelectorAll('.topnav a').forEach((a) => {
    const active = a.getAttribute('href') === path;
    a.classList.toggle('current', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

// ---------- Chrome: Nav + Footer ----------
function buildChrome() {
  const app = document.getElementById('app');
  const langBtns = el('div', { class: 'langswitch', role: 'group' });
  const nav = el('nav', { class: 'topnav' },
    el('a', { href: '#/spiel', 'data-i18n': 'nav.spiel' }),
    el('a', { href: '#/pakete', 'data-i18n': 'nav.pakete' }),
    el('a', { href: '#/studio', 'data-i18n': 'nav.studio' }),
    el('a', { href: '#/hilfe', 'data-i18n': 'nav.hilfe' }),
  );

  function syncChrome() {
    const lang = LS.get('lang', 'de');
    nav.setAttribute('aria-label', t('nav.label'));
    langBtns.setAttribute('aria-label', t('a11y.lang'));
    for (const b of langBtns.children) {
      b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
      b.setAttribute('aria-label', t(`a11y.lang.${b.dataset.lang}`));
    }
  }
  for (const code of ['de', 'en']) {
    langBtns.append(el('button', {
      type: 'button', 'data-lang': code, title: code.toUpperCase(),
      onclick: () => {
        if (window.__mmInGame) { toast(t('spiel.leaveFirst')); return; }
        LS.set('lang', code); syncChrome(); route();
      },
    }, code.toUpperCase()));
  }

  const header = el('header', { class: 'topbar' },
    el('div', { class: 'wrap' },
      el('a', { class: 'logo', href: '#/spiel' }, el('img', { src: 'favicon.svg', alt: '' }), 'MemeManufaktur'),
      nav,
      langBtns,
    ),
  );

  const footer = el('footer', {},
    el('div', { class: 'wrap' },
      el('span', { 'data-i18n': 'footer.left' }),
      el('span', { 'data-i18n': 'footer.right' }),
      el('span', { class: 'server-status', 'data-state': 'unknown', role: 'status' },
        el('span', { class: 'server-status-dot', 'aria-hidden': 'true' }),
        el('span', { 'data-i18n': 'server.checking' }),
      ),
    ),
  );

  app.before(header);
  app.after(footer);
  if (!document.getElementById('confetti')) document.body.append(el('canvas', { id: 'confetti', 'aria-hidden': 'true' }));
  applyI18n(document);
  syncChrome();
  document.querySelector('.skip-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    app.focus();
  });
}

function updateServerStatus(up = ServerAPI.available) {
  const box = document.querySelector('.server-status');
  if (!box) return;
  const state = up === true ? 'online' : up === false ? 'local' : 'unknown';
  const key = `server.${state === 'unknown' ? 'checking' : state}`;
  box.dataset.state = state;
  const label = box.querySelector('[data-i18n]');
  label.dataset.i18n = key;
  label.textContent = t(key);
}

function renderError(app) {
  app.append(el('div', { class: 'wrap' },
    el('div', { class: 'card error-card', role: 'alert' },
      el('h2', {}, t('error.title')),
      el('p', {}, t('error.body')),
      el('button', { class: 'btn btn-primary', type: 'button', onclick: () => location.reload() }, t('error.reload')),
    ),
  ));
}

// ---------- Spiel-Seite (Lobby) ----------
function renderSpiel(app) {
  openLobby(app);
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
  document.documentElement.lang = LS.get('lang', 'de');
  buildChrome();
  try { await Packs.ensureBuiltins(); } catch (e) { console.warn('Built-in Templates:', e); }
  const serverUp = await ServerAPI.check();
  updateServerStatus(serverUp);
  try { window.__serverTpls = ServerAPI.available ? await ServerAPI.library() : []; } catch { window.__serverTpls = []; }
  route(false);
  window.addEventListener('hashchange', () => route());
  // Re-Render auf derselben Route (z. B. „Nochmal spielen“)
  window.addEventListener('mm:goto', (e) => {
    const target = e.detail || '#/spiel';
    if (location.hash === target) route();
    else location.hash = target;
  });
  // Server-Status im Footer regelmäßig prüfen, damit ein Neustart nicht unsichtbar bleibt.
  setInterval(async () => {
    if (document.hidden) return;
    try {
      const r = await fetch('/health', { cache: 'no-store' });
      ServerAPI.available = r.ok;
      updateServerStatus(r.ok);
    } catch {
      ServerAPI.available = false;
      updateServerStatus(false);
    }
  }, 30000);
}

boot();
