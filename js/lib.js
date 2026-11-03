// ============ MemeManufaktur – Lib (i18n, Storage, Utils) ============

export const LS = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
};

export function t(key, vars) {
  const lang = LS.get('lang', 'de');
  let str = (I18N[lang] && I18N[lang][key]) ?? I18N.de[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) str = str.replaceAll(`{${k}}`, v);
  return str;
}

export const I18N = {
  de: {
    'nav.studio': 'Studio',
    'nav.pakete': 'Pakete',
    'nav.spiel': 'Spiel',
    'nav.hilfe': 'Hilfe',
    'server.on': 'Server verbunden',
    'server.off': 'Offline-Modus',
    'home.badge': 'Self-Hosted · Offline-fähig',
    'home.title': 'Make it Meme – jetzt bei dir zu Hause.',
    'home.lead': 'Das Meme-Partyspiel zum Selbsthosten: Templates wählen, Caption schreiben, abstimmen, lachen. Mit deinen eigenen Bildern und Meme-Paketen – alles bleibt auf deinem Server oder in deinem Browser.',
    'home.cta.quick': 'Schnelles Spiel',
    'home.cta.private': 'Privates Spiel (LAN)',
    'home.demo.tag': 'Live-Vorschau',
    'home.tick1': 'STONKS', 'home.tick2': 'DRACKE', 'home.tick3': 'RAGE CAT', 'home.tick4': 'WEINERL', 'home.tick5': 'SCHRUGG', 'home.tick6': 'PIGEON?', 'home.tick7': 'EIGENE BILDER', 'home.tick8': 'MEINE PAKETE',
    'home.feat1.t': 'Meme-Studio',
    'home.feat1.d': 'Texte ziehen, skalieren, Outline, Hintergrund, Bildfilter und PNG-Export – der komplette Klassiker, lokal gerendert.',
    'home.feat2.t': 'Deine Pakete',
    'home.feat2.d': 'Bilder hochladen, in Pakete sortieren, im Studio und im Spiel verwenden. Speichert lokal im Browser oder auf deinem Server.',
    'home.feat3.t': 'Party-Modus',
    'home.feat3.d': 'Hot-Seat am einen Gerät oder eine echte LAN-Partie mit Raumcode – Runden, Themes und Abstimmungen wie im Original.',
    'home.steps.t': 'So läuft eine Runde',
    'home.step1': 'Alle Spieler geben ihre Caption für ihr Template ab – gegen die Uhr.',
    'home.step2': 'Jede Stimme zählt: alle voten für die besten Memes der Runde.',
    'home.step3': 'Punkte fließen, nach den letzten Runden steht der Meme-König fest.',
    'home.band.t': 'Klingt nach deinem nächsten Spieleabend?',
    'home.band.d': 'Kein Account, keine Cloud-Pflicht. Ein Ordner, ein Server – fertig.',
    'studio.title': 'Meme-Studio',
    'studio.tpl': 'Template',
    'studio.random': 'Zufall',
    'studio.replace': 'Austauschen',
    'studio.layers': 'Ebenen',
    'studio.addLayer': 'Text hinzufügen',
    'studio.noLayers': 'Noch keine Texte – leg los!',
    'studio.text': 'Texteinstellungen',
    'studio.content': 'Inhalt',
    'studio.font': 'Schrift',
    'studio.size': 'Größe',
    'studio.color': 'Textfarbe',
    'studio.stroke': 'Outline',
    'studio.strokeW': 'Stärke',
    'studio.highlight': 'Hintergrund-Highlight',
    'studio.align': 'Ausrichtung',
    'studio.upper': 'Großschreibung',
    'studio.autoFit': 'Auto-Fit',
    'studio.alignC': 'Zentriert', 'studio.alignL': 'Links', 'studio.alignR': 'Rechts',
    'studio.image': 'Bild',
    'studio.upload': 'Bild hochladen',
    'studio.zoom': 'Zoom',
    'studio.bright': 'Helligkeit',
    'studio.contrast': 'Kontrast',
    'studio.saturate': 'Sättigung',
    'studio.flip': 'Spiegeln',
    'studio.rotate': 'Drehen 90°',
    'studio.reset': 'Zurücksetzen',
    'studio.export': 'Export',
    'studio.format': 'Format',
    'studio.quality': 'Qualität',
    'studio.download': 'Herunterladen',
    'studio.copy': 'In Zwischenablage',
    'studio.copied': 'Meme kopiert!',
    'studio.saved': 'Gespeichert',
    'studio.hint': 'Ziehen = Verschieben · Scrollrad = Größe',
    'pakete.title': 'Deine Meme-Pakete',
    'pakete.lead': 'Lade eigene Bilder hoch und sortiere sie in Pakete – verfügbar im Studio und im Spiel.',
    'pakete.newPack': 'Neues Paket',
    'pakete.rename': 'Umbenennen',
    'pakete.delete': 'Paket löschen',
    'pakete.addImages': 'Bilder hinzufügen',
    'pakete.namePlaceholder': 'Name des Pakets',
    'pakete.drop': 'Bilder hierher ziehen oder klicken zum Auswählen',
    'pakete.templates': 'Vorlagen',
    'pakete.use': 'Im Studio öffnen',
    'pakete.serverTitle': 'Geteilter Server-Bestand',
    'pakete.serverLead': 'Über die Node-Serverinstanz geteilt – alle am LAN sehen dieselbe Bibliothek.',
    'pakete.uploadShared': 'Auch auf dem Server speichern',
    'pakete.empty': 'Dieses Paket ist leer – lade Bilder hoch!',
    'pakete.confirmDelTpl': 'Diese Vorlage wirklich entfernen?',
    'pakete.confirmDelPack': 'Paket samt Zuordnung löschen? (Die Bilder bleiben erhalten.)',
    'spiel.title': 'Meme-Partie',
    'spiel.setup.t': 'Partie einrichten',
    'spiel.players': 'Spieler:innen',
    'spiel.addPlayer': 'Spieler:in hinzufügen',
    'spiel.mode': 'Spielmodus',
    'spiel.modes.random': 'Zufällige Templates',
    'spiel.modes.random.d': 'Jede Runde bekommt jede:r ein anderes Bild.',
    'spiel.modes.same': 'Gleicher Meme',
    'spiel.modes.same.d': 'Alle kriegen dasselbe Template – es zählt nur die Caption.',
    'spiel.modes.theme': 'Themen-Runde',
    'spiel.modes.theme.d': 'Jede Runde hat ein Thema, dem sich die Caption nähern soll.',
    'spiel.relaxed': 'Entspannt (ohne Punkte)',
    'spiel.rounds': 'Runden',
    'spiel.time': 'Zeit pro Runde (Sekunden)',
    'spiel.source': 'Template-Quelle',
    'spiel.source.all': 'Alle Pakete',
    'spiel.lan': 'LAN-Modus',
    'spiel.lan.local': 'Hot-Seat (ein Gerät)',
    'spiel.lan.network': 'LAN (mehrere Browser)',
    'spiel.createRoom': 'Raum erstellen',
    'spiel.joinRoom': 'Beitreten',
    'spiel.roomCode': 'Raumcode',
    'spiel.yourName': 'Dein Name',
    'spiel.start': 'Partie starten',
    'spiel.lobby': 'Lobby',
    'spiel.lobby.wait': 'Warte auf mehr Spieler …',
    'spiel.lobby.host': 'Du bist Host:innen. Wähle die Einstellungen und starte.',
    'spiel.lobby.code': 'Einladungscode',
    'spiel.turn.pass': 'Übergib das Gerät an',
    'spiel.turn.continue': 'Weiter',
    'spiel.turn.yours': 'Deine Caption für dieses Template',
    'spiel.turn.top': 'Text oben',
    'spiel.turn.bottom': 'Text unten',
    'spiel.turn.changeImg': 'Anderes Bild',
    'spiel.turn.submit': 'Caption abgeben',
    'spiel.turn.inspo': 'Inspiration',
    'spiel.vote.title': 'Abstimmen',
    'spiel.vote.hint': 'Wähle deine {n} Lieblings-Memes',
    'spiel.vote.submit': 'Stimmen abgeben',
    'spiel.result.title': 'Runde abgeschlossen',
    'spiel.result.next': 'Nächste Runde',
    'spiel.final.title': 'Meme-König:innen',
    'spiel.final.again': 'Nochmal spielen',
    'spiel.final.home': 'Zur Startseite',
    'spiel.waiting': 'Warte auf',
    'spiel.lan.needserver': 'Der LAN-Modus braucht den Node-Server: starte „node server.js“ im Projektordner.',
    'spiel.lan.connected': 'Verbunden mit dem Server.',
    'spiel.lan.error': 'Verbindung zum Server verloren. Partie wird beendet.',
    'help.title': 'Hilfe & FAQ',
    'help.q1': 'Wie hoste ich das?',
    'help.a1': 'Am einfachsten: <code>node server.js</code> – dann läuft alles unter <code>http://localhost:8080</code>, inklusive geteiltem Bildbestand und LAN-Partien. Ohne Server funktioniert die Seite auch statisch (z. B. <code>python3 -m http.server</code> oder ein beliebiger Webserver) – Pakete landen dann nur im Browser.',
    'help.q2': 'Wo landen meine Bilder?',
    'help.a2': 'Lokal im Browser (IndexedDB). Wenn der Node-Server erreichbar ist, kannst du Bilder zusätzlich in den Ordner <code>./data/uploads</code> hochladen – dann sehen alle am Netz dieselben Vorlagen.',
    'help.q3': 'Kann ich mit Freund:innen gleichzeitig spielen?',
    'help.a3': 'Ja, über den LAN-Modus: Jede:r öffnet <code>http://dein-server:8080</code> in einem Browser und tritt mit dem Raumcode bei. Der Host steuert die Runden; der Server relaid nur die Nachrichten.',
    'help.q4': 'Gibt es eine mobile App?',
    'help.a4': 'Die Seite ist responsive – Handy und Tablet laufen direkt im Browser. Für echte Apps fehlt noch eine Hülle, aber die HTML-Cache-Techniken sind vorbereitet.',
    'footer.left': 'Selbst gehostet · Deine Daten bleiben bei dir',
    'footer.right': 'Ein Fan-Projekt im Geist von makeitmeme.com',
    'ui.cancel': 'Abbrechen',
    'ui.create': 'Anlegen',
    'ui.save': 'Speichern',
    'ui.delete': 'Löschen',
    'ui.remove': 'Entfernen',
  },
  en: {
    'nav.studio': 'Studio',
    'nav.pakete': 'Packs',
    'nav.spiel': 'Game',
    'nav.hilfe': 'Help',
    'server.on': 'Server connected',
    'server.off': 'Offline mode',
    'home.badge': 'Self-hosted · works offline',
    'home.title': 'Make it Meme – but at yours, at home.',
    'home.lead': 'The meme party game you self-host: pick a template, write the caption, vote, laugh. With your own pictures and meme packs – everything stays on your server or in your browser.',
    'home.cta.quick': 'Quick game',
    'home.cta.private': 'Private game (LAN)',
    'home.demo.tag': 'Live preview',
    'home.tick1': 'STONKS', 'home.tick2': 'DRACKE', 'home.tick3': 'RAGE CAT', 'home.tick4': 'CRY BABY', 'home.tick5': 'SHRUG', 'home.tick6': 'PIGEON?', 'home.tick7': 'YOUR PICTURES', 'home.tick8': 'YOUR PACKS',
    'home.feat1.t': 'Meme studio',
    'home.feat1.d': 'Drag text around, resize, outline, highlight, image filters and PNG export – the full classic, rendered locally.',
    'home.feat2.t': 'Your packs',
    'home.feat2.d': 'Upload your own pictures, organize them into packs, use them in studio and in the game. Stored in your browser or on your server.',
    'home.feat3.t': 'Party mode',
    'home.feat3.d': 'Hot-seat on one device or a real LAN match with room code – rounds, themes and voting like the original.',
    'home.steps.t': 'How a round goes',
    'home.step1': 'Every player submits a caption for their template – against the clock.',
    'home.step2': 'All votes count: everyone picks the best memes of the round.',
    'home.step3': 'Points flow, after the last rounds the meme king is crowned.',
    'home.band.t': 'Sounds like your next game night?',
    'home.band.d': 'No account, no cloud. One folder, one server – done.',
    'studio.title': 'Meme Studio',
    'studio.tpl': 'Template',
    'studio.random': 'Random',
    'studio.replace': 'Replace',
    'studio.layers': 'Layers',
    'studio.addLayer': 'Add text',
    'studio.noLayers': 'No text yet – get started!',
    'studio.text': 'Text settings',
    'studio.content': 'Content',
    'studio.font': 'Font',
    'studio.size': 'Size',
    'studio.color': 'Text color',
    'studio.stroke': 'Outline',
    'studio.strokeW': 'Width',
    'studio.highlight': 'Background highlight',
    'studio.align': 'Alignment',
    'studio.upper': 'Uppercase',
    'studio.autoFit': 'Auto-fit',
    'studio.alignC': 'Center', 'studio.alignL': 'Left', 'studio.alignR': 'Right',
    'studio.image': 'Image',
    'studio.upload': 'Upload image',
    'studio.zoom': 'Zoom',
    'studio.bright': 'Brightness',
    'studio.contrast': 'Contrast',
    'studio.saturate': 'Saturation',
    'studio.flip': 'Flip',
    'studio.rotate': 'Rotate 90°',
    'studio.reset': 'Reset',
    'studio.export': 'Export',
    'studio.format': 'Format',
    'studio.quality': 'Quality',
    'studio.download': 'Download',
    'studio.copy': 'Copy to clipboard',
    'studio.copied': 'Meme copied!',
    'studio.saved': 'Saved',
    'studio.hint': 'Drag = move · Mouse wheel = size',
    'pakete.title': 'Your meme packs',
    'pakete.lead': 'Upload your own pictures and sort them into packs – available in studio and in the game.',
    'pakete.newPack': 'New pack',
    'pakete.rename': 'Rename',
    'pakete.delete': 'Delete pack',
    'pakete.addImages': 'Add images',
    'pakete.namePlaceholder': 'Pack name',
    'pakete.drop': 'Drop pictures here or click to pick files',
    'pakete.templates': 'Templates',
    'pakete.use': 'Open in studio',
    'pakete.serverTitle': 'Shared server library',
    'pakete.serverLead': 'Shared via the Node instance – everyone on the LAN sees the same library.',
    'pakete.uploadShared': 'Also save to server',
    'pakete.empty': 'This pack is empty – upload some pictures!',
    'pakete.confirmDelTpl': 'Remove this template?',
    'pakete.confirmDelPack': 'Delete pack? (The images are kept.)',
    'spiel.title': 'Meme Party',
    'spiel.setup.t': 'Set up the match',
    'spiel.players': 'Players',
    'spiel.addPlayer': 'Add player',
    'spiel.mode': 'Game mode',
    'spiel.modes.random': 'Random templates',
    'spiel.modes.random.d': 'Every round everyone gets a different picture.',
    'spiel.modes.same': 'Same meme',
    'spiel.modes.same.d': 'Everyone gets the same template – only the caption counts.',
    'spiel.modes.theme': 'Themed round',
    'spiel.modes.theme.d': 'Each round has a theme the caption should lean into.',
    'spiel.relaxed': 'Chill mode (no points)',
    'spiel.rounds': 'Rounds',
    'spiel.time': 'Time per round (seconds)',
    'spiel.source': 'Template source',
    'spiel.source.all': 'All packs',
    'spiel.lan': 'LAN mode',
    'spiel.lan.local': 'Hot-seat (one device)',
    'spiel.lan.network': 'LAN (multiple browsers)',
    'spiel.createRoom': 'Create room',
    'spiel.joinRoom': 'Join room',
    'spiel.roomCode': 'Room code',
    'spiel.yourName': 'Your name',
    'spiel.start': 'Start match',
    'spiel.lobby': 'Lobby',
    'spiel.lobby.wait': 'Waiting for more players …',
    'spiel.lobby.host': 'You are host. Pick settings and start.',
    'spiel.lobby.code': 'Invite code',
    'spiel.turn.pass': 'Pass the device to',
    'spiel.turn.continue': 'Continue',
    'spiel.turn.yours': 'Your caption for this template',
    'spiel.turn.top': 'Top text',
    'spiel.turn.bottom': 'Bottom text',
    'spiel.turn.changeImg': 'Different image',
    'spiel.turn.submit': 'Submit caption',
    'spiel.turn.inspo': 'Inspiration',
    'spiel.vote.title': 'Voting',
    'spiel.vote.hint': 'Pick your {n} favorite memes',
    'spiel.vote.submit': 'Cast votes',
    'spiel.result.title': 'Round over',
    'spiel.result.next': 'Next round',
    'spiel.final.title': 'Meme royalty',
    'spiel.final.again': 'Play again',
    'spiel.final.home': 'Back home',
    'spiel.waiting': 'Waiting for',
    'spiel.lan.needserver': 'LAN mode needs the Node server: run „node server.js“ in the project folder.',
    'spiel.lan.connected': 'Connected to server.',
    'spiel.lan.error': 'Lost connection to server. Match ends.',
    'help.title': 'Help & FAQ',
    'help.q1': 'How do I host it?',
    'help.a1': 'Easiest: <code>node server.js</code> – then everything runs under <code>http://localhost:8080</code>, including shared pictures and LAN matches. Without a server the site also works statically (e.g. <code>python3 -m http.server</code>) – packs then only live in the browser.',
    'help.q2': 'Where do my pictures go?',
    'help.a2': 'Locally in the browser (IndexedDB). If the Node server is reachable you can additionally upload into <code>./data/uploads</code> – then everyone on the network sees the same templates.',
    'help.q3': 'Can friends play at the same time?',
    'help.a3': 'Yes, via LAN mode: each person opens <code>http://your-server:8080</code> in a browser and joins with the room code. The host drives the rounds; the server just relays messages.',
    'help.q4': 'Is there a mobile app?',
    'help.a4': 'The site is responsive – phones and tablets work right in the browser. A real app shell is still missing, but the webapp plumbing is ready.',
    'footer.left': 'Self-hosted · Your data stays with you',
    'footer.right': 'A fan project in the spirit of makeitmeme.com',
    'ui.cancel': 'Cancel',
    'ui.create': 'Create',
    'ui.save': 'Save',
    'ui.delete': 'Delete',
    'ui.remove': 'Remove',
  },
};

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
}

