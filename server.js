// ============ MemeManufaktur – Zero-Dependency Node-Server ============
// Statische Dateien + Upload-API + WebSocket-Relay für LAN-Partien.
// Start: node server.js  (Port via PORT, Default 8080)

import http from 'node:http';
import fs from 'node:fs/promises';
import fssync from 'node:fs';
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
const MAX_JSON_BODY = 64 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_BODY_BYTES = Math.ceil(MAX_UPLOAD_BYTES * 4 / 3) + 1024 * 1024; // Base64-Puffer + JSON-Rahmen
const MAX_WS_BYTES = 8 * 1024 * 1024;      // 8 MB pro WS-Nachricht
// Client-Mimes, die beim Serven erlaubt sind – alles andere fällt auf den Dateityp zurück (XSS-Schutz)
const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']);

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
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

function mimeOf(file) { return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'; }

function json(res, status, obj, extraHeaders = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), ...extraHeaders });
  res.end(body);
}
function notFound(res) { json(res, 404, { error: 'not found' }); }

// ---------- JSON-Stores (data/) ----------
async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return []; }
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

function extForMime(mime) {
  switch ((mime || '').toLowerCase()) {
    case 'image/png': return 'png';
    case 'image/jpeg': return 'jpg';
    case 'image/gif': return 'gif';
    case 'image/webp': return 'webp';
    case 'image/svg+xml': return 'svg';
    default: return null;
  }
}
function guessExt(buf) {
  if (buf.length > 3 && buf[0] === 0x89 && buf[1] === 0x50) return 'png';
  if (buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf.length > 3 && buf.toString('latin1', 0, 3) === 'GIF') return 'gif';
  if (buf.length > 11 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.toString('latin1', 0, 64).includes('<svg')) return 'svg';
  return 'img';
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
const sessions = new Map(); // token -> userId

function hashPassword(pw, salt) { return crypto.scryptSync(pw, salt, 32).toString('hex'); }
function verifyPassword(pw, stored) {
  const [scheme, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt') return false;
  const b = crypto.scryptSync(pw, salt, 32);
  const a = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function cookieToken(req) {
  const m = String(req.headers.cookie || '').match(/(?:^|;\s*)mm_sid=([0-9a-f]{48})/);
  return m ? m[1] : null;
}
async function currentUser(req) {
  const token = cookieToken(req);
  const userId = token && sessions.get(token);
  if (!userId) return null;
  return (await readJson(USERS_FILE)).find((u) => u.id === userId) || null;
}
const publicUser = (u) => ({ id: u.id, email: u.email });
function startSession(res, user) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, user.id);
  return `mm_sid=${token}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`;
}

async function readAuthBody(req) {
  return JSON.parse((await readBody(req, MAX_JSON_BODY)).toString('utf8'));
}

async function handleRegister(req, res) {
  let body;
  try { body = await readAuthBody(req); } catch { return json(res, 400, { error: 'invalid json' }); }
  const email = String(body.email || '').trim().toLowerCase().slice(0, 120);
  const pw = String(body.password || '').slice(0, 200);
  if (!EMAIL_RE.test(email)) return json(res, 400, { error: 'invalid email' });
  if (pw.length < 8) return json(res, 400, { error: 'password too short (min. 8 characters)' });
  if ((await readJson(USERS_FILE)).some((u) => u.email === email)) return json(res, 409, { error: 'email already registered' });
  const salt = crypto.randomBytes(16).toString('hex');
  const user = { id: crypto.randomUUID(), email, pw: `scrypt$${salt}$${hashPassword(pw, salt)}`, createdAt: Date.now() };
  await updateJson(USERS_FILE, (list) => { if (!list.some((u) => u.email === email)) list.push(user); return list; });
  return json(res, 200, { user: publicUser(user) }, { 'Set-Cookie': startSession(res, user) });
}

async function handleLogin(req, res) {
  let body;
  try { body = await readAuthBody(req); } catch { return json(res, 400, { error: 'invalid json' }); }
  const email = String(body.email || '').trim().toLowerCase();
  const pw = String(body.password || '');
  const user = (await readJson(USERS_FILE)).find((u) => u.email === email);
  if (!user || !verifyPassword(pw, user.pw)) return json(res, 401, { error: 'wrong email or password' });
  return json(res, 200, { user: publicUser(user) }, { 'Set-Cookie': startSession(res, user) });
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
  const user = await currentUser(req);
  if (!user) return json(res, 401, { error: 'not signed in' });
  const id = String(body.id || '');
  const entry = (await readLibrary()).find((x) => x.id === id);
  if (!entry) return json(res, 404, { error: 'not found' });
  const votes = entry.votes || [];
  const next = votes.includes(user.id) ? votes.filter((x) => x !== user.id) : [...votes, user.id];
  await updateJson(LIBRARY_FILE, (fresh) => {
    const e = fresh.find((x) => x.id === id);
    if (e) e.votes = next;
    return fresh;
  });
  return json(res, 200, { ok: true, id, votes: next.length });
}

// ---------- API ----------
async function handleUpload(req, res) {
  const raw = await readBody(req, MAX_BODY_BYTES);
  let body;
  try { body = JSON.parse(raw.toString('utf8')); } catch { return json(res, 400, { error: 'invalid json' }); }
  const id = String(body.id || '');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id)) return json(res, 400, { error: 'bad id' });
  const name = String(body.name || id).slice(0, 80);
  const mime = String(body.mime || '').slice(0, 80);
  if (typeof body.data !== 'string' || !body.data) return json(res, 400, { error: 'missing data (base64)' });
  const buf = Buffer.from(body.data, 'base64');
  if (!buf.length || buf.length > MAX_UPLOAD_BYTES) return json(res, 413, { error: 'file too large' });

  const user = await currentUser(req);
  const lib0 = await readLibrary();
  const existing = lib0.find((x) => x.id === id);
  if (existing?.owner && existing.owner !== user?.id) return json(res, 403, { error: 'entry belongs to another account' });
  // Neu oder eigener Überschrieb zählt zur quota; geteilte Entries bleiben geteilt.
  const willOwn = user && (!existing || existing.owner === user.id);
  if (willOwn) {
    const used = lib0.reduce((s, x) => s + (x.owner === user.id ? (x.size || 0) : 0), 0);
    const replace = existing?.owner === user.id ? (existing.size || 0) : 0;
    if (used - replace + buf.length > USER_QUOTA_BYTES) return json(res, 413, { error: `quota exceeded (${Math.round(USER_QUOTA_BYTES / 1048576)} MB)` });
  }

  const ext = extForMime(mime) || guessExt(buf);
  // Client-Mime wird nur zur Extension-Wahl genutzt; der gespeicherte/servte Type kommt aus unserer eigenen Map.
  const safeMime = MIME['.' + ext] || 'application/octet-stream';
  const file = path.join(UPLOADS_DIR, `${id}.${ext}`);
  await fs.writeFile(file, buf);

  const entry = { id, name, mime: safeMime, ext, size: buf.length, createdAt: Date.now(), owner: willOwn ? user.id : (existing?.owner || null), votes: existing?.votes || [] };
  await updateJson(LIBRARY_FILE, (lib) => {
    const i = lib.findIndex((x) => x.id === id);
    if (i >= 0) lib[i] = { ...lib[i], ...entry, createdAt: lib[i].createdAt };
    else lib.push(entry);
    return lib;
  });
  return json(res, 200, { ok: true, id });
}

