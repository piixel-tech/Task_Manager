import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../services/http/accountApi';
import { useSettingsStore } from '../../store/useSettingsStore';
import { desktopPermission, sendTestNotification, showDesktopNotification } from './notificationAlerts';

interface Made {
  title: string;
  options: NotificationOptions;
  onclick: (() => void) | null;
  close: ReturnType<typeof vi.fn>;
}
let made: Made[];
let permission: NotificationPermission;
let uid = 0;
const nextId = () => `n-${++uid}`;

const lookingAtApp = (looking: boolean) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (looking ? 'visible' : 'hidden') });
  vi.spyOn(document, 'hasFocus').mockReturnValue(looking);
};

beforeEach(() => {
  made = [];
  permission = 'granted';
  localStorage.clear();
  class FakeNotification {
    static get permission() {
      return permission;
    }
    onclick: (() => void) | null = null;
    close = vi.fn();
    title: string;
    options: NotificationOptions;
    constructor(title: string, options: NotificationOptions = {}) {
      this.title = title;
      this.options = options;
      made.push(this as unknown as Made);
    }
  }
  vi.stubGlobal('Notification', FakeNotification);
  Object.defineProperty(window, 'Notification', { configurable: true, value: FakeNotification });
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, desktop_popups: true } });
  lookingAtApp(false);
});

afterEach(() => vi.restoreAllMocks());

describe('system notifications', () => {
  it('shows one when the tab is hidden, with the notification id as its tag', () => {
    const id = nextId();
    showDesktopNotification('Task assigned', 'Write copy', undefined, id);
    expect(made).toHaveLength(1);
    expect(made[0].title).toBe('Task assigned');
    expect(made[0].options.body).toBe('Write copy');
    expect(made[0].options.tag).toBe(`tm-${id}`);
  });

  it('also shows one when the tab is visible but the browser is behind another app', () => {
    lookingAtApp(true);
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    showDesktopNotification('Overdue', 'Late task', undefined, nextId());
    expect(made).toHaveLength(1);
  });

  it('stays quiet while the person is looking at the app (the toast covers it)', () => {
    lookingAtApp(true);
    showDesktopNotification('Hi', 'x', undefined, nextId());
    expect(made).toHaveLength(0);
  });

  it('respects the browser permission and the saved preference', () => {
    permission = 'default';
    showDesktopNotification('a', 'x', undefined, nextId());
    permission = 'denied';
    showDesktopNotification('b', 'x', undefined, nextId());
    permission = 'granted';
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, desktop_popups: false } });
    showDesktopNotification('c', 'x', undefined, nextId());
    expect(made).toHaveLength(0);
  });

  it('never shows the same notification twice, in this tab or in another open tab', () => {
    const id = nextId();
    showDesktopNotification('Same', 'x', undefined, id);
    showDesktopNotification('Same', 'x', undefined, id); // delivered again (reconnect)
    expect(made).toHaveLength(1);

    const other = nextId();
    localStorage.setItem(`tm.os-notified.${other}`, String(Date.now())); // another tab got there first
    showDesktopNotification('Elsewhere', 'x', undefined, other);
    expect(made).toHaveLength(1);
  });

  it('opens the task when the notification is clicked', () => {
    const focus = vi.spyOn(window, 'focus').mockImplementation(() => undefined);
    const open = vi.fn();
    showDesktopNotification('Task assigned', 'x', open, nextId());
    made[0].onclick?.();
    expect(focus).toHaveBeenCalled();
    expect(open).toHaveBeenCalledOnce();
    expect(made[0].close).toHaveBeenCalled();
  });

  it('reports the browser permission, and the test button only works when allowed', () => {
    expect(desktopPermission()).toBe('granted');
    expect(sendTestNotification()).toBe(true);
    expect(made.at(-1)?.options.tag).toBe('tm-test');
    permission = 'denied';
    expect(desktopPermission()).toBe('denied');
    expect(sendTestNotification()).toBe(false);
  });
});
