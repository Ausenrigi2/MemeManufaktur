// ============ Pakete: IndexedDB + Server-Sync ============
import { LS, uid, toast } from './lib.js';

const DB_NAME = 'mememanufaktur';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('templates')) db.createObjectStore('templates', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('packs')) db.createObjectStore('packs', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(store, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => resolve(out?.result !== undefined ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const Packs = {
  /** Alle Templates (Blob enthalten) – für Studio & Spiel */
  async allTemplates() {
    return (await tx('templates', 'readonly', (s) => s.getAll())) || [];
  },
  async getTemplate(id) {
    return (await tx('templates', 'readonly', (s) => s.get(id))) || null;
  },
  async addTemplate(meta) {
    await tx('templates', 'readwrite', (s) => s.put(meta));
    return meta;
  },
  async deleteTemplate(id) {
    await tx('templates', 'readwrite', (s) => s.delete(id));
  },
  async allPacks() {
    const packs = (await tx('packs', 'readonly', (s) => s.getAll())) || [];
    return packs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },
  async createPack(name) {
    const pack = { id: uid('pk'), name, builtin: false, tplIds: [], order: Date.now(), createdAt: Date.now() };
    await tx('packs', 'readwrite', (s) => s.put(pack));
    return pack;
  },
  async updatePack(pack) {
    await tx('packs', 'readwrite', (s) => s.put(pack));
  },
  async deletePack(id) {
    await tx('packs', 'readwrite', (s) => s.delete(id));
  },
  /** Bilder (Date-Objekte) in ein Paket legen */
  async uploadFiles(files, packId, { shared = false } = {}) {
    const results = [];
    let pack = null;
    if (packId) {
      const packs = await this.allPacks();
      pack = packs.find((p) => p.id === packId) || null;
    }
    for (const file of files) {
      const id = uid('tpl');
      const meta = {
        id, name: file.name.replace(/\.[^.]+$/, ''), blob: file,
        mime: file.type || 'image/png',
        builtin: false, packId: packId || null,
        shared: shared || null,
        createdAt: Date.now(),
      };
      await this.addTemplate(meta);
      if (pack && !pack.tplIds.includes(id)) {
        pack.tplIds.push(id);
        await this.updatePack(pack);
      }
      if (shared) {
        try { await ServerAPI.upload({ id, name: meta.name, blob: file, mime: meta.mime }); } catch (e) { console.warn('Server-Upload fehlgeschlagen', e); }
      }
      results.push(meta);
    }
    return results;
  },

  async removeTemplateFromPack(id) {
    const packs = await this.allPacks();
    for (const p of packs) {
      if (p.tplIds.includes(id)) {
        p.tplIds = p.tplIds.filter((x) => x !== id);
        await this.updatePack(p);
      }
    }
    await this.deleteTemplate(id);
  },

  async templatesInPack(packId) {
    const packs = await this.allPacks();
    const pack = packs.find((p) => p.id === packId);
    if (!pack) return [];
    const all = await this.allTemplates();
    return pack.tplIds.map((id) => all.find((t) => t.id === id)).filter(Boolean);
  },

  /** Built-in Templates (SVG aus assets) einrichten – einmalig */
  async ensureBuiltins() {
    const done = LS.get('builtinsInstalled', null);
    if (done) return;
    const files = [
      ['stonks', 'Stonks'],
      ['drake', 'Dracke (Ja/Nein)'],
      ['ragecat', 'Rage Cat'],
      ['crying', 'Weinerl'],
      ['shrug', 'Schrugg'],
      ['confused', 'Verwirrte Lady'],
      ['distracted', 'Ablenkung'],
      ['pigeon', 'Ist das eine Taube?'],
      ['leinwand-gelb', 'Leinwand Gelb'],
      ['leinwand-pink', 'Leinwand Pink'],
    ];
    // Feste IDs, damit Studio-Links stabil bleiben
    const ids = {};
    for (const [key] of files) ids[key] = `builtin_${key}`;
    const existing = new Set((await this.allTemplates()).map((t) => t.id));
    let changed = false;
    for (const [key, name] of files) {
      if (existing.has(ids[key])) continue;
      const url = `assets/templates/${key}.svg`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const blob = await res.blob();
      await this.addTemplate({
        id: ids[key], name, blob, mime: 'image/svg+xml',
        builtin: true, packId: 'pk_builtin_klassiker', shared: null,
        createdAt: Date.now(),
      });
      changed = true;
    }
    const packs = await this.allPacks();
    if (!packs.some((p) => p.id === 'pk_builtin_klassiker')) {
      await this.createPackRaw('pk_builtin_klassiker', 'Klassiker', true, files.map(([k]) => ids[k]));
    } else if (changed) {
      const pack = packs.find((p) => p.id === 'pk_builtin_klassiker');
      for (const [key] of files) {
        const id = ids[key];
        if (!pack.tplIds.includes(id)) pack.tplIds.push(id);
      }
      await this.updatePack(pack);
    }
    LS.set('builtinsInstalled', true);
  },
  async createPackRaw(id, name, builtin, tplIds) {
    await tx('packs', 'readwrite', (s) => s.put({ id, name, builtin, tplIds, order: 1, createdAt: Date.now() }));
  },
};

// ============ Server-API (optional, wenn Node-Server läuft) ============
export const ServerAPI = {
  available: null,
  user: null,
  async check() {
    try {
      const r = await fetch('/health', { cache: 'no-store' });
      if (!r.ok) return false;
      this.available = true;
      await this.me(); // Session wiederherstellen (401 => nicht angemeldet)
      return true;
    } catch { this.available = false; return false; }
  },
  async me() {
    const r = await fetch('/api/me', { cache: 'no-store' });
    if (r.status === 401) { this.user = null; return null; }
    if (!r.ok) throw new Error('me');
    const d = await r.json();
    this.user = d.user;
    return d; // { user, used, quota }
  },
  async post(path, body) {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || String(r.status));
    if (d.user) this.user = d.user;
    return d;
  },
  register(email, password) { return this.post('/api/register', { email, password }); },
  login(email, password) { return this.post('/api/login', { email, password }); },
  vote(id) { return this.post('/api/vote', { id }); },
  async logout() { await this.post('/api/logout', {}); this.user = null; },
  async library() {
    const r = await fetch('/api/library', { cache: 'no-store' });
    if (!r.ok) throw new Error('library');
    return r.json();
  },
  async upload(meta) {
    const data = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result.split(',')[1]);
      fr.onerror = rej;
      fr.readAsDataURL(meta.blob);
    });
    const r = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: meta.id, name: meta.name, mime: meta.mime, data }),
    });
    if (!r.ok) throw new Error(`upload ${r.status}`);
    return r.json();
  },
  async remove(id) {
    const r = await fetch(`/api/library/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!r.ok) throw new Error(`remove ${r.status}`);
  },
  url(id) { return `/uploads/${id}`; },
};