async function handleDelete(req, res, id) {
  const lib = await readLibrary();
  const entry = lib.find((x) => x.id === id);
  if (entry?.owner) {
    const user = await currentUser(req);
    if (!user || entry.owner !== user.id) return json(res, 403, { error: 'entry belongs to another account' });
  }
  const files = entry ? [path.join(UPLOADS_DIR, `${entry.id}.${entry.ext}`)] : [];
  if (!entry) {
    // Fallback: alle Dateien mit diesem Präfix entfernen
    const dir = await fs.readdir(UPLOADS_DIR).catch(() => []);
    for (const f of dir) if (f.startsWith(`${id}.`)) files.push(path.join(UPLOADS_DIR, f));
  }
  for (const f of files) await fs.unlink(f).catch(() => {});
  if (entry) await updateJson(LIBRARY_FILE, (fresh) => fresh.filter((x) => x.id !== id));
  return json(res, 200, { ok: true });
}

async function serveUpload(id, req, res) {
  let file = null;
  let mime = null;
  const lib = await readLibrary();
  const entry = lib.find((x) => x.id === id);
  if (entry) {
    // Private Entries dürfen geladen werden, wenn ein Konto angemeldet ist:
    // im Spiel sehen alle Spieler:innen die Memes der angebundenen eigenen Packs.
    if (entry.owner && !(await currentUser(req))) return json(res, 401, { error: 'not signed in' });
    file = path.join(UPLOADS_DIR, `${entry.id}.${entry.ext}`);
    mime = IMAGE_MIMES.has(entry.mime) ? entry.mime : null;
  }
  else {
    const dir = await fs.readdir(UPLOADS_DIR).catch(() => []);
    const f = dir.find((d) => d.startsWith(`${id}.`));
    if (!f) return notFound(res);
    file = path.join(UPLOADS_DIR, f);
  }
  const body = await fs.readFile(file).catch(() => null);
  if (!body) return notFound(res);
  res.writeHead(200, {
    'Content-Type': mime || mimeOf(file),
    'Content-Length': body.length,
    'Cache-Control': 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff', // Type wird nicht geratet
  });
  req.method === 'HEAD' ? res.end() : res.end(body);
}

