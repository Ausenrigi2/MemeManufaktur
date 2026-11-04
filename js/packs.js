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

  /** Built-in Templates (SVG + freie Meme-Bilder aus assets) einrichten – einmalig */
  async ensureBuiltins() {
    // v2: der neue Pack wird auch bei bestehenden Installationen nachgetragen
    if (LS.get('builtinsInstalled', null) === 3) return;
    const groups = [
      { packId: 'pk_builtin_klassiker', name: 'Klassiker', files: [
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
      ]},
      { packId: 'pk_builtin_free', name: 'Internet-Klassiker', files: [
        ['advice-pie', 'Advice Animal', 'svg'],
        ['awesome-face', 'Okay / Nicht Okay', 'svg'],
        ['yuno-lego', 'Y U NO (LEGO)', 'jpg'],
        ['this-is-fine', 'This Is Fine', 'png'],
        ['illuminati', 'Illuminati', 'png'],
        ['einstein', 'Einstein-Tafel', 'jpg'],
        ['3d-printed-ban-hammer', 'Ban Hammer', 'jpg'],
        ['elias-garcia-martinez-ecce-homo', 'Ecce Homo', 'jpg'],
        ['macaca-nigra-self-portrait-large', 'Selbstporträt-Affe', 'jpg'],
        ['joshua-reynolds-david-garrick-between-tr', 'Tragik & Komik', 'jpg'],
        ['deep-fried-blue-gatorade', 'Deep Fried Gatorade', 'jpg'],
        ['deep-fried-meme', 'Deep Fried Meme', 'jpg'],
        ['deepfriedpepsican', 'Deep Fried Pepsi Can', 'jpg'],
        ['icon-on-my-wikipedia-userbox', 'Shiny Coin', 'png'],
        ['party-parrot', 'Party Parrot', 'svg'],
        ['original-party-parrot', 'Party Parrot GIF', 'gif'],
        ['screamer2', 'Screamer 2', 'gif'],
        ['screamer3', 'Screamer 3', 'gif'],
        ['chelovechek', 'Chelovechek', 'jpg'],
      ],
      // Review 2026-11: Bilder mit eingebautem Text oder Charts ohne Textraum sind keine Caption-Templates
      removed: ['doge', 'high-impact', 'a-message-from-captain-obvious', 'captain-obvious-strikes-again-flickr-k-e', 'thank-you-captain-obvious-3464853227', 'captain-bvious', 'deepfried-meme-w', 'chaotic-evil', 'lawful-good', 'lawful-neutral', 'lawful-evil', 'chaotic-good', 'chaotic-neutral', 'alignment-chart', '3-3-alignment', 'dnd-alignment-chart', 'the-femboy-hooters-jingle-ranch-sauce', 'dydchart', 'commons-tan-iceberg-chart-blank-template', 'texts-from-hillary', 'ready-for-hillary-15696891292', 'hillary-bus-15671686926', 'madame-secretary-text-drive']},
    ];
    const existing = new Set((await this.allTemplates()).map((t) => t.id));
    for (const g of groups) {
      for (const key of g.removed || []) {
        const id = `builtin_${key}`;
        if (!existing.has(id)) continue;
        await this.deleteTemplate(id);
        for (const p of await this.allPacks()) {
          if (p.tplIds.includes(id)) { p.tplIds = p.tplIds.filter((x) => x !== id); await this.updatePack(p); }
        }
      }
      for (const [key, name, ext = 'svg'] of g.files) {
        const id = `builtin_${key}`; // feste IDs, damit Studio-Links stabil bleiben
        if (existing.has(id)) continue;
        const res = await fetch(`assets/templates/${key}.${ext}`);
        if (!res.ok) continue;
        const blob = await res.blob();
        await this.addTemplate({
          id, name, blob, mime: res.type || `image/${ext}`,
          builtin: true, packId: g.packId, shared: null,
          createdAt: Date.now(),
        });
      }
      const packs = await this.allPacks();
      const pack = packs.find((p) => p.id === g.packId);
      if (!pack) {
        await this.createPackRaw(g.packId, g.name, true, g.files.map(([k]) => `builtin_${k}`));
      } else {
        // tplIds immer synchronisieren (idempotent) – auch wenn Templates schon vorher existierten
        let dirty = false;
        for (const [key] of g.files) {
          const id = `builtin_${key}`;
          if (!pack.tplIds.includes(id)) { pack.tplIds.push(id); dirty = true; }
        }
        if (dirty) await this.updatePack(pack);
      }
    }
    LS.set('builtinsInstalled', 3);
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
