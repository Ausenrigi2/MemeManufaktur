// ============ MemeManufaktur – Boot, Chrome, Router ============
import { el, t, applyI18n, LS } from './lib.js';
import { Packs, ServerAPI } from './packs.js';
import { MemeCanvas } from './editor.js';
import { openStudio } from './ui-studio.js';
import { openPacks } from './ui-packs.js';
import { renderSetup, openLanSetup } from './game.js';

// ---------- Routing ----------
function parseHash() { return location.hash || '#/'; }
function parseQuery() {
  const q = parseHash().split('?')[1] || '';
  return Object.fromEntries(new URLSearchParams(q).entries());
}

const ROUTES = [
  { hash: '#/', view: (app) => renderHome(app) },
  { hash: '#/studio', view: (app) => openStudio(parseQuery()) },
  { hash: '#/pakete', view: (app) => openPacks() },
  { hash: '#/spiel', view: (app) => renderSpiel(app) },
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

  const badge = el('span', { class: 'badge-server off', id: 'server-badge' },
    el('span', { class: 'dot' }),
    el('span', { id: 'server-badge-text' }, t('server.off')),
  );

  const header = el('header', { class: 'topbar' },
    el('div', { class: 'wrap' },
      el('a', { class: 'logo', href: '#/' }, el('img', { src: 'favicon.svg', alt: '' }), 'MemeManufaktur'),
      el('nav', { class: 'topnav', 'aria-label': 'Hauptnavigation' },
        el('a', { href: '#/studio', 'data-i18n': 'nav.studio' }),
        el('a', { href: '#/pakete', 'data-i18n': 'nav.pakete' }),
        el('a', { href: '#/spiel', 'data-i18n': 'nav.spiel' }),
        el('a', { href: '#/hilfe', 'data-i18n': 'nav.hilfe' }),
      ),
      langBtns,
      badge,
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

export function updateServerBadge(ok) {
  const b = document.getElementById('server-badge');
  if (!b) return;
  b.classList.toggle('on', !!ok);
  b.classList.toggle('off', !ok);
  const txt = document.getElementById('server-badge-text');
  if (txt) txt.textContent = ok ? t('server.on') : t('server.off');
}

// ---------- Startseite ----------
const HERO_CAPS = [
  ['POV: DER KURS STEIGT', 'DEIN CHAT VERLÄSST DEN RAUM'],
  ['WHEN THE', 'STONKS NIE WIEDER SLEEPS'],
  ['DER MOMENT ALS', 'DAS BÄRKCHEN AUFTAUCHT'],
  ['WANN DICH', 'DER DRUCKER NIE FINDET'],
  ['EINMAL STONKS', 'FÜR IMMER STONKS'],
  ['JEDER WEISS, DASS', 'SIE NIE WIEDER FALLT'],
];
let heroTimer = null;

function renderHome(app) {
  app.innerHTML = '';
  const demoCanvas = el('canvas', { width: 720, height: 720, 'aria-label': 'Live-Meme-Vorschau' });
  const demoFrame = el('div', { class: 'demo-frame' },
    el('span', { class: 'sticker demo-tag' }, t('home.demo.tag')),
    demoCanvas,
  );

  const feature = (emoji, titleKey, descKey) =>
    el('div', { class: 'feature' }, el('span', { class: 'emoji' }, emoji), el('h3', {}, t(titleKey)), el('p', {}, t(descKey)));
  const step = (key) => el('div', { class: 'step' }, el('p', { style: 'margin:4px 0 0;max-width:60ch' }, t(key)));

  const tickItems = ['home.tick1','home.tick2','home.tick3','home.tick4','home.tick5','home.tick6','home.tick7','home.tick8']
    .map((k) => `<b>${t(k)}</b><span>✦</span>`).join('');

  app.append(
    el('div', { class: 'wrap' },
      el('section', { class: 'hero' },
        el('div', {},
          el('span', { class: 'sticker' }, t('home.badge')),
          el('h1', {}, t('home.title')),
          el('p', { class: 'lead' }, t('home.lead')),
          el('div', { class: 'hero-ctas' },
            el('a', { class: 'btn btn-primary', href: '#/spiel' }, '🚀 ', t('home.cta.quick')),
            el('a', { class: 'btn', href: '#/spiel?mode=lan' }, '📡 ', t('home.cta.private')),
          ),
        ),
        demoFrame,
      ),
    ),
    el('div', { class: 'ticker', 'aria-hidden': 'true' }, el('div', { class: 'ticker-track', html: tickItems + tickItems })),
    el('div', { class: 'wrap' },
      el('section', { class: 'features' },
        feature('🎨', 'home.feat1.t', 'home.feat1.d'),
        feature('📦', 'home.feat2.t', 'home.feat2.d'),
        feature('🎉', 'home.feat3.t', 'home.feat3.d'),
      ),
      el('section', {},
        el('h2', {}, t('home.steps.t')),
        el('div', { class: 'steps' },
          step('home.step1'), step('home.step2'), step('home.step3'),
        ),
      ),
      el('div', { class: 'card cta-band' },
        el('h2', {}, t('home.band.t')),
        el('p', {}, t('home.band.d')),
        el('a', { class: 'btn btn-primary', href: '#/spiel' }, '🎮 ', t('spiel.start')),
      ),
    ),
  );
  startHeroDemo(demoCanvas);
}

async function startHeroDemo(canvas) {
  clearInterval(heroTimer);
  let tpl = null;
  try { tpl = await Packs.getTemplate('builtin_stonks'); } catch {}
  if (!tpl) return;
  const mc = new MemeCanvas(canvas);
  await mc.setImage(tpl.blob);
  const base = Math.min(mc.cw, mc.ch);
  const topL = mc.addLayer({ text: HERO_CAPS[0][0], y: Math.round(base * 0.13), fontSize: Math.round(base * 0.1), strokeWidth: Math.max(5, Math.round(base * 0.012)) });
  const botL = mc.addLayer({ text: HERO_CAPS[0][1], y: mc.ch - Math.round(base * 0.13), fontSize: Math.round(base * 0.1), strokeWidth: Math.max(5, Math.round(base * 0.012)) });
  mc.selectedId = null;
  mc.render();
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let i = 0;
  heroTimer = setInterval(() => {
    i = (i + 1) % HERO_CAPS.length;
    mc.updateLayer(topL.id, { text: HERO_CAPS[i][0] });
    mc.updateLayer(botL.id, { text: HERO_CAPS[i][1] });
  }, 2200);
}

// ---------- Spiel-Seite (Hot-Seat vs. LAN) ----------
function renderSpiel(app) {
  app.innerHTML = '';
  const area = el('div');
  const localBtn = el('button', { type: 'button', class: 'btn', 'data-key': 'local' }, '🎮 ', t('spiel.lan.local'));
  const lanBtn = el('button', { type: 'button', class: 'btn', 'data-key': 'lan' }, '📡 ', t('spiel.lan.network'));

  function select(key) {
    for (const b of [localBtn, lanBtn]) b.classList.toggle('btn-primary', b.dataset.key === key);
    area.innerHTML = '';
    if (key === 'local') renderSetup(area, { local: true });
    else openLanSetup(area);
  }
  localBtn.addEventListener('click', () => select('local'));
  lanBtn.addEventListener('click', () => select('lan'));

  app.append(
    el('div', { class: 'wrap' },
      el('h1', {}, t('spiel.title')),
      el('p', { style: 'color:var(--muted);max-width:70ch' }, t('home.feat3.d')),
      el('div', { style: 'display:flex;gap:12px;flex-wrap:wrap;margin-top:8px' }, localBtn, lanBtn),
      area,
    ),
  );
  select(parseQuery().mode === 'lan' ? 'lan' : 'local');
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
  const ok = await ServerAPI.check();
  if (ok) {
    try { window.__serverTpls = await ServerAPI.library(); } catch { window.__serverTpls = []; }
  } else {
    window.__serverTpls = [];
  }
  updateServerBadge(ok);
  route();
  window.addEventListener('hashchange', route);
  // Re-Render auf derselben Route (z. B. „Nochmal spielen“)
  window.addEventListener('mm:goto', (e) => {
    const target = e.detail || '#/';
    if (location.hash === target) route();
    else location.hash = target;
  });
}

boot();
