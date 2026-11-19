import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { friendlyMessage } from './friendlyError';

const BASE_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:8000/api/v1' : '');

const ACCESS_KEY = 'tm_access_token';
const REFRESH_KEY = 'tm_refresh_token';

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }
};

export const api = axios.create({ baseURL: BASE_URL });

// Called when the session can no longer be refreshed. The auth store registers
// itself here so this module doesn't import the store (avoids a cycle).
let onAuthFailure: () => void = () => {};
export const setAuthFailureHandler = (fn: () => void) => {
  onAuthFailure = fn;
};

export const API_URL = BASE_URL;

api.interceptors.request.use((config) => {
  const token = tokenStore.access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// One refresh at a time; concurrent 401s share the same request.
let refreshing: Promise<string> | null = null;

/** The server could not be reached or was waking up (Render sleeps): not a reason to end the session. */
export const isTransientFailure = (err: unknown): boolean => {
  if (!axios.isAxiosError(err)) return false;
  const status = err.response?.status;
  return !err.response || status === 408 || status === 429 || (status !== undefined && status >= 500);
};

const refreshAccessToken = (): Promise<string> => {
  refreshing ??= (async () => {
    const refresh = tokenStore.refresh;
    if (!refresh) throw new Error('No refresh token');
    // Plain axios so this call skips the interceptors below.
    const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refresh_token: refresh });
    tokenStore.set(data.access_token, data.refresh_token);
    return data.access_token as string;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
};

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    const isAuthCall = original?.url?.startsWith('/auth/login');
    if (error.response?.status !== 401 || !original || original._retried || isAuthCall) {
      throw error;
    }
    original._retried = true;
    try {
      const token = await refreshAccessToken();
      original.headers.Authorization = `Bearer ${token}`;
      return api(original);
    } catch (refreshError) {
      if (!isTransientFailure(refreshError)) {
        tokenStore.clear();
        onAuthFailure();
      }
      throw error;
    }
  }
);

/** Pull a readable message out of a FastAPI error response. */
export function getErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) return friendlyMessage({ networkDown: true }, fallback);
    return friendlyMessage({ status: err.response.status, detail: err.response.data?.detail }, fallback);
  }
  return err instanceof Error ? friendlyMessage({ message: err.message }, fallback) : fallback;
}

function tokenExpiresAt(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return (payload.exp ?? 0) * 1000;
  } catch {
    return 0;
  }
}

/**
 * Access token valid for at least the next 30s, refreshing if needed.
 * If the session can't be refreshed the user is logged out and this returns null. If the server just can't be reached
 * (offline, Render waking up) this also returns null but keeps the session: check `tokenStore.access` to tell the two apart.
 */
export async function getFreshAccessToken(): Promise<string | null> {
  const current = tokenStore.access;
  if (current && tokenExpiresAt(current) > Date.now() + 30_000) return current;
  try {
    return await refreshAccessToken();
  } catch (err) {
    if (!isTransientFailure(err)) {
      tokenStore.clear();
      onAuthFailure();
    }
    return null;
  }
}
