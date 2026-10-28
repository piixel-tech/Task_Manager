import { API_URL, getFreshAccessToken } from './api';

type Handler = (data: any) => void;

const PING_EVERY_MS = 25_000;
const MAX_BACKOFF_MS = 30_000;

/**
 * Single WebSocket to the backend. Reconnects with a fresh access token and
 * exponential backoff until `disconnect()` is called.
 */
class SocketClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private wanted = false;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  connect(): void {
    if (this.wanted) return;
    this.wanted = true;
    this.attempt = 0;
    void this.open();
  }

  disconnect(): void {
    this.wanted = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
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

  private async open(): Promise<void> {
    const token = await getFreshAccessToken();
    // Logged out meanwhile, or the session could not be refreshed.
    if (!this.wanted || !token) return;

    const url = `${API_URL.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.startPing();
    };
    ws.onmessage = (e) => {
      let msg: { event?: string; data?: unknown };
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.event === 'ping') ws.send(JSON.stringify({ event: 'pong' }));
      if (msg.event) this.handlers.get(msg.event)?.forEach((h) => h(msg.data));
    };
    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      this.stopPing();
      if (this.wanted) this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempt++);
    this.reconnectTimer = setTimeout(() => void this.open(), delay);
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ event: 'ping' }));
    }, PING_EVERY_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }
}

export const socket = new SocketClient();
