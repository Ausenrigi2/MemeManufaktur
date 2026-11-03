// ============ Room – WebSocket-Client für LAN-Partien ============
import { uid } from './lib.js';

export class Room {
  constructor(code, name) {
    this.code = code.toUpperCase();
    this.selfId = uid('ply');
    this.name = name;
    this.ws = null;
    this.state = 'closed'; // closed | connecting | open
    this.listeners = new Set();
    this.statusListeners = new Set();
    this._reconnect = null;
    this._outbox = []; // Sends vor „open“ werden hier gepuffert
  }

  onMessage(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onStatus(fn) { this.statusListeners.add(fn); return () => this.statusListeners.delete(fn); }
  _setStatus(s) { this.state = s; this.statusListeners.forEach((fn) => fn(s)); }
  _emit(msg) { this.listeners.forEach((fn) => { try { fn(msg); } catch (e) { console.error(e); } }); }

  connect() {
    if (this.state === 'open' || this.state === 'connecting') return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/ws?room=${encodeURIComponent(this.code)}&name=${encodeURIComponent(this.name)}&self=${encodeURIComponent(this.selfId)}`;
    this._setStatus('connecting');
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => { this._setStatus('open'); this._flushOutbox(); };
    ws.onmessage = (ev) => {
      try { this._emit(JSON.parse(ev.data)); } catch {}
    };
    ws.onclose = () => { this._setStatus('closed'); this._tryReconnect(); };
    ws.onerror = () => {};
  }

  _tryReconnect() {
    if (this._manualClose) return;
    clearTimeout(this._reconnect);
    this._reconnect = setTimeout(() => { if (!this._manualClose) this.connect(); }, 1500);
  }

  send(obj) {
    if (this._manualClose) return false;
    const s = JSON.stringify(obj);
    if (this.state !== 'open' || !this.ws) { this._outbox.push(s); return false; }
    this.ws.send(s);
    return true;
  }

  _flushOutbox() {
    const box = this._outbox;
    this._outbox = [];
    if (this.state === 'open' && this.ws) {
      for (const s of box) { try { this.ws.send(s); } catch {} }
    } else {
      this._outbox.unshift(...box);
    }
  }

  close() {
    this._manualClose = true;
    clearTimeout(this._reconnect);
    try { this.send({ type: 'leave', selfId: this.selfId }); } catch {}
    setTimeout(() => { try { this.ws?.close(); } catch {} }, 300);
  }
}