// ============ Utils ============
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') node.innerHTML = v;
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function toast(msg, ms = 2600) {
  document.querySelectorAll('.toast').forEach((n) => n.remove());
  const n = el('div', { class: 'toast' }, msg);
  document.body.append(n);
  setTimeout(() => n.remove(), ms);
}

export function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function uid(prefix = 'id') { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }
export function roomCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// Konfetti – kleine Partikel-Show
export function confetti(durationMs = 2800) {
  const cv = document.getElementById('confetti');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  cv.width = innerWidth; cv.height = innerHeight;
  const colors = ['#FFC93C', '#FF4A2A', '#2E5BFF', '#2FBF71', '#FF6FA5', '#14163F'];
  const parts = Array.from({ length: 140 }, () => ({
    x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * 0.3,
    w: 6 + Math.random() * 8, h: 8 + Math.random() * 10,
    vy: 2 + Math.random() * 3.5, vx: -1.5 + Math.random() * 3,
    rot: Math.random() * Math.PI, vr: -0.15 + Math.random() * 0.3,
    color: rand(colors),
  }));
  const start = performance.now();
  let raf;
  function frame(now) {
    const t = now - start;
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (t < durationMs) raf = requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, cv.width, cv.height);
  }
  raf = requestAnimationFrame(frame);
}
