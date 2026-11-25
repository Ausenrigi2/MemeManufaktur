# 🎨 MemeMacher

A self-hostable **meme party game** — your instance, your design, your data:

- 🖌️ **Meme Studio** — visual template gallery, drag & scale text, outline,
  highlight, image filters, keyboard shortcuts, PNG/JPEG export and clipboard
  copy. Everything renders locally in your browser. Animated GIFs stay animated
  in editor and voting previews; exports are flattened stills.
- ☁️ **Server template library** — no bundled meme images. Upload your own
  pictures directly to the server; they immediately show up in the studio and
  in every game on the network. Uploads can be managed or deleted with an
  account.
- 📦 **Your own meme packs** — upload pictures locally, organize them into
  packs, search them and use them in the studio and game. In a LAN match the
  host can allow players to attach their own packs.
- 🎉 **Party mode** — quick play or a private lobby, everyone joins in their own
  browser: 1–8 rounds, themes, captions, voting and a meme-king coronation.
  Public lobbies can be joined from an open list; private ones work by code
  only. Invite code and link are one click away. Every round ends in a review
  with per-meme downloads; the finale packs all memes into one ZIP.
- 👤 **Accounts (optional)** — sign up with email + password, no verification.
  Each account gets its own server storage up to **250 MB**; in a LAN match,
  the host can allow players to attach their own packs.
- 🗳️ **Community voting** — upvote memes in the shared library from your
  account (one vote per account, toggleable); the list is sorted by votes.
- 🌍 **Bilingual DE/EN**, German by default, with localized page titles.
- 📱 **Installable** — web app manifest and icons; works as a home-screen app
  when the browser supports it.

No build step, zero dependencies: vanilla ES modules + a zero-dependency
Node server (≥ 18) that adds static hosting, a shared upload library and a
hand-rolled WebSocket relay for LAN games.

| |
| --- |
| ![MemeMacher – lobby screen](assets/screenshot.png) |

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
# Data lives outside the checkout by default; create it once for UID 1000.
mkdir -p /srv/mememanufaktur/data
chown -R 1000:1000 /srv/mememanufaktur/data

docker compose up -d --build
# → http://localhost:8080

# other host port / data path:
MEME_PORT=8090 MEME_DATA_PATH=/mnt/memes docker compose up -d --build
# → http://localhost:8090
```

The compose file is included (`docker-compose.yml`). Uploads, accounts and the
library live in `MEME_DATA_PATH` (default `/srv/mememanufaktur/data`, mounted
at `/app/data`), so `git pull`, rebuilds and `docker compose down` never touch
them. The container starts briefly as root to fix bind-mount ownership, then
drops to the non-root `node` user; it ships a `/health` check. A `.dockerignore`
keeps uploads, git history and tests out of the build context.

Upgrading from the old named volume `meme-data` (do this **before** the first
start with the new compose file, or stop the new container again first):

```bash
docker compose down
OLD_VOL=$(docker volume ls -q --filter name=meme-data | head -n1)
[ -n "$OLD_VOL" ] || { echo "meme-data volume not found"; exit 1; }
mkdir -p /srv/mememanufaktur/data
docker run --rm -v "$OLD_VOL":/from -v /srv/mememanufaktur/data:/to \
  alpine sh -c 'cp -a /from/. /to/'
