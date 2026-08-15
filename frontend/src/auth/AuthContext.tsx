/**
 * Contesto di autenticazione.
 *
 * Accesso con email e password contro l'authorizer (vedi authApi.ts), al posto
 * del flusso OIDC + PKCE che passava da Keycloak: non c'è più un redirect a un
 * dominio esterno, le credenziali si inseriscono in una pagina dell'app.
 *
 * L'access token dura poco (15 minuti) e viene rinnovato con il refresh token
 * prima della scadenza; il refresh è revocabile lato server, quindi il logout
 * chiude davvero la sessione invece di limitarsi a dimenticare il token.
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { authApi, type Sessione, type DatiRegistrazione } from './authApi';
import { setUnauthorizedHandler } from '../api/client';

interface TokenSet {
  accessToken: string;
  refreshToken: string;
  /** Istante di scadenza dell'access token, in millisecondi. */
  expiresAt: number;
}

export interface AuthUser {
  sub: string;
  email: string;
  nome: string;
  cognome: string;
  groups: string[];
  isAdmin: boolean;
  /** True finché una password temporanea non è stata sostituita. */
  cambioPasswordRichiesto: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  sessionExpired: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (dati: DatiRegistrazione) => Promise<void>;
  cambiaPassword: (attuale: string, nuova: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const CHIAVE_TOKEN = 'clubby_tokens';

/**
 * Legge il payload del JWT senza verificarne la firma: serve solo a sapere
 * cosa mostrare (nome, ruolo). Ogni decisione che conta è presa dal backend,
 * che la firma la verifica davvero — un token manomesso qui otterrebbe
 * un'interfaccia diversa, non dei permessi diversi.
 */
function leggiClaims(token: string): Record<string, any> {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return {};
  }
}

function utenteDa(token: string): AuthUser | null {
  const claims = leggiClaims(token);
  if (!claims.sub) return null;
  const groups: string[] = Array.isArray(claims.roles) ? claims.roles : [];
  return {
    sub: claims.sub,
    email: claims.email ?? '',
    nome: claims.nome ?? '',
    cognome: claims.cognome ?? '',
    groups,
    isAdmin: groups.includes('admin'),
    cambioPasswordRichiesto: claims.cambio_password_richiesto === true,
  };
}

function leggiTokenSalvati(): TokenSet | null {
  const raw = sessionStorage.getItem(CHIAVE_TOKEN);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TokenSet;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [tokenSet, setTokenSet] = useState<TokenSet | null>(leggiTokenSalvati);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const timerRinnovo = useRef<number | null>(null);

  const salvaSessione = useCallback((sessione: Sessione) => {
    const ts: TokenSet = {
      accessToken: sessione.access_token,
      refreshToken: sessione.refresh_token,
      expiresAt: Date.now() + sessione.expires_in * 1000,
    };
    sessionStorage.setItem(CHIAVE_TOKEN, JSON.stringify(ts));
    setTokenSet(ts);
    setSessionExpired(false);
  }, []);

  const pulisci = useCallback(() => {
    sessionStorage.removeItem(CHIAVE_TOKEN);
    setTokenSet(null);
    if (timerRinnovo.current) {
      clearTimeout(timerRinnovo.current);
      timerRinnovo.current = null;
    }
  }, []);

  // Una chiamata API che riceve 401 significa che il token non vale più:
  // pulisce e segnala la sessione scaduta, da qualunque pagina sia partita.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      pulisci();
      setSessionExpired(true);
    });
    return () => setUnauthorizedHandler(() => {});
  }, [pulisci]);

  /**
   * Rinnova l'access token un minuto prima della scadenza. Il margine evita
   * che una richiesta partita mentre il token sta scadendo arrivi al backend
   * già scaduta.
   */
  useEffect(() => {
    if (!tokenSet) return;

    const fraQuanto = Math.max(0, tokenSet.expiresAt - Date.now() - 60_000);
    timerRinnovo.current = window.setTimeout(async () => {
      try {
        salvaSessione(await authApi.rinnova(tokenSet.refreshToken));
      } catch {
        // Il refresh token è scaduto o è stato revocato (logout altrove,
        // cambio password, disattivazione): non c'è modo di recuperare in
        // silenzio, serve un nuovo accesso.
        pulisci();
        setSessionExpired(true);
      }
    }, fraQuanto);

    return () => {
      if (timerRinnovo.current) clearTimeout(timerRinnovo.current);
    };
  }, [tokenSet, salvaSessione, pulisci]);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      salvaSessione(await authApi.login(email, password));
    } finally {
      setIsLoading(false);
    }
  }, [salvaSessione]);

  /**
   * Registra l'account sull'authorizer e crea subito il socio corrispondente
   * sul backend applicativo. I due passaggi sono distinti perché i due
   * servizi hanno database separati: l'account nasce nell'authorizer, il
   * socio nell'app, e a legarli è il `sub` del token.
   */
  const register = useCallback(async (dati: DatiRegistrazione) => {
    setIsLoading(true);
    try {
      const sessione = await authApi.registra(dati);
      salvaSessione(sessione);

      // Se questa chiamata fallisce, l'account esiste ma il socio no: al
      // prossimo accesso l'app la ripete (è idempotente lato backend), quindi
      // non si blocca la registrazione per un errore recuperabile.
      try {
        const { createApiClient } = await import('../api/client');
        await createApiClient(sessione.access_token).registraSocio({
          nome: dati.nome,
          cognome: dati.cognome,
          email: dati.email,
          telefono: dati.telefono,
        });
      } catch (err) {
        console.warn('[auth] Creazione del socio rimandata al prossimo accesso:', err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [salvaSessione]);

  const cambiaPassword = useCallback(async (attuale: string, nuova: string) => {
    if (!tokenSet) throw new Error('Sessione non attiva');
    setIsLoading(true);
    try {
      // Il cambio password revoca tutte le sessioni: l'authorizer ne
      // restituisce una nuova, che va salvata subito o l'utente si
      // ritroverebbe disconnesso.
      salvaSessione(await authApi.cambiaPassword(tokenSet.accessToken, attuale, nuova));
    } finally {
      setIsLoading(false);
    }
  }, [tokenSet, salvaSessione]);

  const logout = useCallback(() => {
    const refresh = tokenSet?.refreshToken;
    pulisci();
    setSessionExpired(false);
    // Revoca il refresh token lato server senza attendere l'esito: la
    // sessione locale è già chiusa, e se la chiamata fallisce il token scade
    // comunque da solo.
    if (refresh) authApi.logout(refresh).catch(() => {});
  }, [tokenSet, pulisci]);

  const user = tokenSet ? utenteDa(tokenSet.accessToken) : null;

  return (
    <AuthContext.Provider value={{
      user,
      token: tokenSet?.accessToken ?? null,
      isLoading,
      sessionExpired,
      login,
      register,
      cambiaPassword,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve essere usato dentro AuthProvider');
  return ctx;
}
