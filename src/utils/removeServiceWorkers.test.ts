import { afterEach, describe, expect, it, vi } from 'vitest';
import { removeLegacyServiceWorkers } from './removeServiceWorkers';

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'serviceWorker');
  Reflect.deleteProperty(navigator, 'clearAppBadge');
});

describe('removing the old service worker', () => {
  it('unregisters every other worker, deletes caches and clears the icon badge', async () => {
    const a = { unregister: vi.fn().mockResolvedValue(true), active: { scriptURL: 'http://localhost/old-sw.js' } };
    const b = { unregister: vi.fn().mockResolvedValue(true), active: { scriptURL: 'http://localhost/workbox-sw.js' } };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistrations: vi.fn().mockResolvedValue([a, b]) } });
    const del = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('caches', { keys: vi.fn().mockResolvedValue(['x', 'y']), delete: del });
    const clear = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clearAppBadge: clear });

    await removeLegacyServiceWorkers();

    expect(a.unregister).toHaveBeenCalledTimes(1);
    expect(b.unregister).toHaveBeenCalledTimes(1);
    expect(del.mock.calls.map((c) => c[0])).toEqual(['x', 'y']);
    expect(clear).toHaveBeenCalled();
  });

  it('keeps the notifications worker at /sw.js, whichever state it is in', async () => {
    const keep = { unregister: vi.fn(), active: { scriptURL: 'https://app.example.com/sw.js' } };
    const installing = { unregister: vi.fn(), installing: { scriptURL: 'https://app.example.com/sw.js' } };
    const stale = { unregister: vi.fn().mockResolvedValue(true), active: { scriptURL: 'https://app.example.com/other.js' } };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistrations: vi.fn().mockResolvedValue([keep, installing, stale]) } });
    await removeLegacyServiceWorkers();
    expect(keep.unregister).not.toHaveBeenCalled();
    expect(installing.unregister).not.toHaveBeenCalled();
    expect(stale.unregister).toHaveBeenCalledTimes(1);
  });

  it('does nothing and does not throw when there is nothing to remove or the browser lacks the features', async () => {
    await expect(removeLegacyServiceWorkers()).resolves.toBeUndefined();

    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistrations: vi.fn().mockRejectedValue(new Error('denied')) } });
    await expect(removeLegacyServiceWorkers()).resolves.toBeUndefined();
  });
});
