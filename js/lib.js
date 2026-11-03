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
    'lobby.title': 'Lobby',
    'lobby.lead': 'Lobby erstellen, über die öffentliche Liste beitreten oder per Code joinen – dann Caption schreiben, abstimmen, lachen. Jede:r spielt auf dem eigenen Gerät.',
    'lobby.create': 'Lobby erstellen',
    'lobby.name': 'Lobby-Name',
    'lobby.visibility': 'Sichtbarkeit',
    'lobby.public': 'Öffentlich – in der offenen Liste sichtbar',
    'lobby.private': 'Privat – Beitritt nur per Code',
    'lobby.openList': 'Offene öffentliche Lobbys',
    'lobby.noOpen': 'Gerade keine öffentliche Lobby offen – erstell selbst eine.',
    'lobby.byCode': 'Oder per Code beitreten',
    'lobby.join': 'Beitreten',
    'lobby.playersIn': '{n} drin',
    'lobby.codeBad': 'Der Code hat 4 Zeichen.',
    'lobby.needserver': 'Das Spiel braucht den Server – starte „node server.js“ oder Docker.',
    'lobby.error': 'Verbindung zum Server verloren. Partie wird beendet.',
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
    'pakete.own': 'Meins',
    'vote.btn': 'Abstimmen',
    'vote.undo': 'Vote zurücknehmen',
    'vote.hint': 'Abstimmen braucht ein Konto – oben anmelden oder erstellen.',
    'account.title': 'Dein Konto',
    'account.lead': 'Ohne Verifizierung – E-Mail und Passwort reichen. Dein eigenes Pack bleibt bis 250 MB auf dem Server, private Bilder siehst nur du.',
    'account.email': 'E-Mail',
    'account.password': 'Passwort',
    'account.register': 'Konto erstellen',
    'account.login': 'Anmelden',
    'account.logout': 'Abmelden',
    'account.who': 'Angemeldet als {email}',
    'account.quota': '{used} von {max} MB genutzt',
    'account.needserver': 'Das Konto braucht den Node-Server – ohne Server bleiben Pakete nur in deinem Browser.',
    'spiel.ownPacks': 'Eigene Packs der Spieler:innen erlauben',
    'spiel.ownPacks.on': 'Eigene Packs sind erlaubt – angemeldete Spieler:innen werden automatisch angebunden.',
    'spiel.ownPacks.use': 'Dein eigenes Pack ist angebunden.',
    'spiel.title': 'Meme-Partie',
    'spiel.setup.t': 'Partie einrichten',
    'spiel.players': 'Spieler:innen',
    'spiel.modes.random': 'Zufällige Templates',
    'spiel.modes.random.d': 'Jede Runde bekommt jede:r ein anderes Bild.',
    'spiel.modes.same': 'Gleicher Meme',
    'spiel.modes.same.d': 'Alle kriegen dasselbe Template – es zählt nur die Caption.',
    'spiel.modes.theme': 'Themen-Runde',
    'spiel.modes.theme.d': 'Jede Runde hat ein Thema, dem sich die Caption nähern soll.',
    'spiel.relaxed': 'Entspannt (ohne Punkte)',
    'spiel.rounds': 'Runden',
    'spiel.time': 'Zeit pro Runde (Sekunden)',
    'spiel.yourName': 'Dein Name',
    'spiel.start': 'Partie starten',
    'spiel.lobby': 'Lobby',
    'spiel.lobby.wait': 'Warte auf mehr Spieler …',
    'spiel.lobby.host': 'Du bist Host:innen. Wähle die Einstellungen und starte.',
    'spiel.lobby.code': 'Einladungscode',
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
    'spiel.final.home': 'Zur Lobby',
    'spiel.waiting': 'Warte auf',
    'help.title': 'Hilfe & FAQ',
    'help.q1': 'Wie hoste ich das?',
    'help.a1': 'Am einfachsten: <code>node server.js</code> – dann läuft alles unter <code>http://localhost:8080</code>, inklusive geteiltem Bildbestand und LAN-Partien. Ohne Server funktioniert die Seite auch statisch (z. B. <code>python3 -m http.server</code> oder ein beliebiger Webserver) – Pakete landen dann nur im Browser.',
    'help.q2': 'Wo landen meine Bilder?',
    'help.a2': 'Lokal im Browser (IndexedDB). Wenn der Node-Server erreichbar ist, kannst du Bilder zusätzlich in den Ordner <code>./data/uploads</code> hochladen – dann sehen alle am Netz dieselben Vorlagen.',
    'help.q3': 'Kann ich mit Freund:innen gleichzeitig spielen?',
    'help.a3': 'Ja: Lobby erstellen und den Code teilen – öffentliche Lobbys stehen in der offenen Liste, private findest du nur über den Code. Jede:r öffnet <code>http://dein-server:8080</code> im eigenen Browser; der Server leitet nur die Nachrichten weiter.',
    'help.q4': 'Gibt es eine mobile App?',
    'help.a4': 'Die Seite ist responsive – Handy und Tablet laufen direkt im Browser. Für echte Apps fehlt noch eine Hülle, aber die HTML-Cache-Techniken sind vorbereitet.',
    'footer.left': 'Selbst gehostet · Deine Daten bleiben bei dir',
    'footer.right': 'Kein Build · null Dependencies',
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
    'lobby.title': 'Lobby',
    'lobby.lead': 'Create a lobby, join one from the public list or by code – then write captions, vote and laugh. Everyone plays on their own device.',
    'lobby.create': 'Create lobby',
    'lobby.name': 'Lobby name',
    'lobby.visibility': 'Visibility',
    'lobby.public': 'Public – visible in the open list',
    'lobby.private': 'Private – join by code only',
    'lobby.openList': 'Open public lobbies',
    'lobby.noOpen': 'No public lobby is open right now – create one.',
    'lobby.byCode': 'Or join by code',
    'lobby.join': 'Join',
    'lobby.playersIn': '{n} inside',
    'lobby.codeBad': 'Codes are 4 characters.',
    'lobby.needserver': 'The game needs the server – run „node server.js“ or Docker.',
    'lobby.error': 'Lost connection to server. Match ends.',
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
    'pakete.own': 'Mine',
    'vote.btn': 'Vote',
    'vote.undo': 'Undo vote',
    'vote.hint': 'Voting needs an account – sign in above.',
    'account.title': 'Your account',
    'account.lead': 'No verification – email and password are enough. Your own pack stays on the server up to 250 MB; private pictures are visible to you only.',
    'account.email': 'Email',
    'account.password': 'Password',
    'account.register': 'Create account',
    'account.login': 'Sign in',
    'account.logout': 'Sign out',
    'account.who': 'Signed in as {email}',
    'account.quota': '{used} of {max} MB used',
    'account.needserver': 'The account needs the Node server – without it, packs stay in your browser only.',
    'spiel.ownPacks': 'Allow players to use their own packs',
    'spiel.ownPacks.on': 'Own packs are allowed – signed-in players are attached automatically.',
    'spiel.ownPacks.use': 'Your own pack is attached.',
    'spiel.title': 'Meme Party',
    'spiel.setup.t': 'Set up the match',
    'spiel.players': 'Players',
    'spiel.modes.random': 'Random templates',
    'spiel.modes.random.d': 'Every round everyone gets a different picture.',
    'spiel.modes.same': 'Same meme',
    'spiel.modes.same.d': 'Everyone gets the same template – only the caption counts.',
    'spiel.modes.theme': 'Themed round',
    'spiel.modes.theme.d': 'Each round has a theme the caption should lean into.',
    'spiel.relaxed': 'Chill mode (no points)',
    'spiel.rounds': 'Rounds',
    'spiel.time': 'Time per round (seconds)',
    'spiel.yourName': 'Your name',
    'spiel.start': 'Start match',
    'spiel.lobby': 'Lobby',
    'spiel.lobby.wait': 'Waiting for more players …',
    'spiel.lobby.host': 'You are host. Pick settings and start.',
    'spiel.lobby.code': 'Invite code',
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
    'spiel.final.home': 'Back to lobby',
    'spiel.waiting': 'Waiting for',
    'help.title': 'Help & FAQ',
    'help.q1': 'How do I host it?',
    'help.a1': 'Easiest: <code>node server.js</code> – then everything runs under <code>http://localhost:8080</code>, including shared pictures and LAN matches. Without a server the site also works statically (e.g. <code>python3 -m http.server</code>) – packs then only live in the browser.',
    'help.q2': 'Where do my pictures go?',
    'help.a2': 'Locally in the browser (IndexedDB). If the Node server is reachable you can additionally upload into <code>./data/uploads</code> – then everyone on the network sees the same templates.',
    'help.q3': 'Can friends play at the same time?',
    'help.a3': 'Yes: create a lobby and share the code – public lobbies show up in the open list, private ones only work with the code. Everyone opens <code>http://your-server:8080</code> in their own browser; the server just relays messages.',
    'help.q4': 'Is there a mobile app?',
    'help.a4': 'The site is responsive – phones and tablets work right in the browser. A real app shell is still missing, but the webapp plumbing is ready.',
    'footer.left': 'Self-hosted · Your data stays with you',
    'footer.right': 'No build · zero dependencies',
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
  const n = el('div', { class: 'toast', 'aria-live': 'polite' }, msg);
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
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = cv.getContext('2d');
  cv.width = innerWidth; cv.height = innerHeight;
  const colors = ['#F4B63F', '#E0484F', '#2D6FD8', '#19A877', '#D9489B'];
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
