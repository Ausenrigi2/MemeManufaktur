// ============ MemeManufaktur – Zero-Dependency Node-Server ============
// Statische Dateien + Upload-API + WebSocket-Relay für LAN-Partien.
// Start: node server.js  (Port via PORT, Default 8080)

import http from 'node:http';
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
// MEME_DATA_DIR entkoppelt Tests vom echten ./data
const DATA_DIR = process.env.MEME_DATA_DIR || path.join(ROOT, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const LIBRARY_FILE = path.join(DATA_DIR, 'library.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB pro Bild
const USER_QUOTA_BYTES = Number(process.env.MEME_USER_QUOTA_BYTES || 250 * 1024 * 1024); // 250 MB pro Account
const ANON_QUOTA_BYTES = Number(process.env.MEME_ANON_QUOTA_BYTES || 500 * 1024 * 1024); // 500 MB gemeinsamer Bestand
const MAX_JSON_BODY = 64 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_BODY_BYTES = Math.ceil(MAX_UPLOAD_BYTES * 4 / 3) + 1024 * 1024; // Base64-Puffer + JSON-Rahmen
const MAX_WS_BYTES = 8 * 1024 * 1024;      // 8 MB pro WS-Nachricht
// Client-Mimes, die beim Serven erlaubt sind – alles andere fällt auf den Dateityp zurück (XSS-Schutz)
const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
// Nur diese Pfade werden statisch ausgeliefert. Insbesondere data/, .git/,
// test/ und server.js bleiben damit unerreichbar.
const STATIC_FILES = new Set(['index.html', 'favicon.svg', 'manifest.webmanifest']);
const STATIC_DIRS = ['assets/', 'css/', 'js/'];

fssync.mkdirSync(UPLOADS_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

function mimeOf(file) { return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'; }

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'SAMEORIGIN',
};

function json(res, status, obj, extraHeaders = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store', ...extraHeaders });
  res.end(body);
}
function notFound(res) { json(res, 404, { error: 'not found' }); }

// ---------- JSON-Stores (data/) ----------
async function readJson(file) {
  let raw;
  try { raw = await fs.readFile(file, 'utf8'); }
  catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e; // Lesefehler nicht als "leer" interpretieren – sonst Datenverlust
  }
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error(`invalid store: ${path.basename(file)}`);
  return data;
}
// Serialisiert Read-Modify-Write pro Datei und tauscht atomar (tmp+rename) aus:
// parallele Uploads verlieren sich nicht gegenseitig, ein Crash mitten im Write
// hinterlässt keine halbe Datei.
const writeQueues = new Map();
async function updateJson(file, mutate) {
  const job = (writeQueues.get(file) || Promise.resolve()).then(async () => {
    const next = mutate(await readJson(file));
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(next, null, 2));
    await fs.rename(tmp, file);
    return next;
  });
  writeQueues.set(file, job.catch(() => {})); // Fehler gehen an den Caller, die Queue läuft weiter
  return job;
}
const readLibrary = () => readJson(LIBRARY_FILE);

// Dateityp ausschließlich über Magic Bytes – kein Vertrauen in Client-Mimes.
// SVG ist bewusst nicht erlaubt, weil eingebettete Skripte im App-Origin liefen.
function guessExt(buf) {
  if (buf.length > 3 && buf[0] === 0x89 && buf[1] === 0x50) return 'png';
  if (buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf.length > 3 && buf.toString('latin1', 0, 3) === 'GIF') return 'gif';
  if (buf.length > 11 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

// ---------- Request-Body ----------
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ---------- Accounts (E-Mail + Passwort, keine Verifizierung) ----------
// Passwort wird mit scrypt (stdlib) gehasht; Session = Token im HttpOnly-Cookie.
// shortcut: Sessions nur im Memory – nach Server-Neustart einmal neu einloggen.
const sessions = new Map(); // token -> { userId, expires }
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const scryptAsync = (pw, salt, len = 32) => new Promise((resolve, reject) => {
  crypto.scrypt(pw, salt, len, (err, key) => (err ? reject(err) : resolve(key)));
});
async function hashPassword(pw, salt) { return (await scryptAsync(pw, salt)).toString('hex'); }
async function verifyPassword(pw, stored) {
  const [scheme, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const b = await scryptAsync(pw, salt, 32);
  const a = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function cookieToken(req) {
  const m = String(req.headers.cookie || '').match(/(?:^|;\s*)mm_sid=([0-9a-f]{48})/);
  return m ? m[1] : null;
}
// Anonyme Uploads gehören dem Browser, der sie hochgeladen hat – ohne Konto.
function cookieAnon(req) {
  const m = String(req.headers.cookie || '').match(/(?:^|;\s*)mm_anon=([0-9a-f]{32})/);
  return m ? m[1] : null;
}
function anonCookie(req, token) {
  const secure = req.socket?.encrypted || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `mm_anon=${token}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`;
}
async function currentUser(req) {
  const token = cookieToken(req);
  const session = token && sessions.get(token);
  if (!session) return null;
  if (session.expires < Date.now()) { sessions.delete(token); return null; }
  return (await readJson(USERS_FILE)).find((u) => u.id === session.userId) || null;
}
const publicUser = (u) => ({ id: u.id, email: u.email });
function startSession(req, res, user) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { userId: user.id, expires: Date.now() + SESSION_TTL_MS });
  const secure = req.socket?.encrypted || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `mm_sid=${token}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax${secure}`;
}

async function readAuthBody(req) {
  return JSON.parse((await readBody(req, MAX_JSON_BODY)).toString('utf8'));
}

async function handleRegister(req, res) {
  let body;
  try { body = await readAuthBody(req); } catch { return json(res, 400, { error: 'invalid json' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { error: 'invalid body' });
  const email = String(body.email || '').trim().toLowerCase().slice(0, 120);
  const pw = String(body.password || '');
  if (!EMAIL_RE.test(email)) return json(res, 400, { error: 'invalid email' });
  if (pw.length < 8) return json(res, 400, { error: 'password too short (min. 8 characters)' });
  const salt = crypto.randomBytes(16).toString('hex');
  const user = { id: crypto.randomUUID(), email, pw: `scrypt$${salt}$${await hashPassword(pw, salt)}`, createdAt: Date.now() };
  let inserted = false;
  await updateJson(USERS_FILE, (list) => {
    if (list.some((u) => u.email === email)) return list;
    list.push(user);
    inserted = true;
    return list;
  });
  if (!inserted) return json(res, 409, { error: 'email already registered' });
  return json(res, 200, { user: publicUser(user) }, { 'Set-Cookie': startSession(req, res, user) });
}

async function handleLogin(req, res) {
  let body;
  try { body = await readAuthBody(req); } catch { return json(res, 400, { error: 'invalid json' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { error: 'invalid body' });
  const email = String(body.email || '').trim().toLowerCase().slice(0, 120);
  const pw = String(body.password || '');
  const user = (await readJson(USERS_FILE)).find((u) => u.email === email);
  if (!user) {
    await scryptAsync(pw, 'no-such-user', 32).catch(() => {}); // gleiche Kosten wie ein echter Login
    return json(res, 401, { error: 'wrong email or password' });
  }
  if (!(await verifyPassword(pw, user.pw))) return json(res, 401, { error: 'wrong email or password' });
  return json(res, 200, { user: publicUser(user) }, { 'Set-Cookie': startSession(req, res, user) });
}

async function handleLogout(req, res) {
  const token = cookieToken(req);
  if (token) sessions.delete(token);
  return json(res, 200, { ok: true }, { 'Set-Cookie': 'mm_sid=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax' });
}

async function handleMe(req, res) {
  const user = await currentUser(req);
  if (!user) return json(res, 401, { error: 'not signed in' });
  const used = (await readLibrary()).reduce((s, x) => s + (x.owner === user.id ? (x.size || 0) : 0), 0);
  return json(res, 200, { user: publicUser(user), used, quota: USER_QUOTA_BYTES });
}

// Voting: ein Vote pro Account pro Entry – wiederholtes Treffen hebt ihn auf.
async function handleVote(req, res) {
  let body;
  try { body = await readAuthBody(req); } catch { return json(res, 400, { error: 'invalid json' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { error: 'invalid body' });
  const user = await currentUser(req);
  if (!user) return json(res, 401, { error: 'not signed in' });
  const id = String(body.id || '');
  // Toggle innerhalb der seriellen Mutation, sonst gehen parallele Votes verloren.
  let result = null;
  await updateJson(LIBRARY_FILE, (fresh) => {
    const e = fresh.find((x) => x.id === id);
    if (!e) return fresh;
    if (e.owner && e.owner !== user.id && !e.shared) return fresh; // private Einträge nicht fremd voten
    const votes = e.votes || [];
    e.votes = votes.includes(user.id) ? votes.filter((x) => x !== user.id) : [...votes, user.id];
    result = { votes: e.votes.length };
    return fresh;
  });
  if (!result) return json(res, 404, { error: 'not found' });
  return json(res, 200, { ok: true, id, ...result });
}

// ---------- API ----------
async function handleUpload(req, res) {
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > MAX_BODY_BYTES) return json(res, 413, { error: 'file too large' });
  const user = await currentUser(req);
  let anon = cookieAnon(req);
  let anonHeader = null;
  if (!user && !anon) {
    anon = crypto.randomBytes(16).toString('hex');
    anonHeader = anonCookie(req, anon);
  }
  const raw = await readBody(req, MAX_BODY_BYTES).catch((e) => e);
  if (raw instanceof Error) {
    if (raw.message === 'body too large') return json(res, 413, { error: 'file too large' });
    return json(res, 400, { error: 'invalid body' });
  }
  let body;
  try { body = JSON.parse(raw.toString('utf8')); } catch { return json(res, 400, { error: 'invalid json' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { error: 'invalid body' });
  const id = String(body.id || '');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id)) return json(res, 400, { error: 'bad id' });
  const name = String(body.name || id).slice(0, 80);
  if (typeof body.data !== 'string' || !body.data) return json(res, 400, { error: 'missing data (base64)' });
  const buf = Buffer.from(body.data, 'base64');
  if (!buf.length) return json(res, 400, { error: 'invalid image data' });
  if (buf.length > MAX_UPLOAD_BYTES) return json(res, 413, { error: 'file too large' });

  const lib0 = await readLibrary();
  const existing = lib0.find((x) => x.id === id);
  if (existing && !existing.owner) return json(res, 403, { error: 'shared entries are read-only' });
  if (existing && !user) return json(res, 403, { error: 'sign in to change this entry' });
  if (existing?.owner && existing.owner !== user?.id) return json(res, 403, { error: 'entry belongs to another account' });
  // Neu oder eigener Überschreib zählt zur Account-Quota; anonyme Uploads zur gemeinsamen Quota.
  const willOwn = !!user && (!existing || existing.owner === user.id);
  if (willOwn) {
    const used = lib0.reduce((s, x) => s + (x.owner === user.id ? (x.size || 0) : 0), 0);
    const replace = existing?.owner === user.id ? (existing.size || 0) : 0;
    if (used - replace + buf.length > USER_QUOTA_BYTES) return json(res, 413, { error: `quota exceeded (${Math.round(USER_QUOTA_BYTES / 1048576)} MB)` });
  } else {
    const used = lib0.reduce((s, x) => s + (!x.owner ? (x.size || 0) : 0), 0);
    if (used + buf.length > ANON_QUOTA_BYTES) return json(res, 413, { error: `shared quota exceeded (${Math.round(ANON_QUOTA_BYTES / 1048576)} MB)` });
  }

  const ext = guessExt(buf);
  if (!ext) return json(res, 400, { error: 'unsupported image type' });
  // Der servte Type kommt ausschließlich aus unserer eigenen Map.
  const safeMime = MIME['.' + ext] || 'application/octet-stream';
  const file = path.join(UPLOADS_DIR, `${id}.${ext}`);
  const tmp = `${file}.tmp`;
  try {
    await fs.writeFile(tmp, buf);
    await fs.rename(tmp, file);
  } catch (e) {
    await fs.unlink(tmp).catch(() => {});
    throw e;
  }
  // Alte Dateien derselben ID mit anderer Endung (z. B. PNG → JPG) aufräumen.
  for (const f of await fs.readdir(UPLOADS_DIR).catch(() => [])) {
    if (f.startsWith(`${id}.`) && f !== `${id}.${ext}`) await fs.unlink(path.join(UPLOADS_DIR, f)).catch(() => {});
  }

  const shared = body.shared === true;
  const entry = { id, name, mime: safeMime, ext, size: buf.length, createdAt: Date.now(), owner: willOwn ? user.id : (existing?.owner || null), anonOwner: willOwn ? null : (existing?.anonOwner || anon), shared: shared || !!existing?.shared, votes: existing?.votes || [] };
  await updateJson(LIBRARY_FILE, (lib) => {
    const i = lib.findIndex((x) => x.id === id);
    if (i >= 0) lib[i] = { ...lib[i], ...entry, createdAt: lib[i].createdAt };
    else lib.push(entry);
    return lib;
  });
  return json(res, 200, { ok: true, id }, anonHeader ? { 'Set-Cookie': anonHeader } : {});
}

async function handleDelete(req, res, id) {
  const lib = await readLibrary();
  const entry = lib.find((x) => x.id === id);
  if (!entry) return json(res, 404, { error: 'not found' });
  if (entry.owner) {
    const user = await currentUser(req);
    if (!user || entry.owner !== user.id) return json(res, 403, { error: 'entry belongs to another account' });
  } else if (entry.anonOwner) {
    const anon = cookieAnon(req);
    if (!anon || anon !== entry.anonOwner) return json(res, 403, { error: 'not your upload' });
  }
  // Alle Dateien mit dieser ID entfernen – auch Reste einer früheren Endung.
  for (const f of await fs.readdir(UPLOADS_DIR).catch(() => [])) {
    if (f.startsWith(`${id}.`)) await fs.unlink(path.join(UPLOADS_DIR, f)).catch(() => {});
  }
  await updateJson(LIBRARY_FILE, (fresh) => fresh.filter((x) => x.id !== id));
  return json(res, 200, { ok: true });
}

async function serveUpload(id, req, res) {
  const lib = await readLibrary();
  const entry = lib.find((x) => x.id === id);
  if (!entry) return notFound(res);
  // Private Einträge sind für angemeldete LAN-Spieler erreichbar, aber nicht
  // für anonyme Besucher und nicht über die öffentliche Bibliothek auffindbar.
  if (entry.owner && !entry.shared && !(await currentUser(req))) return json(res, 401, { error: 'not signed in' });
  const file = path.join(UPLOADS_DIR, `${entry.id}.${entry.ext}`);
  const ext = path.extname(file).toLowerCase();
  const isSvg = ext === '.svg';
  const headers = {
    ...SECURITY_HEADERS,
    'Content-Type': isSvg ? 'application/octet-stream' : (IMAGE_MIMES.has(entry.mime) ? entry.mime : mimeOf(file)),
    'Cache-Control': entry.owner && !entry.shared ? 'private, no-store' : 'public, max-age=3600',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  };
  if (isSvg) headers['Content-Disposition'] = `attachment; filename="${entry.id}.svg"`;
  if (req.method === 'HEAD') {
    const st = await fs.stat(file).catch(() => null);
    if (!st) return notFound(res);
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    return res.end();
  }
  const body = await fs.readFile(file).catch(() => null);
  if (!body) return notFound(res);
  res.writeHead(200, { ...headers, 'Content-Length': body.length });
  res.end(body);
}

// ---------- Statische Dateien ----------
async function serveStatic(pathname, req, res) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return notFound(res); }
  let rel = path.normalize(decoded).replace(/^([/\\])+/, '');
  if (rel === '') rel = 'index.html';
  const posixRel = rel.split(path.sep).join('/');
  if (posixRel.split('/').some((seg) => seg.startsWith('.'))) return notFound(res);
  if (!STATIC_FILES.has(posixRel) && !STATIC_DIRS.some((dir) => posixRel.startsWith(dir))) return notFound(res);
  const full = path.join(ROOT, rel);
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return notFound(res);

  let target = full;
  let stat = await fs.stat(target).catch(() => null);
  if (stat?.isDirectory()) { target = path.join(full, 'index.html'); stat = await fs.stat(target).catch(() => null); }
  if (!stat?.isFile()) return notFound(res);

  const etag = `"${stat.size.toString(16)}-${Math.round(stat.mtimeMs).toString(16)}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ...SECURITY_HEADERS, 'ETag': etag, 'Cache-Control': 'no-cache' });
    return res.end();
  }
  const headers = {
    ...SECURITY_HEADERS,
    'Content-Type': mimeOf(target),
    'Cache-Control': 'no-cache',
    'ETag': etag,
    'Last-Modified': stat.mtime.toUTCString(),
  };
  if (req.method === 'HEAD') {
    res.writeHead(200, { ...headers, 'Content-Length': stat.size });
    return res.end();
  }
  const body = await fs.readFile(target);
  res.writeHead(200, { ...headers, 'Content-Length': body.length });
  res.end(body);
}

// ---------- HTTP-Router ----------
async function handleHttp(req, res) {
  let u;
  try { u = new URL(req.url, `http://${req.headers.host || 'localhost'}`); } catch { return json(res, 400, { error: 'bad url' }); }
  const p = u.pathname;
  try {
    if (p === '/health') {
      if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' });
      return json(res, 200, { ok: true, service: 'mememanufaktur' });
    }
    if (p === '/api/library' && req.method === 'GET') {
      // Gelistet werden nur geteilte Entries + die eigenen (Private bleibt privat;
      // /uploads/ liefert eigene Bilder für die LAN-Runde weiterhin per ID.)
      const user = await currentUser(req);
      const anon = cookieAnon(req);
      const lib = await readLibrary();
      return json(res, 200, lib
        .filter((x) => x.shared || !x.owner || x.owner === user?.id)
        .map(({ owner, anonOwner, ...x }) => ({
          ...x,
          votes: x.votes || [],
          own: (!!user && owner === user.id) || (!owner && !!anonOwner && anonOwner === anon),
          public: !owner || !!x.shared,
        }))
        .sort((a, b) => b.votes.length - a.votes.length));
    }
    if (p === '/api/vote' && req.method === 'POST') return await handleVote(req, res);
    if (p === '/api/lobbies' && req.method === 'GET') {
      return json(res, 200, [...lobbyMeta.values()]
        .filter((m) => m.public && !m.started && rooms.get(m.code)?.size)
        .map((m) => ({ code: m.code, name: m.name, players: rooms.get(m.code).size, max: m.max })));
    }
    if (p === '/api/upload' && req.method === 'POST') return await handleUpload(req, res);
    if (p === '/api/register' && req.method === 'POST') return await handleRegister(req, res);
    if (p === '/api/login' && req.method === 'POST') return await handleLogin(req, res);
    if (p === '/api/logout' && req.method === 'POST') return await handleLogout(req, res);
    if (p === '/api/me' && req.method === 'GET') return await handleMe(req, res);
    const delMatch = p.match(/^\/api\/library\/([^/]+)$/);
    if (delMatch && req.method === 'DELETE') return await handleDelete(req, res, delMatch[1]);
    if (p.startsWith('/uploads/') && (req.method === 'GET' || req.method === 'HEAD')) return await serveUpload(p.slice('/uploads/'.length), req, res);
    if (req.method === 'GET' || req.method === 'HEAD') return await serveStatic(p, req, res);
    return json(res, 405, { error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) return json(res, 500, { error: 'internal error' });
    res.end();
  }
}

// ============ WebSocket (manuell, ohne Dependencies) ============
const server = http.createServer(handleHttp);
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const rooms = new Map(); // Raumcode -> Set<sock>
const lobbyMeta = new Map(); // Raumcode -> { code, name, public, hostId, max, started, known }

function encodeFrame(str) {
  const payload = Buffer.from(String(str), 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) header = Buffer.from([0x81, len]);
  else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

/** Raum-weiter Relay: Text an alle Socks im Raum (inkl. Absender). */
function broadcastText(code, text) {
  const room = rooms.get(code);
  if (!room) return;
  const frame = encodeFrame(text);
  for (const s of room) { try { s.ws.write(frame); } catch {} }
}
function broadcastJson(code, obj) { broadcastText(code, JSON.stringify(obj)); }

const PLAYER_TYPES = new Set(['submit', 'vote', 'ownpack']);
const CONTROL_TYPES = new Set(['start', 'turn', 'voting-start', 'result', 'final', 'abort', 'maxplayers']);
const SERVER_TYPES = new Set(['roster', 'joined', 'left', 'rejected']);

function relayMessage(sock, payload) {
  let msg;
  try { msg = JSON.parse(payload.toString('utf8')); } catch { return; } // nur valide JSON weiterschicken
  if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
  // Servergesteuerte Events dürfen Clients nicht selbst erzeugen.
  if (SERVER_TYPES.has(msg.type)) return;
  // Spieleraktionen immer an die echte Verbindung binden (kein selfId-Spoofing).
  if (PLAYER_TYPES.has(msg.type)) msg.selfId = sock.selfId;
  const meta = lobbyMeta.get(sock.code);
  const room = rooms.get(sock.code);
  // Nur der Host darf den Spielablauf steuern (stabile ID, auch nach Reconnect).
  if (CONTROL_TYPES.has(msg.type)) {
    if (!meta || !room || meta.hostId !== sock.selfId) return;
  }
  if (msg.type === 'maxplayers') {
    if (!meta || !room) return;
    const max = Math.max(2, Math.min(30, Number(msg.max) || 12), room.size);
    meta.max = max;
    broadcastJson(sock.code, { type: 'maxplayers', max });
    return;
  }
  if (msg.type === 'start') {
    if (!meta || meta.started) return;
    msg.hostId = sock.selfId;
    // Sobald eine Partie startet, verschwindet die Lobby aus der offenen Liste und
    // neue Spieler:innen werden abgewiesen – die Runde läuft bereits.
    meta.public = false;
    meta.started = true;
  }
  // Nach dem Finale ist die Partie vorbei: ein Rematch darf wieder starten.
  if (msg.type === 'final' && meta) meta.started = false;
  if (msg.type === 'abort' && meta) meta.started = false;
  // Turn-Nachrichten betreffen genau eine Person – nicht an den ganzen Raum senden.
  if (msg.type === 'turn') {
    const target = room && [...room].find((s) => s.selfId === msg.playerId);
    if (target) { try { target.ws.write(encodeFrame(JSON.stringify(msg))); } catch {} }
    return;
  }
  broadcastText(sock.code, JSON.stringify(msg));
}

function handleFrame(sock, fin, opcode, payload) {
  switch (opcode) {
    case 0x0: { // Fortsetzung eines fragmentierten Frames
      if (!sock.frag) return;
      if (sock.frag.size + payload.length > MAX_WS_BYTES) { sock.dead = true; return; }
      sock.frag.parts.push(payload);
      sock.frag.size += payload.length;
      if (fin) {
        const data = Buffer.concat(sock.frag.parts);
        sock.frag = null;
        relayMessage(sock, data);
      }
      return;
    }
    case 0x1: // Text
      if (fin) {
        if (payload.length > MAX_WS_BYTES) return;
        relayMessage(sock, payload);
      } else {
        if (payload.length > MAX_WS_BYTES) { sock.dead = true; return; }
        sock.frag = { parts: [payload], size: payload.length };
      }
      return;
    case 0x8: // Close
      try { sock.ws.write(Buffer.from([0x88, 0])); } catch {}
      sock.ws.end();
      return;
    case 0x9: // Ping → Pong
      if (payload.length > 125) { sock.dead = true; return; }
      try { sock.ws.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); } catch {}
      return;
    default:
  }
}

function pumpFrames(sock) {
  for (let guard = 0; guard < 1000; guard++) {
    const buf = sock.buf;
    if (buf.length < 2) return;
    const b0 = buf[0], b1 = buf[1];
    const fin = (b0 & 0x80) !== 0;
    const opcode = b0 & 0x0f;
    const hasMask = (b1 & 0x80) !== 0;
    if (!hasMask) { sock.dead = true; return; } // Client-Frames müssen maskiert sein
    let len = b1 & 0x7f;
    let off = 2;
    if (len === 126) {
      if (buf.length < 4) return;
      len = buf.readUInt16BE(2); off = 4;
      if (len > MAX_WS_BYTES) { sock.dead = true; return; }
    } else if (len === 127) {
      if (buf.length < 10) return;
      const big = buf.readBigUInt64BE(2);
      if (big > BigInt(MAX_WS_BYTES)) { sock.dead = true; return; }
      len = Number(big); off = 10;
    }
    if (opcode >= 0x8 && (len > 125 || !fin)) { sock.dead = true; return; }
    const maskLen = hasMask ? 4 : 0;
    if (buf.length < off + maskLen + len) return;
    const mask = hasMask ? buf.subarray(off, off + 4) : null;
    let payload = buf.subarray(off + maskLen, off + maskLen + len);
    if (mask) {
      const out = Buffer.alloc(len);
      for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i % 4];
      payload = out;
    }
    sock.buf = buf.subarray(off + maskLen + len);
    handleFrame(sock, fin, opcode, payload);
    if (sock.dead) return;
  }
}

function leaveRoom(sock) {
  if (sock.gone) return;
  sock.gone = true;
  const room = rooms.get(sock.code);
  if (!room) return;
  room.delete(sock);
  const meta = lobbyMeta.get(sock.code);
  if (meta) {
    // In der Lobby übernimmt die nächste Person; während einer laufenden Partie
    // bleibt die Host-ID stabil, damit ein Reconnect die Spielleitung zurückbekommt.
    if (meta.hostId === sock.selfId && !meta.started) {
      meta.hostId = [...room][0]?.selfId || null;
    }
  }
  broadcastJson(sock.code, { type: 'left', selfId: sock.selfId, hostId: meta?.hostId || null, max: meta?.max || 12 });
  if (!room.size) { rooms.delete(sock.code); lobbyMeta.delete(sock.code); }
}

server.on('upgrade', (req, socket) => {
  let u;
  try { u = new URL(req.url, 'http://localhost'); } catch { socket.destroy(); return; }
  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) { socket.destroy(); return; }
    } catch { socket.destroy(); return; }
  }
  if (u.pathname !== '/ws') {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.on('error', () => {});
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n` +
    '\r\n',
  );

  const code = String(u.searchParams.get('room') || '').toUpperCase().slice(0, 8) || 'ROOM';
  const baseName = String(u.searchParams.get('name') || 'Gast').slice(0, 40);
  const selfId = String(u.searchParams.get('self') || crypto.randomUUID()).slice(0, 48);
  const token = String(u.searchParams.get('token') || '').slice(0, 64);

  let room = rooms.get(code) || new Set();
  rooms.set(code, room);
  const isCreate = u.searchParams.get('create') === '1';
  let meta = lobbyMeta.get(code);
  if (!meta) {
    if (!isCreate) {
      // Ein Tippfehler im Code soll keine Geister-Lobby erzeugen.
      try { socket.end(encodeFrame(JSON.stringify({ type: 'rejected', reason: 'notfound' }))); } catch { socket.destroy(); }
      rooms.delete(code);
      return;
    }
    // Die erste Verbindung definiert den Raum (Name, Sichtbarkeit, Host, Limit).
    meta = {
      code,
      name: String(u.searchParams.get('lobby') || '').slice(0, 40) || null,
      public: u.searchParams.get('pub') === '1',
      hostId: selfId,
      max: Math.max(2, Math.min(30, Number(u.searchParams.get('max')) || 12)),
      started: false,
      known: new Map(), // selfId -> Reconnect-Token (nicht an andere Clients geleakt)
    };
    lobbyMeta.set(code, meta);
  } else if (isCreate && meta.hostId !== selfId) {
    // Zufällig denselben Code erwischt (oder fremde Lobby): nicht kapern.
    try { socket.end(encodeFrame(JSON.stringify({ type: 'rejected', reason: 'taken' }))); } catch { socket.destroy(); }
    return;
  }
  const knownToken = meta.known.get(selfId);
  if (knownToken !== undefined && knownToken !== token) {
    try { socket.end(encodeFrame(JSON.stringify({ type: 'rejected', reason: 'conflict' }))); } catch { socket.destroy(); }
    return;
  }
  // Namen im Raum eindeutig halten; ein Reconnect behält seinen alten Namen.
  const previous = [...room].find((s) => s.selfId === selfId);
  let name = previous?.name || baseName;
  if (!previous && [...room].some((s) => s.name === name)) {
    let i = 2;
    while ([...room].some((s) => s.name === `${baseName} (${i})`)) i++;
    name = `${baseName} (${i})`.slice(0, 40);
  }

  const known = meta.known.has(selfId);
  if (meta.started && !known) {
    try { socket.end(encodeFrame(JSON.stringify({ type: 'rejected', reason: 'started' }))); } catch { socket.destroy(); }
    return;
  }
  if (!known && room.size >= meta.max) {
    try { socket.end(encodeFrame(JSON.stringify({ type: 'rejected', reason: 'full' }))); } catch { socket.destroy(); }
    return;
  }

  // Reconnect unter derselben selfId ersetzt die alte Verbindung still – sonst
  // bekämen die anderen ein „left“, obwohl die Person nur kurz offline war.
  for (const old of [...room]) {
    if (old.selfId !== selfId) continue;
    old.gone = true;
    room.delete(old);
    try { old.ws.destroy(); } catch {}
  }

  const sock = { ws: socket, code, selfId, name, buf: Buffer.alloc(0), frag: null, lastSeen: Date.now(), dead: false, gone: false };
  meta.known.set(selfId, token);
  if (meta.hostId === selfId && room.size) {
    // Host an den Anfang der Beitrittsreihenfolge, damit Roster-Clients ihn zuerst sehen.
    room = new Set([sock, ...room]);
    rooms.set(code, room);
  } else {
    room.add(sock);
  }

  // Neue Verbindung bekommt zuerst den kompletten Raum-Bestand (Reihenfolge = Beitrittsreihenfolge)
  const roster = [...room].map((s) => ({ selfId: s.selfId, name: s.name }));
  try { sock.ws.write(encodeFrame(JSON.stringify({ type: 'roster', players: roster, hostId: meta.hostId, max: meta.max }))); } catch {}
  broadcastJson(code, { type: 'joined', selfId, name, hostId: meta.hostId, max: meta.max });

  socket.setNoDelay(true);
  socket.setTimeout(0);
  socket.on('data', (chunk) => {
    sock.lastSeen = Date.now();
    sock.buf = sock.buf.length ? Buffer.concat([sock.buf, chunk]) : chunk;
    pumpFrames(sock);
    if (sock.dead) { try { socket.write(Buffer.from([0x88, 0])); } catch {} socket.end(); }
  });
  socket.on('end', () => { try { socket.end(); } catch {} });
  socket.on('close', () => leaveRoom(sock));
  socket.on('error', () => {});
});

// Heartbeat: tote Verbindungen räumen, NATs alive halten
// (unref: hält den Prozess beim Importen z. B. aus Tests nicht am Leben)
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) if (session.expires < now) sessions.delete(token);
  for (const room of rooms.values()) {
    for (const s of room) {
      if (now - s.lastSeen > 75000) { try { s.ws.destroy(); } catch {} continue; }
      try { s.ws.write(Buffer.from([0x89, 0])); } catch {} // Ping
    }
  }
}, 25000).unref();

export { server };

// Nur bei direktem Start lauschen (node server.js), beim Import in Tests nicht
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE' || e.code === 'EACCES') {
      console.error(`❌ Port ${PORT} ist belegt oder gesperrt. Starte mit einem anderen Port, z. B.:`);
      console.error(`   PORT=8081 node server.js`);
    } else {
      console.error(e);
    }
    process.exit(1);
  });
  server.listen(PORT, HOST, () => {
    const lan = Object.values(os.networkInterfaces()).flat()
      .filter((n) => n && n.family === 'IPv4' && !n.internal)
      .map((n) => `http://${n.address}:${PORT}`);
    console.log(`🎨 MemeManufaktur läuft: http://localhost:${PORT}`);
    if (lan.length) console.log(`   Im LAN: ${lan.join('  ·  ')}`);
    console.log(`   Uploads landen in ${UPLOADS_DIR}`);
  });
}
