import { afterEach, describe, expect, it, vi } from 'vitest';
import { removeLegacyServiceWorkers } from './removeServiceWorkers';

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'serviceWorker');
  Reflect.deleteProperty(navigator, 'clearAppBadge');
});

describe('removing the old service worker', () => {
  it('unregisters every worker, deletes caches and clears the icon badge', async () => {
    const a = { unregister: vi.fn().mockResolvedValue(true) };
    const b = { unregister: vi.fn().mockResolvedValue(true) };
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

  it('does nothing and does not throw when there is nothing to remove or the browser lacks the features', async () => {
    await expect(removeLegacyServiceWorkers()).resolves.toBeUndefined();

    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistrations: vi.fn().mockRejectedValue(new Error('denied')) } });
    await expect(removeLegacyServiceWorkers()).resolves.toBeUndefined();
  });
});
