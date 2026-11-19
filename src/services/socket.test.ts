import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const token = vi.hoisted(() => ({ fresh: vi.fn(), refresh: 'r' as string | null }));
vi.mock('./api', () => ({
  API_URL: 'http://api.test/api/v1',
  getFreshAccessToken: token.fresh,
  tokenStore: {
    get refresh() {
      return token.refresh;
    }
  }
}));

class FakeSocket {
  static all: FakeSocket[] = [];
  static OPEN = 1;
  static CONNECTING = 0;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  url: string;
  constructor(url: string) {
    this.url = url;
    FakeSocket.all.push(this);
  }
  send() {}
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

let socket: (typeof import('./socket'))['socket'];

beforeEach(async () => {
  vi.useFakeTimers();
  FakeSocket.all = [];
  token.fresh.mockReset();
  token.refresh = 'r';
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.resetModules();
  ({ socket } = await import('./socket'));
});
afterEach(() => {
  socket.disconnect();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('realtime connection', () => {
  it('keeps trying when the server is unreachable (Render waking up) and connects once it answers', async () => {
    token.fresh.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue('tok');
    socket.connect();
    await flush();
    expect(FakeSocket.all).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(FakeSocket.all).toHaveLength(1);
    expect(FakeSocket.all[0].url).toBe('ws://api.test/api/v1/ws?token=tok');
  });

  it('stops for good when the person is signed out', async () => {
    token.fresh.mockResolvedValue(null);
    token.refresh = null;
    socket.connect();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.all).toHaveLength(0);
  });

  it('reconnects after a drop, and tells listeners so they can reload what they missed', async () => {
    token.fresh.mockResolvedValue('tok');
    const seen = vi.fn();
    socket.on('socket:reconnected', seen);
    socket.connect();
    await flush();
    FakeSocket.all[0].open();
    FakeSocket.all[0].close();
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeSocket.all).toHaveLength(2);
    FakeSocket.all[1].open();
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('opens one socket even when connect, disconnect, connect happen back to back (React StrictMode)', async () => {
    token.fresh.mockResolvedValue('tok');
    socket.connect();
    socket.disconnect();
    socket.connect();
    await flush();
    await vi.advanceTimersByTimeAsync(50);
    expect(FakeSocket.all).toHaveLength(1);
  });

  it('replaces a connection that went silent when the person comes back to the tab', async () => {
    token.fresh.mockResolvedValue('tok');
    socket.connect();
    await flush();
    FakeSocket.all[0].open();
    vi.setSystemTime(Date.now() + 5 * 60_000);
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeSocket.all.length).toBeGreaterThanOrEqual(2);
  });
});
