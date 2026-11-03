// ============ Studio-Seite ============
import { el, t, toast, rand, applyI18n } from './lib.js';
import { MemeCanvas, FONTS } from './editor.js';
import { Packs, ServerAPI } from './packs.js';

export function openStudio(params = {}) {
  const app = document.getElementById('app');
  app.innerHTML = '';

  const canvas = el('canvas', { width: 640, height: 640, 'aria-label': 'Meme-Vorschau' });
  const mc = new MemeCanvas(canvas);
  mc.bindPointer();
  mc.onChange = () => syncPanelFromLayer();

  // ---------- Template-Balken ----------
  const tplSelect = el('select', { id: 'tpl-select', 'aria-label': t('studio.tpl') });
  const randomBtn = el('button', { class: 'btn btn-sm', type: 'button', onclick: () => pickRandom() }, t('studio.random'), ' 🎲');
  const fileInput = el('input', { type: 'file', accept: 'image/*', hidden: true, multiple: false });
  const uploadBtn = el('button', { class: 'btn btn-sm', type: 'button', onclick: () => fileInput.click() }, t('studio.upload'));

  async function refreshTemplates() {
    if (ServerAPI.available) {
      try { window.__serverTpls = await ServerAPI.library(); } catch { /* Server kurz weg – alten Stand behalten */ }
    }
    const packs = await Packs.allPacks();
    const all = await Packs.allTemplates();
    tplSelect.innerHTML = '';
    for (const p of packs) {
      const group = el('optgroup', { label: p.name });
      const tpls = p.tplIds.map((id) => all.find((x) => x.id === id)).filter(Boolean);
      for (const tpl of tpls) group.append(el('option', { value: tpl.id }, `${tpl.name}`));
      tplSelect.append(group);
    }
    if (ServerAPI.available && window.__serverTpls?.length) {
      const group = el('optgroup', { label: t('pakete.serverTitle') });
      for (const s of window.__serverTpls) group.append(el('option', { value: `srv:${s.id}` }, s.name));
      tplSelect.append(group);
    }
  }

  async function loadTemplate(id) {
    try {
      let blob; let name = id;
      if (id.startsWith('srv:')) {
        const sid = id.slice(4);
        const res = await fetch(ServerAPI.url(sid));
        blob = await res.blob();
      } else {
        const tpl = await Packs.getTemplate(id);
        if (!tpl) return;
        blob = tpl.blob; name = tpl.name;
      }
      await mc.setImage(blob, name);
      resetDefaultLayers();
      if ([...tplSelect.options].some((o) => o.value === id)) tplSelect.value = id;
      toast(t('studio.saved'));
    } catch (e) { console.error(e); toast('⚠️ ' + e.message); }
  }

  function resetDefaultLayers() {
    mc.layers = [];
    mc.selectedId = null;
    const base = Math.min(mc.cw, mc.ch);
    mc.addLayer({ text: '', y: Math.round(base * 0.12), fontSize: Math.round(base * 0.11), strokeWidth: Math.max(5, Math.round(base * 0.012)) });
    mc.addLayer({ text: '', y: mc.ch - Math.round(base * 0.12), fontSize: Math.round(base * 0.11), strokeWidth: Math.max(5, Math.round(base * 0.012)) });
    syncPanelFromLayer();
  }

  async function pickRandom() {
    const all = (await Packs.allTemplates()).filter((x) => !x.builtin || true);
    if (!all.length) return;
    const tpl = rand(all);
    await loadTemplate(tpl.id);
  }

  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    if (!f) return;
    await mc.setImage(f, f.name);
    resetDefaultLayers();
    fileInput.value = '';
  });

  // ---------- Ebenen-Liste ----------
  const layerList = el('ul', { class: 'layer-list' });
  const addLayerBtn = el('button', { class: 'btn btn-sm', type: 'button', onclick: () => { mc.addLayer({ text: '', x: mc.cw / 2, y: mc.ch / 2 }); refreshLayerList(); } }, '+ ' + t('studio.addLayer'));

  function refreshLayerList() {
    layerList.innerHTML = '';
    if (!mc.layers.length) { layerList.append(el('li', { class: 'txt', style: 'color:var(--muted)' }, t('studio.noLayers'))); return; }
    for (const l of [...mc.layers].reverse()) {
      const label = (l.text || '…').slice(0, 22);
      const item = el('li', {
        class: `layer-item${l.id === mc.selectedId ? ' selected' : ''}`,
        onclick: () => { mc.select(l.id); refreshLayerList(); syncPanelFromLayer(); },
      },
        el('span', {}, '▣'),
        el('span', { class: 'txt' }, label),
        el('button', { class: 'btn btn-icon btn-sm', title: '↑', onclick: (e) => { e.stopPropagation(); mc.reorderLayer(l.id, -1); refreshLayerList(); } }, '↑'),
        el('button', { class: 'btn btn-icon btn-sm', title: '↓', onclick: (e) => { e.stopPropagation(); mc.reorderLayer(l.id, 1); refreshLayerList(); } }, '↓'),
        el('button', { class: 'btn btn-icon btn-sm', title: 'Löschen', onclick: (e) => { e.stopPropagation(); mc.removeLayer(l.id); refreshLayerList(); } }, '✕'),
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
    let fs = l.fontSize;
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
    void fs;
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

  // ---------- Bild-Panel ----------
  const zoomRange = el('input', { type: 'range', min: 100, max: 250, value: 100 });
  const brightRange = el('input', { type: 'range', min: 40, max: 200, value: 100 });
  const contrastRange = el('input', { type: 'range', min: 40, max: 200, value: 100 });
  const satRange = el('input', { type: 'range', min: 0, max: 250, value: 100 });
  const flipBtn = el('button', { class: 'btn btn-sm', type: 'button' }, '⇋ ' + t('studio.flip'));
  const rotBtn = el('button', { class: 'btn btn-sm', type: 'button' }, '⟳ ' + t('studio.rotate'));
  const resetBtn = el('button', { class: 'btn btn-sm', type: 'button' }, '↺ ' + t('studio.reset'));

  zoomRange.addEventListener('input', () => { mc.zoom = zoomRange.value / 100; mc.render(); });
  brightRange.addEventListener('input', () => { mc.filters.brightness = Number(brightRange.value); mc.render(); });
  contrastRange.addEventListener('input', () => { mc.filters.contrast = Number(contrastRange.value); mc.render(); });
  satRange.addEventListener('input', () => { mc.filters.saturate = Number(satRange.value); mc.render(); });
  flipBtn.addEventListener('click', () => { mc.flip = !mc.flip; mc.render(); });
  rotBtn.addEventListener('click', () => {
    mc.rot = (mc.rot + 1) % 4;
    mc._recomputeSize();
    syncPanelFromLayer();
    mc.render();
  });
  resetBtn.addEventListener('click', () => {
    mc.zoom = 1; mc.flip = false; mc.rot = 0;
    mc.filters = { brightness: 100, contrast: 100, saturate: 100 };
    zoomRange.value = 100; brightRange.value = 100; contrastRange.value = 100; satRange.value = 100;
    mc._recomputeSize(); mc.render();
  });

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

  // ---------- Layout zusammensetzen ----------
  app.append(
    el('div', { class: 'wrap' },
      el('h1', {}, t('studio.title')),
      el('div', { class: 'tpl-bar' },
        tplSelect, randomBtn, uploadBtn, fileInput,
      ),
      el('div', { class: 'studio-grid' },
        el('div', { class: 'card panel' },
          el('h3', {}, t('studio.layers'), addLayerBtn),
          layerList,
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
          el('div', { class: 'fieldrow' }, el('div', {}, el('label', {}, t('studio.zoom')), zoomRange)),
          el('div', { class: 'fieldrow' }, el('div', {}, el('label', {}, t('studio.bright')), brightRange)),
          el('div', { class: 'fieldrow' }, el('div', {}, el('label', {}, t('studio.contrast')), contrastRange)),
          el('div', { class: 'fieldrow' }, el('div', {}, el('label', {}, t('studio.saturate')), satRange)),
          el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, flipBtn, rotBtn, resetBtn),
          el('h3', {}, t('studio.export')),
          el('div', { class: 'fieldrow' },
            el('div', { class: 'grow' }, el('label', {}, t('studio.format')), fmtSelect),
            el('div', {}, el('label', {}, t('studio.quality')), qRange),
          ),
          el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;margin-top:6px' }, dlBtn, cpBtn),
        ),
        el('div', { class: 'stage-wrap' },
          el('div', { class: 'stage' }, canvas, el('div', { class: 'stage-hint' }, t('studio.hint'))),
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
    if (f && f.type.startsWith('image/')) { await mc.setImage(f, f.name); resetDefaultLayers(); }
  });

  // Init
  (async () => {
    await refreshTemplates();
    let initial = params.template || tplSelect.value || null;
    if (!initial && ServerAPI.available) {
      const srv = window.__serverTpls?.[0];
      if (srv) initial = `srv:${srv.id}`;
    }
    if (initial) await loadTemplate(initial);
    else {
      // Leere Leinwand als Fallback
      await mc.setImage(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><rect width="640" height="640" fill="#FFC93C"/></svg>'], { type: 'image/svg+xml' }));
      resetDefaultLayers();
    }
    tplSelect.addEventListener('change', () => loadTemplate(tplSelect.value));
  })();
}
