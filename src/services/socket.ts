import { API_URL, getFreshAccessToken, tokenStore } from './api';

type Handler = (data: any) => void;

const PING_EVERY_MS = 25_000;
const MAX_BACKOFF_MS = 30_000;
// The server pings every 30 s of silence. Hearing nothing for this long means the connection died without a close
// (laptop slept, wifi changed, Render restarted), so we drop it and reconnect.
const SILENCE_LIMIT_MS = 75_000;

/**
 * Single WebSocket to the backend. Reconnects with a fresh access token and exponential backoff until `disconnect()` is
 * called: after a drop, while the server is waking up, when the network comes back and when the tab becomes visible again.
 */
class SocketClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private wanted = false;
  private attempt = 0;
  private generation = 0; // bumped on every connect/disconnect so a slow open() from an earlier round gives up
  private connecting = false;
  private lastHeard = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private listening = false;

  connect(): void {
    if (this.wanted) return;
    this.wanted = true;
    this.attempt = 0;
    this.generation++;
    this.listen();
    void this.open();
  }

  disconnect(): void {
    this.wanted = false;
    this.generation++;
    this.connecting = false;
    this.clearReconnect();
    this.stopPing();
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000);
  }

  /** Send an event to the server; dropped quietly if the socket isn't open (e.g. a typing hint). */
  send(event: string, data?: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ event, data }));
  }

  /** Subscribe to a server event; returns an unsubscribe function. */
  on(event: string, handler: Handler): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  /** True while a live connection is open. */
  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private async open(): Promise<void> {
    if (!this.wanted || this.connecting || this.ws) return;
    this.connecting = true;
    const round = this.generation;
    try {
      const token = await getFreshAccessToken();
      if (round !== this.generation || !this.wanted) return; // disconnected or restarted while we waited
      if (!token) {
        // Signed out (tokens gone): stop. Otherwise the server was unreachable, so try again shortly.
        if (tokenStore.refresh) this.scheduleReconnect();
        return;
      }
      const url = `${API_URL.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(token)}`;
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        this.scheduleReconnect();
        return;
      }
      this.ws = ws;
      this.lastHeard = Date.now();

      ws.onopen = () => {
        this.attempt = 0;
        this.lastHeard = Date.now();
        this.startPing();
        // Anything missed while we were away (bell, chat, timers) is reloaded by the listeners of this event.
        this.handlers.get('socket:reconnected')?.forEach((h) => h(undefined));
      };
      ws.onmessage = (e) => {
        this.lastHeard = Date.now();
        let msg: { event?: string; data?: unknown };
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }
        if (msg.event === 'ping') ws.send(JSON.stringify({ event: 'pong' }));
        if (msg.event) this.handlers.get(msg.event)?.forEach((h) => h(msg.data));
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
        this.stopPing();
        if (this.wanted && round === this.generation) this.scheduleReconnect();
      };
    } finally {
      this.connecting = false;
    }
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private scheduleReconnect(): void {
    if (!this.wanted || this.reconnectTimer) return;
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempt++);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.open();
    }, delay);
  }

  /** Connect right now (the network is back, or the person returned to the tab) instead of waiting out the backoff. */
  private reconnectNow(): void {
    if (!this.wanted) return;
    if (this.ws && this.ws.readyState !== WebSocket.OPEN && this.ws.readyState !== WebSocket.CONNECTING) this.ws = null;
    if (this.ws) {
      // Looks open; make sure it still is. A silent connection is replaced.
      if (Date.now() - this.lastHeard > SILENCE_LIMIT_MS) this.ws.close();
      return;
    }
    this.clearReconnect();
    this.attempt = 0;
    void this.open();
  }

  private listen(): void {
    if (this.listening || typeof window === 'undefined') return;
    this.listening = true;
    window.addEventListener('online', () => this.reconnectNow());
    window.addEventListener('focus', () => this.reconnectNow());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.reconnectNow();
    });
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;
      if (Date.now() - this.lastHeard > SILENCE_LIMIT_MS) {
        this.ws.close(); // onclose schedules the reconnect
        return;
      }
      this.ws.send(JSON.stringify({ event: 'ping' }));
    }, PING_EVERY_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }
}

export const socket = new SocketClient();
