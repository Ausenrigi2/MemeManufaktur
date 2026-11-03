# 🎨 MemeManufaktur

Das **Make-it-Meme** als Partyspiel zum Selbsthosten – im Geist von
[makeitmeme.com](https://makeitmeme.com/de/), aber komplett bei dir:

- 🖌️ **Meme-Studio**: Texte ziehen & skalieren, Outline, Highlight, Bildfilter,
  PNG-/JPEG-Export und Zwischenablage-Kopie – alles lokal im Browser gerendert.
- 📦 **Eigene Meme-Pakete**: Bilder hochladen, in Pakete sortieren, im Studio
  und im Spiel verwenden. Lokal im Browser (IndexedDB) oder – wenn der Server
  läuft – geteilt für alle am Netz.
- 🎉 **Partyspiel**: Hot-Seat an einem Gerät oder echte **LAN-Partie mit
  Raumcode** – Runden, Themes, Abstimmungen und Meme-König:innen-Thron.
- 🌍 **Deutsch zuerst**, optional auf Englisch umschaltbar.

Kein Build-Schritt, keine Abhängigkeiten: Vanilla-JS-Module + ein
zero-dependency Node-Server für LAN und geteilte Uploads.

## Schnellstart

### 1) Vollmodus (empfohlen): Node-Server

```bash
node server.js
# → http://localhost:8080
```

Freund:innen im selben Netz öffnen `http://<deine-ip>:8080`. Damit sind
geteilte Bild-Bestände und LAN-Partien aktiv.

Variante mit npm:

```bash
npm start
```

### 2) Docker

```bash
docker compose up -d --build
# → http://localhost:8080
```

Uploads bleiben im Volume `meme-data` erhalten.

### 3) Nur statisch (Offline)

Beliebiger Webserver reicht, z. B.:

```bash
python3 -m http.server 8080
# oder: npx serve .
```

Ohne Server läuft alles außer geteilten Uploads und dem LAN-Modus –
die App erkennt das selbst (Badge in der Leiste: „Offline-Modus“).

## Wo landen meine Bilder?

| Modus | Speicherort |
| --- | --- |
| Lokal (Browser) | IndexedDB (`mememanufaktur`) – nur du siehst sie |
| Geteilt (Server) | Ordner `./data/uploads` + Index `./data/library.json` |

„Auch auf dem Server speichern“ kannst du bei jedem Upload in der
Pakete-Seite an- oder abschalten.

## Wie läuft eine Partie?

1. Host erstellt einen Raum → 4-stelliger Einladungscode.
2. Alle treten im Browser mit dem Code bei.
3. Der Host startet die Runden: jede:r Spieler:in schreibt eine Caption
   für ihr Template – gegen die Uhr.
4. Alle voten für die besten Memes, Punkte fließen, nach den letzten
   Runden wird gekrönt – Konfetti inklusive.

Der Server relaid **nur** Nachrichten; alle Spiellogik läuft im Browser.

## Projektstruktur

```
index.html          Einstiegspunkt (läuft auch statisch)
css/styles.css      Design-System (Comic/Brutalist)
js/lib.js           i18n (DE/EN), Utilities
js/packs.js         Pakete-API (IndexedDB) + Server-API
js/editor.js        MemeCanvas-Render-Engine
js/ui-studio.js     Studio-Seite
js/ui-packs.js      Pakete-Seite
js/net.js           WebSocket-Client (Room)
js/game.js          Partyspiel: Hot-Seat + LAN
js/main.js          Router, Nav/Footer, Startseite, Hilfe
server.js           Zero-Dep-Node-Server (Static, Uploads, WS-Relay)
assets/templates/   Built-in SVG-Templates („Klassiker“-Paket)
data/uploads/       Geteilte Bilder (wird angelegt)
```

## Ports & Umgebungsvariablen

| Variable | Default | Bedeutung |
| --- | --- | --- |
| `PORT` | `8080` | HTTP-Port |
| `HOST` | `0.0.0.0` | Bind-Adresse |

---

Ein Fan-Projekt – nicht mit makeitmeme.com verbunden. Deine Daten bleiben bei dir.
