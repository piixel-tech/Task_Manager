import {
  INITIAL_USERS,
  INITIAL_PROJECTS,
  INITIAL_TASKS,
  INITIAL_HOLIDAYS,
  INITIAL_ATTENDANCE,
  INITIAL_CHAT_ROOMS,
  INITIAL_MESSAGES
} from '../../data/seed';

const KEYS = {
  USERS: 'tm_users',
  PROJECTS: 'tm_projects',
  TASKS: 'tm_tasks',
  HOLIDAYS: 'tm_holidays',
  ATTENDANCE: 'tm_attendance',
  CHAT_ROOMS: 'tm_chat_rooms',
  MESSAGES: 'tm_messages',
  CLIENT_INVITES: 'tm_client_invites',
  CURRENT_USER: 'tm_current_user',
  WEEK_OFFS: 'tm_week_offs',
  GAMIFICATION: 'tm_gamification',
  DAILY_UPDATES: 'tm_daily_updates',
  KUDOS: 'tm_kudos',
  PAUSE_REASONS: 'tm_pause_reasons',
  TEAM_GOAL: 'tm_team_goal',
  NOTIFICATIONS: 'tm_notifications',
  /** "sent today" keys that stop the date-based checks from duplicating. */
  NOTIFICATION_KEYS: 'tm_notification_keys',
  SHIFT_START: 'tm_shift_start'
};

const STORAGE_VERSION_KEY = 'tm_storage_version';
const CURRENT_STORAGE_VERSION = 'v7_fresh_start';

export const delay = (ms = 80) => new Promise((res) => setTimeout(res, ms));

export function initializeStorage(forceReset = false) {
  if (typeof localStorage === 'undefined') return;

  const version = localStorage.getItem(STORAGE_VERSION_KEY);
  if (forceReset || version !== CURRENT_STORAGE_VERSION) {
    localStorage.setItem(STORAGE_VERSION_KEY, CURRENT_STORAGE_VERSION);
    localStorage.setItem(KEYS.USERS, JSON.stringify(INITIAL_USERS));
    localStorage.setItem(KEYS.PROJECTS, JSON.stringify(INITIAL_PROJECTS));
    localStorage.setItem(KEYS.TASKS, JSON.stringify(INITIAL_TASKS));
    localStorage.setItem(KEYS.HOLIDAYS, JSON.stringify(INITIAL_HOLIDAYS));
    localStorage.setItem(KEYS.ATTENDANCE, JSON.stringify(INITIAL_ATTENDANCE));
    localStorage.setItem(KEYS.CHAT_ROOMS, JSON.stringify(INITIAL_CHAT_ROOMS));
    localStorage.setItem(KEYS.MESSAGES, JSON.stringify(INITIAL_MESSAGES));
    localStorage.setItem(KEYS.WEEK_OFFS, JSON.stringify([0, 6])); // Sun, Sat
    localStorage.removeItem(KEYS.CURRENT_USER);
    localStorage.removeItem('tm_simulated_date');
    localStorage.removeItem(KEYS.GAMIFICATION);
    localStorage.removeItem(KEYS.DAILY_UPDATES);
    localStorage.removeItem(KEYS.KUDOS);
    localStorage.removeItem(KEYS.PAUSE_REASONS);
    localStorage.removeItem(KEYS.TEAM_GOAL);
    localStorage.removeItem(KEYS.CLIENT_INVITES);
    localStorage.removeItem(KEYS.NOTIFICATIONS);
    localStorage.removeItem(KEYS.NOTIFICATION_KEYS);
  } else {
    // Safety check: ensure admin user is present if user list was emptied
    const currentUsersRaw = localStorage.getItem(KEYS.USERS);
    let currentUsers: any[] = currentUsersRaw ? JSON.parse(currentUsersRaw) : [];
    if (!currentUsers.some((u) => u.role === 'admin')) {
      currentUsers.unshift(...INITIAL_USERS);
      localStorage.setItem(KEYS.USERS, JSON.stringify(currentUsers));
    }
  }
}

// ensure storage initialized on file load
initializeStorage();

export function getStoredData<T>(key: string): T {
  initializeStorage();
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  return raw ? JSON.parse(raw) : ([] as unknown as T);
}

export function setStoredData<T>(key: string, data: T): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(key, JSON.stringify(data));
  }
}

export { KEYS };
