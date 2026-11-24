// ============ Pakete: IndexedDB + Server-Sync ============
import { uid, toast } from './lib.js';

const DB_NAME = 'mememanufaktur';
const DB_VERSION = 1;

const MAX_IMAGE_SIDE = 1600;
const OPTIMIZE_MIN_BYTES = 128 * 1024;

// Große Bilder vor dem Speichern/Upload verkleinern. GIFs und SVGs bleiben
// unangetastet: Animation bzw. bewusste Server-Ablehnung nicht zerstören.
export async function optimizeImage(file) {
  if (!file || !file.type?.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  if (file.size <= OPTIMIZE_MIN_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1) { bitmap.close?.(); return file; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    // PNG (evtl. Transparenz) -> WebP, Fotos -> JPEG. Browser-Fallback wird respektiert.
    const target = file.type === 'image/png' ? 'image/webp' : 'image/jpeg';
    const blob = await new Promise((res) => canvas.toBlob(res, target, 0.9));
    if (!blob || blob.size >= file.size) return file;
    const ext = blob.type === 'image/webp' ? '.webp' : blob.type === 'image/png' ? '.png' : '.jpg';
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + ext, { type: blob.type, lastModified: file.lastModified });
  } catch {
    return file;
  }
}

let dbPromise = null;
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('templates')) db.createObjectStore('templates', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('packs')) db.createObjectStore('packs', { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
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
    const failed = [];
    let pack = null;
    if (packId) {
      const packs = await this.allPacks();
      pack = packs.find((p) => p.id === packId) || null;
    }
    for (const raw of files) {
      const file = await optimizeImage(raw);
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
        try { await ServerAPI.upload({ id, name: meta.name, blob: file, mime: meta.mime, shared: !!shared }); }
        catch (e) { console.warn('Server-Upload fehlgeschlagen', e); failed.push(meta.name); }
      }
      results.push(meta);
    }
    results.failed = failed;
    return results;
  },

  async removeTemplateFromPack(id) {
    const packs = await this.allPacks();
    for (const p of packs) {
      if (p.tplIds.includes(id)) {
        p.tplIds = p.tplIds.filter((x) => x !== id);
        p.deleted = [...(p.deleted || []), id]; // damit neuer Pack-Inhalt nicht auf gelocale Einträge zurückkommt
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

  /** Alte eingebaute Templates/Packs aus früheren Versionen entfernen – nie eigene Uploads. */
  async removeBuiltins() {
    for (const t of await this.allTemplates()) {
      if (t.builtin || String(t.id).startsWith('builtin_')) await this.deleteTemplate(t.id);
    }
    for (const p of await this.allPacks()) {
      if (p.builtin || String(p.id).startsWith('pk_builtin_')) await this.deletePack(p.id);
    }
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
  async lobbies() {
    const r = await fetch('/api/lobbies', { cache: 'no-store' });
    if (!r.ok) throw new Error('lobbies');
    return r.json();
  },
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
      body: JSON.stringify({ id: meta.id, name: meta.name, mime: meta.mime, shared: !!meta.shared, data }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = new Error(d.error || `upload ${r.status}`);
      err.status = r.status;
      throw err;
    }
    return d;
  },
  async remove(id) {
    const r = await fetch(`/api/library/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!r.ok) throw new Error(`remove ${r.status}`);
  },
  url(id) { return `/uploads/${id}`; },
};
