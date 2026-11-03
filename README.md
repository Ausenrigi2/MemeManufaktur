# 🎨 MemeMacher

A self-hostable **meme party game** — your instance, your design, your data:

- 🖌️ **Meme Studio** — drag & scale text, outline, highlight, image filters,
  PNG/JPEG export and clipboard copy. Everything renders locally in your browser.
- 📦 **Your own meme packs** — upload pictures, organize them into packs, use
  them in the studio and in the game. Stored in your browser (IndexedDB) or,
  when the server is running, shared with everyone on the network.
- 🎉 **Party mode** — hot-seat on one device or a real **LAN match with an
  invite code**: rounds, themes, voting and a meme-king coronation.
- 👤 **Accounts (optional)** — sign up with email + password, no verification.
  Each account gets its own server storage up to **250 MB**; in a LAN match,
  the host can allow players to attach their own packs.
- 🗳️ **Community voting** — upvote memes in the shared library from your
  account (one vote per account, toggleable); the list is sorted by votes.
- 🌍 **English first**, switchable to German in the UI.

No build step, zero dependencies: vanilla ES modules + a zero-dependency
Node server (≥ 18) that adds static hosting, a shared upload library and a
hand-rolled WebSocket relay for LAN games.

| |
| --- |
| ![MemeMacher home page with live meme preview](assets/screenshot.png) |

## Quickstart

### 1) Full mode (recommended): Node server

```bash
node server.js
# → http://localhost:8080
```

Friends on the same network open `http://<your-ip>:8080` — the shared picture
library and LAN matches are now active. Or via npm:

```bash
npm start
```

### 2) Docker

```bash
docker compose up -d --build
# → http://localhost:8080
```

Uploads persist in the named volume `meme-data` (mounted at `/app/data`).

### 3) Static only (offline)

Any webserver works, e.g.:

```bash
python3 -m http.server 8080
```

Without the server you lose only the shared uploads and LAN mode — the app
detects this and shows an "Offline mode" badge.

## How a game runs

1. The host creates a room and gets a 4-character invite code.
2. Everyone joins from their browser with that code.
3. The host starts the rounds: each player writes a caption for their
   template — against the clock.
4. Everyone votes for the best memes, points flow, and after the final round
   a meme royalty is crowned. Confetti included.

The server only **relays messages**; all game logic runs client-side.

## Where do my pictures go?

| Mode | Storage |
| --- | --- |
| Local (browser) | IndexedDB — only you can see them |
| Shared (server) | `./data/uploads/` + index `./data/library.json` |
| With an account | Server storage, private to your account (up to 250 MB per account); accounts need the Node server |

"A also save to server" ("Auch auf dem Server speichern") can be toggled per
upload on the Packs page. In LAN matches, the host can allow players to use
their own (private) packs.

## HTTP API & WebSocket

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/health` | GET | Liveness check |
| `/api/register` | POST | Create an account (JSON: `email`, `password`; no verification) |
| `/api/login`, `/api/logout` | POST | Session via `HttpOnly` cookie |
| `/api/me` | GET | Current user + storage usage |
| `/api/library` | GET | Shared templates + your own, sorted by votes (private entries only for their owner) |
| `/api/vote` | POST | Toggle your upvote on an entry (JSON: `id`; needs a session) |
| `/api/upload` | POST | Create/update a template (JSON: `id`, `name`, `mime`, `data` as base64) |
| `/api/library/:id` | DELETE | Remove a template (own entries only by their owner) |
| `/uploads/:id` | GET | Fetch an uploaded image |
| `/ws?room=CODE&name=NAME&self=ID` | WS | Game relay — join, roster, round state, votes |

Limits: 25 MB per uploaded image, 250 MB per account, 8 MB per WebSocket message.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8080` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `MEME_DATA_DIR` | `./data` | Data directory (uploads + library index) |
| `MEME_USER_QUOTA_BYTES` | `262144000` | Storage quota per account (250 MB) |

## Project structure

```
index.html          Entry point (also works fully static)
css/styles.css      Design system (comic/brutalist)
js/lib.js           i18n (EN/DE), utilities
js/packs.js         Pack API (IndexedDB) + server API client
js/editor.js        MemeCanvas render engine
js/ui-studio.js     Studio page
js/ui-packs.js      Packs page
js/net.js           WebSocket client (Room)
js/game.js          Party game: hot-seat + LAN
js/main.js          Router, nav/footer, home page, help
server.js           Zero-dep Node server (static, uploads, WS relay)
assets/templates/   Built-in SVG templates (the "Classics" pack)
assets/screenshot.png  Home page screenshot (used in this README)
test/smoke.mjs      API smoke tests (node:test)
data/uploads/       Shared images (created automatically)
```

## Testing

```bash
npm test
```

Runs the dependency-free smoke suite (`node --test`) against an isolated data
directory — covers health, static serving, upload round-trips, content-type
hygiene, deletion, accounts, private visibility, the storage quota and voting.

---

Your data stays where you host it.
