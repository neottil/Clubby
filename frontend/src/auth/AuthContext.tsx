/**
 * Contesto di autenticazione Keycloak (Authorization Code Flow + PKCE)
 */

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { config, getKeycloakAuthorizeUrl, getKeycloakLogoutUrl, getKeycloakRegistrationUrl, getKeycloakTokenUrl } from '../config';
import { setUnauthorizedHandler } from '../api/client';

interface TokenSet {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresAt: number; // timestamp ms
}

interface AuthUser {
  sub: string;
  email: string;
  groups: string[];
  isAdmin: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  sessionExpired: boolean;
  login: () => void;
  register: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'cm_tokens';
const REDIRECT_URI = `${window.location.origin}/callback`;

// ---------------------------------------------------------------
// JWT decode (payload only, no signature check — già validato da Keycloak)
// ---------------------------------------------------------------
function decodeJwt(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
}

function parseUser(accessToken: string): AuthUser {
  const claims = decodeJwt(accessToken) as any;
  // Keycloak uses realm_access.roles
  let groups: string[] = [];
  if (claims.realm_access?.roles) {
    groups = Array.isArray(claims.realm_access.roles)
      ? claims.realm_access.roles
      : [claims.realm_access.roles];
  }
  return {
    sub:     claims.sub ?? '',
    email:   claims.email ?? claims.preferred_username ?? '',
    groups,
    isAdmin: groups.includes('admin'),
  };
}

// PKCE helpers
async function generateCodeVerifier(): Promise<string> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ---------------------------------------------------------------
// Provider
// ---------------------------------------------------------------
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [tokenSet, setTokenSet] = useState<TokenSet | null>(() => {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const exchangeStarted = useRef(false);

  const saveTokens = (ts: TokenSet) => {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify(ts));
    setTokenSet(ts);
  };

  const clearTokens = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    setTokenSet(null);
  };

  // Registra l'handler globale: ogni chiamata API che riceve 401 pulisce i
  // token e segnala la sessione scaduta, indipendentemente da quale pagina
  // ha effettuato la chiamata (vedi api/client.ts).
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearTokens();
      setSessionExpired(true);
    });
    return () => setUnauthorizedHandler(() => {});
  }, []);

  // Scambia authorization code con token e registra il socio nel DB
  const exchangeCode = useCallback(async (code: string) => {
    setIsLoading(true);
    try {
      const verifier = sessionStorage.getItem('cm_pkce_verifier');
      if (!verifier) throw new Error('PKCE verifier mancante');

      const body = new URLSearchParams({
        grant_type:    'authorization_code',
        client_id:     config.keycloakClientId,
        code,
        redirect_uri:  REDIRECT_URI,
        code_verifier: verifier,
      });

      const res = await fetch(getKeycloakTokenUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      if (!res.ok) throw new Error('Token exchange fallito');

      const data = await res.json();
      sessionStorage.removeItem('cm_pkce_verifier');

      saveTokens({
        accessToken:  data.access_token,
        idToken:      data.id_token,
        refreshToken: data.refresh_token,
        expiresAt:    Date.now() + data.expires_in * 1000,
      });

      // Crea il socio nel DB (idempotente: se esiste già restituisce quello esistente)
      const claims = decodeJwt(data.id_token) as any;
      await fetch(`${config.apiBaseUrl}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${data.access_token}`,
        },
        body: JSON.stringify({
          nome:    claims.given_name  ?? '',
          cognome: claims.family_name ?? '',
          email:   claims.email       ?? '',
        }),
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Gestisce il callback OAuth al mount della pagina /callback
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    if (code && window.location.pathname === '/callback') {
      if (exchangeStarted.current) return;
      exchangeStarted.current = true;
      exchangeCode(code);
    }
  }, [exchangeCode]);

  const login = useCallback(async () => {
    setSessionExpired(false);
    const verifier   = await generateCodeVerifier();
    const challenge  = await generateCodeChallenge(verifier);
    sessionStorage.setItem('cm_pkce_verifier', verifier);
    window.location.href = getKeycloakAuthorizeUrl(REDIRECT_URI) +
      `&code_challenge=${challenge}&code_challenge_method=S256`;
  }, []);

  const register = useCallback(async () => {
    const verifier   = await generateCodeVerifier();
    const challenge  = await generateCodeChallenge(verifier);
    sessionStorage.setItem('cm_pkce_verifier', verifier);
    window.location.href = getKeycloakRegistrationUrl(REDIRECT_URI) +
      `&code_challenge=${challenge}&code_challenge_method=S256`;
  }, []);

  const logout = useCallback(() => {
    setSessionExpired(false);
    clearTokens();
    window.location.href = getKeycloakLogoutUrl(`${window.location.origin}/`);
  }, []);

  const user   = tokenSet ? parseUser(tokenSet.accessToken) : null;
  const token  = tokenSet?.accessToken ?? null;

  return (
    <AuthContext.Provider value={{ user, token, isLoading, sessionExpired, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve essere usato dentro AuthProvider');
  return ctx;
}