chown -R 1000:1000 /srv/mememanufaktur/data
docker compose up -d --build
# optional cleanup after checking the data:
# docker volume rm "$OLD_VOL"
```

### 3) Static only (offline)

Any webserver works, e.g.:

```bash
python3 -m http.server 8080
```

Without the server you lose the shared uploads, voting and the game — the
game needs the server to register lobbies and relay messages. Packs then stay
in your browser.

## How a game runs

1. Pick **Quick play** (jump into an open public lobby or start one) or
   **Private game** (code only). Public lobbies show up in the list with
   player counts; the invite code and link are copyable in the lobby.
2. Everyone joins in their own browser; the first person in is the host.
3. The host picks 1–8 rounds, a mode, the time per round and whether the
   review continues automatically or waits for the host, then starts: each
   player writes a caption for their template — against the clock. A **new
   template** button rerolls to another random image at any time.
   Templates come from the server library, so upload a few pictures on the
   Packs page before the first game.
4. After every caption is in (or the timer runs out), all players see the same
   randomly ordered memes, one per 20 seconds. Upvote (**Krocha**), peak,
   downvote (**Gschissn**) or stay neutral (**Najo**) — your choice counts
   immediately, and your own meme is greyed out for you. Votes stay anonymous;
   only a peak shows who gave it.
5. Each round ends in a review with all memes sorted by points and a download
   button per meme. The host (or the auto timer) starts the next round. The
   finale shows every meme of the game and downloads them all as one ZIP.
   Confetti included.

The server only **relays messages** (and keeps the lobby list); all game
logic runs client-side.

## Where do my pictures go?

| Mode | Storage |
| --- | --- |
| Local (browser) | IndexedDB — only you can see them |
| Server (direct upload) | `MEME_DATA_DIR/uploads/` + index `MEME_DATA_DIR/library.json` (`./data` natively, `/srv/mememanufaktur/data` in Docker); used by the studio and every game |
| With an account | Server storage per account (up to 250 MB); private entries stay out of the public library and away from anonymous visitors, but signed-in players on the same server can load them by ID for LAN games. Accounts need the Node server |

The Packs page has a **“Upload directly to the server”** dropzone. Those
pictures are immediately part of the shared template pool used by the studio
and the game. The older “Also save to server” checkbox is still available when
uploading a local pack. If the server library is empty, the game asks the host
to upload templates first.

Large images are downscaled to max. 1280 px and re-encoded in the browser
before upload (GIFs keep their animation). Static files are served with
Brotli/Gzip, immutable caching for shared uploads and lazy/async image decoding.
Multi-select uploads are checked against the remaining account quota first and
continue past individual bad files instead of aborting the whole batch.

## Backups (Docker)

`scripts/backup.sh` packs the data directory (`uploads/`, `library.json`,
`users.json`) into `/var/backups/mememanufaktur/mememanufaktur-YYYY-MM-DD.tgz`
and keeps the newest **7** daily archives. It runs on the Docker host, without
stopping the app:

```bash
bash scripts/backup.sh
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `MEME_BACKUP_DIR` | `/var/backups/mememanufaktur` | Directory for the archives |
| `MEME_BACKUP_KEEP` | `7` | Number of daily archives kept |
| `MEME_CONTAINER` | `mememanufaktur` | Compose container name |

Daily at 00:00 via systemd timer:

```ini
# /etc/systemd/system/mememanufaktur-backup.service
[Unit]
Description=MemeManufaktur data backup
After=docker.service

[Service]
Type=oneshot
ExecStart=/bin/bash /opt/mememanufaktur/scripts/backup.sh
```

```ini
# /etc/systemd/system/mememanufaktur-backup.timer
[Unit]
Description=Daily MemeManufaktur backup

[Timer]
OnCalendar=*-*-* 00:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
systemctl daemon-reload
systemctl enable --now mememanufaktur-backup.timer
systemctl start mememanufaktur-backup.service   # test run
```

Restore (extract back into the volume while the app is stopped):

```bash
docker compose stop
docker run --rm --volumes-from mememanufaktur \
  -v /var/backups/mememanufaktur:/backup alpine \
  sh -c 'rm -rf /app/data/* && tar xzf /backup/mememanufaktur-YYYY-MM-DD.tgz -C /app/data && chown -R 1000:1000 /app/data'
docker compose start
```

Archives stay on the same disk; copy them off the LXC (Proxmox backup or
rsync) if the host itself can fail.

