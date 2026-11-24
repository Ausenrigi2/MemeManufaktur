// ============ Studio-Seite ============
import { el, t, toast, rand } from './lib.js';
import { MemeCanvas, FONTS } from './editor.js';
import { Packs, ServerAPI } from './packs.js';

function ensureStudioStyles() {
  if (document.querySelector('link[data-studio-css]')) return;
  document.head.append(el('link', { rel: 'stylesheet', href: 'css/studio.css', 'data-studio-css': '' }));
}

if (location.hash.startsWith('#/studio')) ensureStudioStyles();

let currentStudioCleanup = null;

export function openStudio(params = {}) {
  currentStudioCleanup?.();
  ensureStudioStyles();

  const app = document.getElementById('app');
  app.innerHTML = '';

  const canvas = el('canvas', { width: 640, height: 640, 'aria-label': 'Meme-Vorschau' });
  const mc = new MemeCanvas(canvas);
  mc.bindPointer();
  mc.onChange = () => syncPanelFromLayer();

  let activeTplId = null;
  let thumbUrls = [];

  function revokeThumbs() {
    for (const url of thumbUrls) URL.revokeObjectURL(url);
    thumbUrls = [];
  }

  // ---------- Galerie + Template-Auswahl ----------
  const tplSelect = el('select', { id: 'tpl-select', 'aria-label': t('studio.gallery') });
  const galleryGroups = el('div', { class: 'gallery-groups' });
  const randomBtn = el('button', { class: 'btn tpl-action', type: 'button', onclick: () => pickRandom() },
    el('span', { class: 'tpl-ico', 'aria-hidden': 'true' }, '🎲'),
    el('span', { class: 'tpl-name' }, t('studio.random')),
  );
  const fileInput = el('input', { type: 'file', accept: 'image/*', hidden: true });
  const uploadBtn = el('button', { class: 'btn tpl-action upload', type: 'button', onclick: () => fileInput.click() },
    el('span', { class: 'tpl-ico', 'aria-hidden': 'true' }, '⬆️'),
    el('span', { class: 'tpl-name' }, t('studio.upload')),
  );

  function makeGalleryGroup(title, tiles) {
    return el('section', { class: 'gallery-group' },
      el('h3', {}, el('span', {}, title), el('span', { class: 'gallery-count' }, String(tiles.length))),
      el('div', { class: 'gallery-grid' }, ...tiles),
    );
  }

  function makeLocalTile(tpl) {
    let url = null;
    if (tpl.blob) {
      try { url = URL.createObjectURL(tpl.blob); thumbUrls.push(url); } catch { /* defekter Blob – Kachel bleibt ohne Bild */ }
    }
    return el('button', {
      class: 'tpl-tile', type: 'button', 'data-tpl': tpl.id, 'aria-pressed': 'false',
      title: tpl.name, onclick: () => loadTemplate(tpl.id),
    },
      url ? el('img', { src: url, alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' }) : null,
      el('span', { class: 'tpl-name' }, tpl.name),
    );
  }

  function makeServerTile(s) {
    return el('button', {
      class: 'tpl-tile', type: 'button', 'data-tpl': `srv:${s.id}`, 'aria-pressed': 'false',
      title: s.name, onclick: () => loadTemplate(`srv:${s.id}`),
    },
      el('img', { src: ServerAPI.url(s.id), alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' }),
      el('span', { class: 'tpl-name' }, s.name),
    );
  }

  const gallerySearch = el('input', {
    class: 'gallery-search', type: 'search', placeholder: t('studio.search'), 'aria-label': t('studio.search'),
    oninput: () => filterGallery(),
  });
  const galleryNoHit = el('p', { class: 'gallery-empty', hidden: true }, t('studio.galleryEmpty'));

  const galleryCard = el('section', { class: 'card tpl-gallery', 'aria-label': t('studio.gallery') },
    el('div', { class: 'gallery-head' }, el('h2', {}, '🖼️ ' + t('studio.gallery'))),
    gallerySearch,
    el('div', { class: 'gallery-scroll' },
      el('section', { class: 'gallery-group gallery-quick' },
        el('h3', {}, t('studio.quickStart')),
        el('div', { class: 'gallery-grid gallery-grid-quick' }, randomBtn, uploadBtn),
      ),
      galleryGroups,
      galleryNoHit,
    ),
    fileInput,
  );

  function filterGallery() {
    const q = gallerySearch.value.trim().toLowerCase();
    let total = 0;
    for (const group of galleryGroups.querySelectorAll('.gallery-group')) {
      let shown = 0;
      for (const tile of group.querySelectorAll('.tpl-tile')) {
        const hit = !q || tile.title.toLowerCase().includes(q);
        tile.hidden = !hit;
        if (hit) shown++;
      }
      group.hidden = shown === 0;
      total += shown;
      const count = group.querySelector('.gallery-count');
      if (count) count.textContent = String(shown);
    }
    galleryNoHit.hidden = total > 0 || !q;
  }

  const fallbackBar = el('div', { class: 'tpl-bar tpl-fallback' },
    el('span', { class: 'tpl-fallback-label' }, t('studio.tpl')),
    tplSelect,
  );

  function markActiveTemplate(id) {
    activeTplId = id || null;
    galleryGroups.querySelectorAll('.tpl-tile[data-tpl]').forEach((node) => {
      node.setAttribute('aria-pressed', String(node.dataset.tpl === activeTplId));
    });
  }

  async function refreshTemplates() {
    if (ServerAPI.available) {
      try { window.__serverTpls = await ServerAPI.library(); } catch { /* Server kurz weg – alten Stand behalten */ }
    }
    const packs = await Packs.allPacks();
    const all = await Packs.allTemplates();
    const byId = new Map(all.map((tpl) => [tpl.id, tpl]));

    revokeThumbs();
    tplSelect.innerHTML = '';
    tplSelect.append(el('option', { value: '', disabled: true }, t('studio.customImage')));
    galleryGroups.innerHTML = '';
    let groups = 0;

    for (const p of packs) {
      const tpls = p.tplIds.map((id) => byId.get(id)).filter(Boolean);
      if (!tpls.length) continue;
      const group = el('optgroup', { label: p.name });
      for (const tpl of tpls) group.append(el('option', { value: tpl.id }, tpl.name));
      tplSelect.append(group);
      galleryGroups.append(makeGalleryGroup(p.name, tpls.map(makeLocalTile)));
      groups++;
    }

    if (ServerAPI.available && window.__serverTpls?.length) {
      const group = el('optgroup', { label: t('pakete.serverTitle') });
      for (const s of window.__serverTpls) group.append(el('option', { value: `srv:${s.id}` }, s.name));
      tplSelect.append(group);
      galleryGroups.append(makeGalleryGroup(t('pakete.serverTitle'), window.__serverTpls.map(makeServerTile)));
      groups++;
    }

    if (!groups) galleryGroups.append(el('div', { class: 'gallery-empty-box' },
      el('p', { class: 'gallery-empty' }, t('studio.galleryEmpty')),
      el('a', { class: 'btn btn-sm btn-primary', href: '#/pakete' }, '⬆ ' + t('studio.uploadTemplates')),
    ));
    markActiveTemplate(activeTplId);
    filterGallery();
  }

  async function loadTemplate(id) {
    if (!id) return false;
    try {
      let blob; let name = id;
      if (id.startsWith('srv:')) {
        const sid = id.slice(4);
        const res = await fetch(ServerAPI.url(sid));
        if (!res.ok) throw new Error(`Template ${res.status}`);
        blob = await res.blob();
        name = window.__serverTpls?.find((s) => String(s.id) === sid)?.name || sid;
      } else {
        const tpl = await Packs.getTemplate(id);
        if (!tpl) return false;
        blob = tpl.blob; name = tpl.name;
      }
      await mc.setImage(blob, name);
      resetImageControls();
      resetDefaultLayers();
      if ([...tplSelect.options].some((o) => o.value === id)) tplSelect.value = id;
      markActiveTemplate(id);
      return true;
    } catch (e) {
      console.error(e);
      toast('⚠️ ' + e.message);
      return false;
    }
  }

  function resetDefaultLayers() {
    mc.layers = [];
    mc.selectedId = null;
    const base = Math.min(mc.cw, mc.ch);
    mc.addLayer({ text: '', y: Math.round(base * 0.12), fontSize: Math.round(base * 0.11), strokeWidth: Math.max(5, Math.round(base * 0.012)) });
    mc.addLayer({ text: '', y: mc.ch - Math.round(base * 0.12), fontSize: Math.round(base * 0.11), strokeWidth: Math.max(5, Math.round(base * 0.012)) });
    syncPanelFromLayer();
  }

  async function useLocalImage(file) {
    await mc.setImage(file, file.name);
    resetImageControls();
    resetDefaultLayers();
    tplSelect.value = '';
    markActiveTemplate(null);
  }

  async function pickRandom() {
    const ids = (await Packs.allTemplates()).map((tpl) => tpl.id);
    if (ServerAPI.available && window.__serverTpls?.length) {
      ids.push(...window.__serverTpls.map((s) => `srv:${s.id}`));
    }
    if (!ids.length) return;
    await loadTemplate(rand(ids));
  }

  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    if (!f) return;
    await useLocalImage(f);
    fileInput.value = '';
  });

  // ---------- Ebenen-Liste ----------
  const layerList = el('ul', { class: 'layer-list' });
  const addLayerBtn = el('button', {
    class: 'btn btn-sm', type: 'button',
    onclick: () => mc.addLayer({ text: '', x: mc.cw / 2, y: mc.ch / 2 }),
  }, '+ ' + t('studio.addLayer'));

  function refreshLayerList() {
    layerList.innerHTML = '';
    if (!mc.layers.length) { layerList.append(el('li', { class: 'txt', style: 'color:var(--muted)' }, t('studio.noLayers'))); return; }
    for (const l of [...mc.layers].reverse()) {
      const label = (l.text || '…').slice(0, 22);
      const selectLayer = () => mc.select(l.id);
      const item = el('li', {
        class: `layer-item${l.id === mc.selectedId ? ' selected' : ''}`,
        role: 'button', tabindex: 0, 'aria-label': label,
        onclick: selectLayer,
        onkeydown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectLayer(); }
        },
      },
        el('span', { 'aria-hidden': 'true' }, '▣'),
        el('span', { class: 'txt' }, label),
        el('button', { class: 'btn btn-icon btn-sm', type: 'button', title: t('studio.moveUp'), 'aria-label': t('studio.moveUp'), onclick: (e) => { e.stopPropagation(); mc.reorderLayer(l.id, -1); } }, '↑'),
        el('button', { class: 'btn btn-icon btn-sm', type: 'button', title: t('studio.moveDown'), 'aria-label': t('studio.moveDown'), onclick: (e) => { e.stopPropagation(); mc.reorderLayer(l.id, 1); } }, '↓'),
        el('button', { class: 'btn btn-icon btn-sm', type: 'button', title: t('studio.duplicate'), 'aria-label': t('studio.duplicate'), onclick: (e) => { e.stopPropagation(); mc.duplicateLayer(l.id); } }, '⧉'),
        el('button', { class: 'btn btn-icon btn-sm', type: 'button', title: t('studio.deleteLayer'), 'aria-label': t('studio.deleteLayer'), onclick: (e) => { e.stopPropagation(); mc.removeLayer(l.id); } }, '✕'),
      );
      layerList.append(item);
    }
  }

  // ---------- Text-Panel ----------
  const txtInput = el('textarea', { rows: 3, placeholder: 'Dein Text …' });
  const fontSelect = el('select');
  for (const [k, v] of Object.entries(FONTS)) fontSelect.append(el('option', { value: k }, v.label));
  const sizeRange = el('input', { type: 'range', min: 10, max: 240, value: 70 });
  const colorInput = el('input', { type: 'color', value: '#ffffff' });
  const strokeColorInput = el('input', { type: 'color', value: '#000000' });
  const strokeWRange = el('input', { type: 'range', min: 0, max: 24, value: 8 });
  const hlCheck = el('input', { type: 'checkbox' });
  const hlColor = el('input', { type: 'color', value: '#FFC93C' });
  const alignSelect = el('select');
  alignSelect.append(el('option', { value: 'center' }, t('studio.alignC')));
  alignSelect.append(el('option', { value: 'left' }, t('studio.alignL')));
  alignSelect.append(el('option', { value: 'right' }, t('studio.alignR')));
  const upperCheck = el('input', { type: 'checkbox', checked: true });
  const autoFitBtn = el('button', { class: 'btn btn-sm', type: 'button' }, '⤢ ' + t('studio.autoFit'));

  function bindText(prop, transform = (v) => v) {
    return (e) => { const l = mc.selected(); if (l) mc.updateLayer(l.id, { [prop]: transform(e.target.value) }); };
  }
  txtInput.addEventListener('input', bindText('text'));
  fontSelect.addEventListener('change', bindText('font'));
  sizeRange.addEventListener('input', bindText('fontSize', Number));
  colorInput.addEventListener('input', bindText('color'));
  strokeColorInput.addEventListener('input', bindText('strokeColor'));
  strokeWRange.addEventListener('input', bindText('strokeWidth', Number));
  hlCheck.addEventListener('change', bindText('highlight', (v) => v === 'on'));
  hlColor.addEventListener('input', bindText('highlightColor'));
  alignSelect.addEventListener('change', bindText('align'));
  upperCheck.addEventListener('change', bindText('uppercase', (v) => v === 'on'));

  autoFitBtn.addEventListener('click', () => {
    const l = mc.selected();
    if (!l) return;
    // Einfacher Auto-Fit: so groß wie möglich bei ≤ 6 Zeilen
    const target = Math.round(Math.min(mc.cw, mc.ch) * 0.35);
    let lo = 10, hi = target, best = 10;
    const test = (size) => {
      const font = FONTS[l.font] || FONTS.classic;
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = `${font.weight} ${size}px ${font.stack}`;
      const words = String(l.uppercase ? l.text.toUpperCase() : l.text).split(/\s+/).filter(Boolean);
      const lines = []; let cur = '';
      for (const w of words) {
        const testS = cur ? cur + ' ' + w : w;
        if (ctx.measureText(testS).width > mc.cw * 0.92 && cur) { lines.push(cur); cur = w; } else cur = testS;
      }
      if (cur) lines.push(cur);
      return lines.length;
    };
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (test(mid) <= 6) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    mc.updateLayer(l.id, { fontSize: best });
  });

  function syncPanelFromLayer() {
    refreshLayerList();
    const l = mc.selected();
    const active = !!l;
    [txtInput, fontSelect, sizeRange, colorInput, strokeColorInput, strokeWRange, hlCheck, hlColor, alignSelect, upperCheck, autoFitBtn].forEach((n) => { n.disabled = !active; });
    if (!l) return;
    if (document.activeElement !== txtInput) txtInput.value = l.text;
    fontSelect.value = l.font;
    sizeRange.max = Math.round(Math.min(mc.cw, mc.ch) * 0.5);
    sizeRange.value = l.fontSize;
    colorInput.value = l.color;
    strokeColorInput.value = l.strokeColor;
    strokeWRange.value = l.strokeWidth;
    hlCheck.checked = !!l.highlight;
    hlColor.value = l.highlightColor;
    alignSelect.value = l.align;
    upperCheck.checked = l.uppercase;
  }

  // ---------- Bild-Panel + Bühnen-Toolbar ----------
  const zoomRange = el('input', { type: 'range', min: 100, max: 250, value: 100, id: 'studio-zoom', 'aria-label': t('studio.zoom') });
  const zoomValue = el('output', { class: 'stage-zoom-val', for: 'studio-zoom' }, '100%');
  const brightRange = el('input', { type: 'range', min: 40, max: 200, value: 100 });
  const contrastRange = el('input', { type: 'range', min: 40, max: 200, value: 100 });
  const satRange = el('input', { type: 'range', min: 0, max: 250, value: 100 });
  const flipBtn = el('button', { class: 'btn btn-sm', type: 'button', 'aria-pressed': 'false' }, '⇋ ' + t('studio.flip'));
  const rotBtn = el('button', { class: 'btn btn-sm', type: 'button' }, '⟳ ' + t('studio.rotate'));
  const resetBtn = el('button', { class: 'btn btn-sm', type: 'button' }, '↺ ' + t('studio.reset'));

  zoomRange.addEventListener('input', () => {
    mc.zoom = zoomRange.value / 100;
    zoomValue.textContent = `${zoomRange.value}%`;
    mc.render();
  });
  brightRange.addEventListener('input', () => { mc.filters.brightness = Number(brightRange.value); mc.render(); });
  contrastRange.addEventListener('input', () => { mc.filters.contrast = Number(contrastRange.value); mc.render(); });
  satRange.addEventListener('input', () => { mc.filters.saturate = Number(satRange.value); mc.render(); });
  function resetImageControls() {
    zoomRange.value = 100; zoomValue.textContent = '100%';
    brightRange.value = 100; contrastRange.value = 100; satRange.value = 100;
    flipBtn.setAttribute('aria-pressed', 'false');
  }
  flipBtn.addEventListener('click', () => {
    mc.flip = !mc.flip;
    flipBtn.setAttribute('aria-pressed', String(mc.flip));
    mc.render();
  });
  rotBtn.addEventListener('click', () => {
    mc.rot = (mc.rot + 1) % 4;
    mc._recomputeSize();
    syncPanelFromLayer();
    mc.render();
  });
  resetBtn.addEventListener('click', () => {
    mc.zoom = 1; mc.flip = false; mc.rot = 0;
    mc.filters = { brightness: 100, contrast: 100, saturate: 100 };
    zoomRange.value = 100; zoomValue.textContent = '100%';
    brightRange.value = 100; contrastRange.value = 100; satRange.value = 100;
    flipBtn.setAttribute('aria-pressed', 'false');
    mc._recomputeSize(); mc.render();
  });

  const stageToolbar = el('div', { class: 'stage-toolbar', role: 'toolbar', 'aria-label': t('studio.toolbar') },
    el('label', { class: 'stage-zoom' },
      el('span', { 'aria-hidden': 'true' }, '🔍'),
      zoomRange,
      zoomValue,
    ),
    el('div', { class: 'stage-tool-btns' }, flipBtn, rotBtn, resetBtn),
  );

  // ---------- Export ----------
  const fmtSelect = el('select');
  fmtSelect.append(el('option', { value: 'image/png' }, 'PNG'));
  fmtSelect.append(el('option', { value: 'image/jpeg' }, 'JPEG'));
  const qRange = el('input', { type: 'range', min: 50, max: 98, value: 92 });
  const dlBtn = el('button', { class: 'btn btn-primary', type: 'button' }, '⬇ ' + t('studio.download'));
  const cpBtn = el('button', { class: 'btn', type: 'button' }, '⧉ ' + t('studio.copy'));

  dlBtn.addEventListener('click', async () => {
    const blob = await mc.toBlob(fmtSelect.value, qRange.value / 100);
    const a = el('a', { href: URL.createObjectURL(blob), download: `meme-${Date.now()}.${fmtSelect.value.includes('png') ? 'png' : 'jpg'}` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
  cpBtn.addEventListener('click', async () => {
    try {
      const blob = await mc.toBlob('image/png');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast(t('studio.copied'));
    } catch { toast('Kopieren nicht möglich – nutze „Herunterladen“'); }
  });

  // Hauptaktion ohne Scrollen erreichbar: Download direkt an der Bühne.
  stageToolbar.querySelector('.stage-tool-btns').append(
    el('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => dlBtn.click() }, '⬇ ' + t('studio.download')),
  );

  // ---------- Tastatur ----------
  function isTyping(target) {
    const tag = target?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!target?.isContentEditable;
  }

  function onKey(e) {
    if (e.defaultPrevented || isTyping(e.target)) return;
    const layer = mc.selected();
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && (e.key === 'd' || e.key === 'D')) {
      if (!layer) return;
      e.preventDefault();
      mc.duplicateLayer(layer.id);
      return;
    }
    if (mod || e.altKey) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && layer) {
      e.preventDefault();
      mc.removeLayer(layer.id);
      return;
    }
    if (!layer) return;
    const step = e.shiftKey ? 10 : 1;
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    mc.updateLayer(layer.id, {
      x: Math.max(10, Math.min(mc.cw - 10, layer.x + dx)),
      y: Math.max(10, Math.min(mc.ch - 10, layer.y + dy)),
    });
  }

  const abort = new AbortController();
  document.addEventListener('keydown', onKey, { signal: abort.signal });
  function cleanup() {
    abort.abort();
    revokeThumbs();
    mc.destroy();
    if (currentStudioCleanup === cleanup) currentStudioCleanup = null;
  }
  currentStudioCleanup = cleanup;
  window.addEventListener('hashchange', cleanup, { once: true, signal: abort.signal });

  // ---------- Layout zusammensetzen ----------
  app.append(
    el('div', { class: 'wrap studio-page' },
      el('h1', {}, t('studio.title')),
      galleryCard,
      fallbackBar,
      el('div', { class: 'studio-grid' },
        el('div', { class: 'stage-wrap' },
          el('div', { class: 'stage' }, canvas, el('div', { class: 'stage-hint' }, t('studio.hint'))),
          stageToolbar,
        ),
        el('div', { class: 'card panel studio-panel' },
          el('h3', {}, t('studio.layers'), addLayerBtn),
          layerList,
          el('p', { class: 'studio-keys' }, t('studio.keys')),
          el('h3', {}, t('studio.text')),
          el('label', {}, t('studio.content')), txtInput,
          el('div', { class: 'fieldrow', style: 'margin-top:12px' },
            el('div', { class: 'grow' }, el('label', {}, t('studio.font')), fontSelect),
            el('div', {}, el('label', {}, t('studio.size')), sizeRange),
          ),
          el('div', { class: 'fieldrow' },
            el('div', {}, el('label', {}, t('studio.color')), colorInput),
            el('div', {}, el('label', {}, t('studio.strokeW')), strokeWRange),
            el('div', {}, el('label', {}, t('studio.stroke')), strokeColorInput),
          ),
          el('div', { class: 'fieldrow' },
            el('div', { style: 'display:flex;gap:8px;align-items:center' }, hlCheck, el('span', {}, t('studio.highlight'))),
            hlColor,
          ),
          el('div', { class: 'fieldrow' },
            el('div', { class: 'grow' }, el('label', {}, t('studio.align')), alignSelect),
            el('label', { style: 'display:flex;gap:8px;align-items:center;margin:0' }, upperCheck, t('studio.upper')),
          ),
          el('div', { style: 'display:flex;gap:8px' }, autoFitBtn),
          el('h3', {}, t('studio.image')),
          el('div', { class: 'fieldrow' }, el('div', {}, el('label', {}, t('studio.bright')), brightRange)),
          el('div', { class: 'fieldrow' }, el('div', {}, el('label', {}, t('studio.contrast')), contrastRange)),
          el('div', { class: 'fieldrow' }, el('div', {}, el('label', {}, t('studio.saturate')), satRange)),
          el('h3', {}, t('studio.export')),
          el('div', { class: 'fieldrow' },
            el('div', { class: 'grow' }, el('label', {}, t('studio.format')), fmtSelect),
            el('div', {}, el('label', {}, t('studio.quality')), qRange),
          ),
          el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;margin-top:6px' }, dlBtn, cpBtn),
        ),
      ),
    ),
  );

  // Drag & Drop auf die Bühne (erst nach dem Einfügen ins DOM verfügbar)
  const stageEl = app.querySelector('.stage');
  stageEl.addEventListener('dragover', (e) => { e.preventDefault(); });
  stageEl.addEventListener('drop', async (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith('image/')) await useLocalImage(f);
  });

  // Init
  (async () => {
    await refreshTemplates();
    let initial = params.template || null;
    if (!initial && ServerAPI.available && window.__serverTpls?.length) {
      initial = `srv:${window.__serverTpls[0].id}`;
    }
    if (!initial) initial = [...tplSelect.options].find((o) => o.value)?.value || null;
    if (!initial || !(await loadTemplate(initial))) {
      // Leere Leinwand als Fallback
      await mc.setImage(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><rect width="640" height="640" fill="#FFC93C"/></svg>'], { type: 'image/svg+xml' }));
      resetDefaultLayers();
    }
    tplSelect.addEventListener('change', () => { if (tplSelect.value) loadTemplate(tplSelect.value); });
  })();
}
