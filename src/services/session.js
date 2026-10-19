const API_BASE_URL = (process.env.REACT_APP_API_URL || 'http://localhost:8000').replace(/\/$/, '');
export const ACCESS_KEY = 'assurance-access-token';
export const REFRESH_KEY = 'assurance-refresh-token';
export const TOKENS_CHANGED = 'auth:tokens';
export const SESSION_EXPIRED = 'auth:expired';

const stores = () => [window.localStorage, window.sessionStorage];

export function getAccessToken() {
  return window.localStorage.getItem(ACCESS_KEY) || window.sessionStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken() {
  return window.localStorage.getItem(REFRESH_KEY) || window.sessionStorage.getItem(REFRESH_KEY);
}

export function clearTokens() {
  stores().forEach((store) => { store.removeItem(ACCESS_KEY); store.removeItem(REFRESH_KEY); });
}

// remember = true keeps the session across browser restarts (localStorage), otherwise for the tab only.
export function saveTokens({ accessToken, refreshToken }, remember) {
  const useLocal = remember ?? Boolean(window.localStorage.getItem(ACCESS_KEY));
  clearTokens();
  const store = useLocal ? window.localStorage : window.sessionStorage;
  store.setItem(ACCESS_KEY, accessToken);
  if (refreshToken) store.setItem(REFRESH_KEY, refreshToken);
}

export function tokenExpiry(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

const originalFetch = window.fetch.bind(window);
let refreshing = null;

// Single-flight refresh: concurrent 401s share one request. Resolves to the new access token, or null.
export function refreshSession() {
  if (refreshing) return refreshing;
  const refreshToken = getRefreshToken();
  if (!refreshToken) return Promise.resolve(null);
  refreshing = (async () => {
    try {
      const response = await originalFetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (response.status === 401 || response.status === 403) {
        clearTokens();
        window.dispatchEvent(new Event(SESSION_EXPIRED));
        return null;
      }
      if (!response.ok) return null;
      const body = await response.json();
      saveTokens({ accessToken: body.access_token, refreshToken: body.refresh_token });
      window.dispatchEvent(new Event(TOKENS_CHANGED));
      return body.access_token;
    } catch {
      return null; // network error: keep the session, the next call will retry
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

let installed = false;

// Transparently refreshes the access token and replays an API request that came back 401.
export function installAuthFetch() {
  if (installed) return;
  installed = true;
  window.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    const url = typeof input === 'string' ? input : input.url;
    if (response.status !== 401 || !url.startsWith(API_BASE_URL) || /\/api\/auth\/(login|refresh)/.test(url)) return response;

    const headers = new Headers(init?.headers || (typeof input === 'string' ? undefined : input.headers));
    const sent = headers.get('Authorization');
    if (!sent?.startsWith('Bearer ')) return response;

    const stored = getAccessToken();
    const fresh = stored && `Bearer ${stored}` !== sent ? stored : await refreshSession();
    if (!fresh) return response;

    headers.set('Authorization', `Bearer ${fresh}`);
    return originalFetch(typeof input === 'string' ? input : new Request(input, { headers }), { ...init, headers });
  };
}
