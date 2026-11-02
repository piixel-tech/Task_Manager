import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

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
    } catch {
      tokenStore.clear();
      onAuthFailure();
      throw error;
    }
  }
);

/** Pull a readable message out of a FastAPI error response. */
export function getErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) return 'Cannot reach the server. Please try again.';
    const detail = err.response.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
  }
  return err instanceof Error ? err.message : fallback;
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
 * If the session can't be refreshed the user is logged out and this returns null.
 */
export async function getFreshAccessToken(): Promise<string | null> {
  const current = tokenStore.access;
  if (current && tokenExpiresAt(current) > Date.now() + 30_000) return current;
  try {
    return await refreshAccessToken();
  } catch {
    tokenStore.clear();
    onAuthFailure();
    return null;
  }
}