// ---------- Statische Dateien ----------
async function serveStatic(pathname, req, res) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return notFound(res); }
  let rel = path.normalize(decoded).replace(/^([/\\])+/, '');
  if (rel === '') rel = 'index.html';
  const full = path.join(ROOT, rel);
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return notFound(res);

  let target = full;
  let stat = await fs.stat(target).catch(() => null);
  if (stat?.isDirectory()) { target = path.join(full, 'index.html'); stat = await fs.stat(target).catch(() => null); }
  if (!stat?.isFile()) return notFound(res);

  const body = await fs.readFile(target);
  res.writeHead(200, { 'Content-Type': mimeOf(target), 'Content-Length': body.length, 'Cache-Control': 'no-cache' });
  req.method === 'HEAD' ? res.end() : res.end(body);
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
      const lib = await readLibrary();
      return json(res, 200, lib
        .filter((x) => !x.owner || x.owner === user?.id)
        .map((x) => ({ ...x, votes: x.votes || [], own: !!(user && x.owner === user.id) }))
        .sort((a, b) => b.votes.length - a.votes.length));
    }
    if (p === '/api/vote' && req.method === 'POST') return await handleVote(req, res);
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
    if (!res.headersSent) return json(res, 500, { error: String(e?.message || e) });
    res.end();
  }
}

// ============ WebSocket (manuell, ohne Dependencies) ============
const server = http.createServer(handleHttp);
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const rooms = new Map(); // Raumcode -> Set<sock>

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

function relayMessage(sock, payload) {
  let text;
  try { text = payload.toString('utf8'); JSON.parse(text); } catch { return; } // nur valide JSON weiterschicken
  broadcastText(sock.code, text);
}

function handleFrame(sock, fin, opcode, payload) {
  switch (opcode) {
    case 0x0: { // Fortsetzung eines fragmentierten Frames
      if (!sock.frag) return;
      sock.frag.parts.push(payload);
      if (fin) {
        const data = Buffer.concat(sock.frag.parts);
        sock.frag = null;
        relayMessage(sock, data);
      }
      return;
    }
    case 0x1: // Text
      if (fin) relayMessage(sock, payload);
      else sock.frag = { parts: [payload] };
      return;
    case 0x8: // Close
      try { sock.ws.write(Buffer.from([0x88, 0])); } catch {}
      sock.ws.end();
      return;
    case 0x9: // Ping → Pong
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
    let len = b1 & 0x7f;
    let off = 2;
    if (len === 126) {
      if (buf.length < 4) return;
      len = buf.readUInt16BE(2); off = 4;
    } else if (len === 127) {
      if (buf.length < 10) return;
      const big = buf.readBigUInt64BE(2);
      if (big > BigInt(MAX_WS_BYTES)) { sock.dead = true; return; }
      len = Number(big); off = 10;
    }
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
  broadcastJson(sock.code, { type: 'left', selfId: sock.selfId });
  if (!room.size) rooms.delete(sock.code);
}

server.on('upgrade', (req, socket) => {
  let u;
  try { u = new URL(req.url, 'http://localhost'); } catch { socket.destroy(); return; }
  if (u.pathname !== '/ws') {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n` +
    '\r\n',
  );

  const code = String(u.searchParams.get('room') || '').toUpperCase().slice(0, 8) || 'ROOM';
  const name = String(u.searchParams.get('name') || 'Gast').slice(0, 40);
  const selfId = String(u.searchParams.get('self') || crypto.randomUUID()).slice(0, 48);

  const sock = { ws: socket, code, selfId, name, buf: Buffer.alloc(0), frag: null, lastSeen: Date.now(), dead: false, gone: false };
  let room = rooms.get(code) || new Set();
  rooms.set(code, room);
  room.add(sock);

  // Neue Verbindung bekommt zuerst den kompletten Raum-Bestand (Reihenfolge = Beitrittsreihenfolge)
  const roster = [...room].map((s) => ({ selfId: s.selfId, name: s.name }));
  try { sock.ws.write(encodeFrame(JSON.stringify({ type: 'roster', players: roster }))); } catch {}
  broadcastJson(code, { type: 'joined', selfId, name });

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
  server.listen(PORT, HOST, () => {
    console.log(`🎨 MemeManufaktur läuft: http://localhost:${PORT}  (LAN: 0.0.0.0)`);
    console.log(`   Uploads landen in ${UPLOADS_DIR}`);
  });
}
