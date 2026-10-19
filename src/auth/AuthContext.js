import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { currentUserRequest, loginRequest } from '../services/authApi';
import {
  SESSION_EXPIRED, TOKENS_CHANGED, clearTokens as clearStoredToken, getAccessToken as getStoredToken,
  installAuthFetch, refreshSession, saveTokens, tokenExpiry,
} from '../services/session';

installAuthFetch();

const AuthContext = createContext(null);
const REFRESH_MARGIN_MS = 60 * 1000;

function normalizeUser(user) {
  if (!user || !user.username) throw new Error('Le serveur a renvoye un profil utilisateur invalide.');
  const role = typeof user.role === 'string' ? user.role.toLowerCase() : null;
  return {
    name: user.username,
    username: user.username,
    lieu: user.lieu ?? null,
    role: role === 'admin' || role === 'member' ? role : null,
    isAdmin: String(user.username).trim().toLowerCase() === 'admin',
  };
}

export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(getStoredToken);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(getStoredToken()));

  useEffect(() => {
    let active = true;
    const token = getStoredToken();
    if (!token) {
      setIsLoading(false);
      return () => { active = false; };
    }

    currentUserRequest(token)
      .then((response) => {
        if (active) setUser(normalizeUser(response));
      })
      .catch(() => {
        clearStoredToken();
        if (active) {
          setAccessToken(null);
          setUser(null);
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => { active = false; };
  }, []);

  // Keep the in-memory token in sync when the session is refreshed, and drop the user if the refresh token is rejected.
  useEffect(() => {
    const sync = () => setAccessToken(getStoredToken());
    const expire = () => { setAccessToken(null); setUser(null); };
    window.addEventListener(TOKENS_CHANGED, sync);
    window.addEventListener(SESSION_EXPIRED, expire);
    return () => {
      window.removeEventListener(TOKENS_CHANGED, sync);
      window.removeEventListener(SESSION_EXPIRED, expire);
    };
  }, []);

  // Refresh shortly before the access token expires so the user never gets signed out while working.
  useEffect(() => {
    if (!accessToken) return undefined;
    const expiry = tokenExpiry(accessToken);
    if (!expiry) return undefined;
    const timer = window.setTimeout(refreshSession, Math.max(expiry - Date.now() - REFRESH_MARGIN_MS, 5000));
    return () => window.clearTimeout(timer);
  }, [accessToken]);

  async function login({ username, password, remember }) {
    const response = await loginRequest(username.trim(), password);
    if (!response.access_token || !response.user) throw new Error('Reponse de connexion incomplete.');

    const signedInUser = normalizeUser(response.user);
    saveTokens({ accessToken: response.access_token, refreshToken: response.refresh_token }, Boolean(remember));
    setAccessToken(response.access_token);
    setUser(signedInUser);
    return signedInUser;
  }

  function logout() {
    clearStoredToken();
    setAccessToken(null);
    setUser(null);
  }

  const value = useMemo(() => ({ accessToken, user, isLoading, login, logout }), [accessToken, user, isLoading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
