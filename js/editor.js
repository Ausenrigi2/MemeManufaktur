// ============ MemeCanvas – lokale Render-Engine ============
import { uid } from './lib.js';
import { zoneFor, layerPatch } from './textzones.js';

export const FONTS = {
  classic:   { label: 'Klassisch (Impact)', stack: "Impact,'Arial Black','Haettenschweiler',sans-serif", weight: 400 },
  heavy:     { label: 'Extra schwer',       stack: "'Arial Black','Archivo Black','Avenir Next Condensed',sans-serif", weight: 900 },
  playful:   { label: 'Verspielt',          stack: "'Comic Sans MS','Chalkboard SE','Marker Felt',cursive", weight: 700 },
  serif:     { label: 'Serif (Times)',      stack: "'Times New Roman',Georgia,serif", weight: 700 },
};

const MAX_SIDE = 1280;

export class MemeCanvas {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.image = null;       // HTMLImageElement
    this.natural = { w: 0, h: 0 };
    this.rot = 0;            // 0..3
    this.flip = false;
    this.zoom = 1;
    this.filters = { brightness: 100, contrast: 100, saturate: 100 };
    this.layers = [];
    this.selectedId = null;
    this.onSelect = null;
    this.onChange = null;
    this._dragging = null;
    this._url = null;
  }

  get cw() { return this.canvas.width; }
  get ch() { return this.canvas.height; }

  _recomputeSize() {
    if (!this.image) return;
    let [w, h] = [this.natural.w, this.natural.h];
    if (this.rot % 2 === 1) [w, h] = [h, w];
    const k = Math.min(1, MAX_SIDE / Math.max(w, h));
    this.canvas.width = Math.round(w * k);
    this.canvas.height = Math.round(h * k);
  }

  async setImage(blobOrUrl, name = '') {
    const url = blobOrUrl instanceof Blob ? URL.createObjectURL(blobOrUrl) : blobOrUrl;
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res; img.onerror = rej;
      img.src = url;
    });
    if (this._url) URL.revokeObjectURL(this._url);
    this._url = blobOrUrl instanceof Blob ? url : null;
    this.image = img;
    this.natural = { w: img.naturalWidth || img.width, h: img.naturalHeight || img.height };
    this.rot = 0; this.flip = false; this.zoom = 1;
    this.filters = { brightness: 100, contrast: 100, saturate: 100 };
    this.name = name;
    this._recomputeSize();
    this.render();
  }

  addLayer(patch = {}) {
    const base = Math.min(this.cw, this.ch) || 640;
    const layer = {
      id: uid('ly'),
      text: '', x: this.cw / 2, y: this.ch / 2,
      fontSize: Math.round(base * 0.11),
      font: 'classic', color: '#ffffff', strokeColor: '#000000', strokeWidth: 8,
      highlight: false, highlightColor: '#FFC93C', align: 'center', uppercase: true,
      ...patch,
    };
    this.layers.push(layer);
    this.selectedId = layer.id;
    this.render();
    this._emitChange();
    return layer;
  }

  updateLayer(id, patch) {
    const l = this.layers.find((x) => x.id === id);
    if (!l) return;
    Object.assign(l, patch);
    this.render();
    this._emitChange();
  }

  removeLayer(id) {
    this.layers = this.layers.filter((l) => l.id !== id);
    if (this.selectedId === id) this.selectedId = null;
    this.render();
    this._emitChange();
  }

  reorderLayer(id, dir) {
    const i = this.layers.findIndex((l) => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= this.layers.length) return;
    [this.layers[i], this.layers[j]] = [this.layers[j], this.layers[i]];
    this.render();
    this._emitChange();
  }

  selected() { return this.layers.find((l) => l.id === this.selectedId) || null; }

  select(id) { this.selectedId = id; this.render(); this._emitChange(); }

  _emitChange() { if (this.onChange) this.onChange(); }

  // ---------- Text-Layout ----------
  _wrapText(ctx, text, maxWidth) {
    const words = String(text).replace(/\r/g, '').split(/(\s+)/).filter((w) => w.length);
    const lines = [];
    let cur = '';
    for (const w of words) {
      if (/^\n?$/.test(w)) {
        if (cur.trim()) { lines.push(cur.trim()); cur = ''; } else if (lines.length) { /* Leerzeile ignorieren */ }
        continue;
      }
      const test = cur ? cur + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = w; }
      else cur = test;
    }
    if (cur.trim()) lines.push(cur.trim());
    return lines;
  }

  _drawLayer(ctx, l) {
    const font = FONTS[l.font] || FONTS.classic;
    const fs = Math.max(8, l.fontSize);
    ctx.font = `${font.weight} ${fs}px ${font.stack}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center'; // cx-Berechnung unten setzt Zentrierung voraus (Default wäre "start")
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    const maxWidth = this.cw * 0.92;
    const text = l.uppercase ? l.text.toUpperCase() : l.text;
    const lines = this._wrapText(ctx, text, maxWidth);
    if (!lines.length) { l._box = null; return; }
    const lineHeight = fs * 1.18;
    const totalH = lines.length * lineHeight;
    let topY = l.y - totalH / 2;
    let minW = 0;
    const widths = lines.map((ln) => { const w = ctx.measureText(ln).width; minW = Math.max(minW, w); return w; });
    let minX = Infinity, maxX = -Infinity;
    const pad = fs * 0.14;

    for (let i = 0; i < lines.length; i++) {
      const cy = topY + i * lineHeight + lineHeight / 2;
      let cx;
      if (l.align === 'left') cx = this.cw * 0.04 + widths[i] / 2;
      else if (l.align === 'right') cx = this.cw * 0.96 - widths[i] / 2;
      else cx = this.cw / 2;

      if (l.highlight) {
        ctx.fillStyle = l.highlightColor;
        const rx = cx - widths[i] / 2 - pad;
        ctx.fillRect(rx, cy - fs * 0.66, widths[i] + pad * 2, fs * 1.32);
        minX = Math.min(minX, rx); maxX = Math.max(maxX, rx + widths[i] + pad * 2);
      } else {
        minX = Math.min(minX, cx - widths[i] / 2); maxX = Math.max(maxX, cx + widths[i] / 2);
      }
      if (l.strokeWidth > 0 && l.text.trim()) {
        ctx.strokeStyle = l.strokeColor;
        ctx.lineWidth = l.strokeWidth;
        ctx.strokeText(lines[i], cx, cy);
      }
      ctx.fillStyle = l.color;
      ctx.fillText(lines[i], cx, cy);
    }
    l._box = { minX, maxX, minY: topY, maxY: topY + totalH };
  }

  render() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (this.image) {
      const { w: nw, h: nh } = this.natural;
      const k = this.cw / (this.rot % 2 === 1 ? nh : nw); // Skalierung zur nativen Auflösung
      ctx.save();
      ctx.translate(this.cw / 2, this.ch / 2);
      ctx.rotate((this.rot * Math.PI) / 2);
      ctx.scale(this.zoom * (this.flip ? -1 : 1), this.zoom);
      const f = this.filters;
      ctx.filter = `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturate}%)`;
      ctx.drawImage(this.image, (-nw / 2) * k, (-nh / 2) * k, nw * k, nh * k);
      ctx.restore();
      ctx.filter = 'none';
    }
    for (const l of this.layers) this._drawLayer(ctx, l);
  }

  toBlob(type = 'image/png', quality = 0.92) {
    return new Promise((res) => this.canvas.toBlob(res, type, quality));
  }

  // ---------- Pointer-Interaktion ----------
  bindPointer() {
    const cv = this.canvas;
    cv.style.cursor = 'grab';
    cv.addEventListener('pointerdown', (e) => {
      const p = this._point(e);
      const layer = this.hitTest(p.x, p.y);
      this.select(layer ? layer.id : null);
      if (layer) {
        this._dragging = { id: layer.id, dx: p.x - layer.x, dy: p.y - layer.y };
        cv.setPointerCapture(e.pointerId);
        cv.style.cursor = 'grabbing';
      }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!this._dragging) return;
      const p = this._point(e);
      const l = this.layers.find((x) => x.id === this._dragging.id);
      if (l) {
        l.x = Math.max(10, Math.min(this.cw - 10, p.x - this._dragging.dx));
        l.y = Math.max(10, Math.min(this.ch - 10, p.y - this._dragging.dy));
        this.render();
      }
    });
    const end = () => { if (this._dragging) { this._dragging = null; cv.style.cursor = 'grab'; this._emitChange(); } };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('wheel', (e) => {
      const l = this.selected();
      if (!l) return;
      e.preventDefault();
      const step = e.deltaY < 0 ? 1.06 : 1 / 1.06;
      const max = Math.round(Math.min(this.cw, this.ch) * 0.5);
      this.updateLayer(l.id, { fontSize: Math.max(10, Math.min(max, Math.round(l.fontSize * step))) });
    }, { passive: false });
  }

  _point(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * this.cw, y: ((e.clientY - r.top) / r.height) * this.ch };
  }

  hitTest(x, y) {
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const b = this.layers[i]._box;
      if (!b) continue;
      if (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY) return this.layers[i];
    }
    return null;
  }
}

// Render-Helper für Spiel-Vorschauen (deterministisch auf allen Clients)
export async function renderMemeToDataUrl({ blob, top = '', bottom = '', id = '' }, width = 480) {
  const canvas = document.createElement('canvas');
  const mc = new MemeCanvas(canvas);
  await mc.setImage(blob);
  const base = Math.min(mc.cw, mc.ch);
  const fs = Math.round(base * 0.11);
  const z = zoneFor(id);
  const topText = String(top).trim();
  const botText = String(bottom).trim();
  if (topText) {
    mc.addLayer({ text: topText, ...(layerPatch(mc, z?.top) || { y: Math.round(base * 0.13), fontSize: fs, strokeWidth: Math.max(4, Math.round(fs / 9)) }) });
    mc.selectedId = null;
  }
  if (botText) {
    mc.addLayer({ text: botText, ...(layerPatch(mc, z?.bottom) || { y: mc.ch - Math.round(base * 0.13), fontSize: fs, strokeWidth: Math.max(4, Math.round(fs / 9)) }) });
  }
  mc.render();
  return mc.toBlob('image/jpeg', 0.85).then((b) => {
    return new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.readAsDataURL(b);
    });
  });
}