## HTTP API & WebSocket

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/health` | GET | Liveness check |
| `/api/register` | POST | Create an account (JSON: `email`, `password`; no verification) |
| `/api/login`, `/api/logout` | POST | Session via `HttpOnly` cookie |
| `/api/me` | GET | Current user + storage usage |
| `/api/library` | GET | Shared templates + your own, sorted by votes (private entries only for their owner) |
| `/api/vote` | POST | Toggle your upvote on an entry (JSON: `id`; needs a session) |
| `/api/lobbies` | GET | Open public lobbies (`code`, `name`, `players`) |
| `/api/upload` | POST | Create/update a template (JSON: `id`, `name`, `mime`, `data` as base64; `shared: true` makes an account upload public) |
| `/api/library/:id` | DELETE | Remove a template (own entries only by their owner) |
| `/uploads/:id` | GET | Fetch an uploaded image (session required for private entries) |
| `/ws?room=CODE&name=NAME&self=ID&pub=1&lobby=NAME` | WS | Game relay — the first connection registers the lobby; join, roster, round state, votes |

Limits: 25 MB per uploaded image, 250 MB per account, 500 MB for the shared
anonymous library, 16 MB per WebSocket message. SVG uploads are rejected on
purpose: SVG can carry scripts and would run in the app origin. Only PNG, JPEG,
GIF and WebP are accepted, detected by magic bytes.

## Security & exposure

This is a LAN-first, self-hosted app. A few deliberate guardrails:

- Static hosting is allow-listed to `index.html`, `favicon.svg`,
  `manifest.webmanifest`, `css/`, `js/` and `assets/`. `data/`, `.git/`,
  `test/` and the server source are **not** reachable over HTTP.
- Uploads are accepted only as PNG, JPEG, GIF or WebP, detected by magic bytes.
  SVG uploads are rejected because SVG can execute scripts in the app origin.
- Private entries are excluded from the public library and require a session;
  public/shared uploads (the default for the server upload dropzone) are
  visible to everyone and can be voted on. Do not treat private entries as
  end-to-end secrets on a shared server.
- Passwords are hashed with scrypt; sessions are HttpOnly cookies and expire
  server-side after 30 days.
- There is no built-in TLS. If you expose the instance to the internet, put it
  behind an HTTPS reverse proxy and review the sharing defaults first.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8080` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `MEME_DATA_DIR` | `./data` | Data directory (uploads + library index) |
| `MEME_USER_QUOTA_BYTES` | `262144000` | Storage quota per account (250 MB) |
| `MEME_ANON_QUOTA_BYTES` | `524288000` | Storage quota for the shared anonymous library (500 MB) |

Compose-only: `MEME_DATA_PATH` (host data directory, default
`/srv/mememanufaktur/data`) and `MEME_PORT` (published port, default `8080`).

## Project structure

```
index.html             Entry point (also works fully static)
manifest.webmanifest   Installable web-app manifest
css/styles.css         Design system (warm paper, navy, yellow, tokens)
css/chrome.css         Skip link, server status, error card
css/studio.css         Visual template gallery and studio tools
css/packs.css          Search, paged server library, upload states
css/game.css           Lobby, voting, result and finale polish
js/lib.js              i18n (EN/DE), utilities
js/packs.js            Pack API (IndexedDB), built-in cleanup + server client
js/editor.js           MemeCanvas render engine (incl. layer duplicate)
js/ui-studio.js        Studio page
js/ui-packs.js         Packs page, direct server upload
js/net.js              WebSocket client (Room)
js/game.js             Party game: lobbies + rounds
js/scoring.js          Pure scoring functions
js/zip.js              Dependency-free ZIP writer for the finale
js/main.js             Router, nav/footer, help
server.js              Zero-dep Node server (static, uploads, WS relay)
docker-entrypoint.sh   Fixes data-mount ownership, then drops to node
scripts/backup.sh      Daily Docker data backup (7-day retention)
assets/icon-*.png      App icons (PWA / home screen)
assets/screenshot.png  Home page screenshot (used in this README)
assets/fonts/          Bundled Bangers/Nunito fonts (OFL)
test/smoke.mjs         API smoke tests (node:test)
test/invariants.mjs    i18n, scoring, ZIP and utility invariants
data/uploads/          Shared images (created automatically)
```

There are no bundled meme images. Upload templates on the Packs page into the
server library; they become available to the studio and every game.

## Testing

```bash
npm test
```

Runs the dependency-free suite (`node --test`) against an isolated data
directory. The smoke tests cover health, static serving, upload round-trips,
content-type hygiene, deletion, accounts, private visibility, the storage quota,
voting and lobbies. The invariant tests check DE/EN key parity, scoring, ZIP,
and the room-code/shuffle helpers.

---

Your data stays where you host it.
