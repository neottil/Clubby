/* eslint-disable react-refresh/only-export-components --
 * Il file esporta il provider e l'hook useAuth che lo consuma: è il modo
 * canonico di scrivere un context React, e separarli in due file per far
 * tacere la regola peggiorerebbe il codice. L'unico effetto è che in sviluppo
 * l'hot reload ricarica il modulo intero invece del solo componente.
 */
/**
 * Contesto di autenticazione.
 *
 * Accesso con email e password contro l'authorizer (vedi authApi.ts): le
 * credenziali si inseriscono in una pagina dell'app, senza redirect verso
 * domini esterni.
 *
 * L'access token dura poco (15 minuti) e viene rinnovato con il refresh token
 * (30 giorni): un minuto prima della scadenza, al ritorno sulla scheda, e al
 * primo 401 di una chiamata API. Il refresh è revocabile lato server, quindi il
 * logout chiude davvero la sessione invece di limitarsi a dimenticare il token.
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { authApi, AuthError, type Sessione, type DatiRegistrazione } from './authApi';
import { setUnauthorizedHandler, setTokenRefresher } from '../api/client';

interface TokenSet {
  accessToken: string;
  refreshToken: string;
  /** Istante di scadenza dell'access token, in millisecondi. */
  expiresAt: number;
}

export interface AuthUser {
  sub: string;
  email: string;
  groups: string[];
  isAdmin: boolean;
  /**
   * True per chi ha il ruolo istruttore, che sia admin o no: amministrare l'app
   * e tenere incontri sono due cose indipendenti.
   */
  isIstruttore: boolean;
  /** True finché una password temporanea non è stata sostituita. */
  cambioPasswordRichiesto: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  sessionExpired: boolean;
  /**
   * L'account è collegato a una scheda socio? false finché un amministratore
   * non fa l'abbinamento; null finché non lo si è ancora saputo.
   */
  socioCollegato: boolean | null;
  /** `restaCollegato`: la sessione sopravvive alla chiusura del browser e dell'app. */
  login: (email: string, password: string, restaCollegato?: boolean) => Promise<void>;
  register: (dati: DatiRegistrazione, restaCollegato?: boolean) => Promise<void>;
  cambiaPassword: (attuale: string, nuova: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const CHIAVE_TOKEN = 'clubby_tokens';

/**
 * Dove sta la sessione (spec 012).
 *
 * Di default in sessionStorage: muore con la scheda, come prima. Con "Resta
 * collegato" in localStorage, che sopravvive alla chiusura del browser e
 * dell'app installata fino alla scadenza del refresh token. La scelta è
 * esplicita perché un PC condiviso non deve restare collegato da solo.
 */
function archivio(persistente: boolean): Storage {
  return persistente ? localStorage : sessionStorage;
}

function leggiDa(storage: Storage): TokenSet | null {
  const raw = storage.getItem(CHIAVE_TOKEN);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TokenSet;
  } catch {
    return null;
  }
}

/**
 * Legge il payload del JWT senza verificarne la firma: serve solo a sapere
 * cosa mostrare (nome, ruolo). Ogni decisione che conta è presa dal backend,
 * che la firma la verifica davvero — un token manomesso qui otterrebbe
 * un'interfaccia diversa, non dei permessi diversi.
 */
function leggiClaims(token: string): Record<string, unknown> {
  try {
    const payload = token.split('.')[1];
    const decodificato: unknown = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    // Un payload che non è un oggetto (o è null) non ha claim da leggere:
    // meglio trattarlo come vuoto che lasciar esplodere il primo accesso.
    return typeof decodificato === 'object' && decodificato !== null
      ? decodificato as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

// I claim arrivano da un token di cui qui non si verifica la firma: ogni
// campo va quindi controllato, non dato per buono. È il motivo per cui il
// tipo è `unknown` e non un'interfaccia comoda — quella descriverebbe una
// garanzia che a questo livello non esiste.
function utenteDa(token: string): AuthUser | null {
  const claims = leggiClaims(token);
  const sub = typeof claims.sub === 'string' ? claims.sub : '';
  if (!sub) return null;
  const groups: string[] = Array.isArray(claims.roles)
    ? claims.roles.filter((r): r is string => typeof r === 'string')
    : [];
  return {
    sub,
    email: typeof claims.email === 'string' ? claims.email : '',
    groups,
    isAdmin: groups.includes('admin'),
    isIstruttore: groups.includes('istruttore'),
    cambioPasswordRichiesto: claims.cambio_password_richiesto === true,
  };
}

/**
 * La sessione salvata, e se è persistente. Prima la scheda: una sessione
 * aperta qui senza "Resta collegato" vale più di una persistente lasciata da
 * un accesso precedente.
 */
function leggiTokenSalvati(): { tokenSet: TokenSet | null; persistente: boolean } {
  const diScheda = leggiDa(sessionStorage);
  if (diScheda) return { tokenSet: diScheda, persistente: false };
  const persistente = leggiDa(localStorage);
  return { tokenSet: persistente, persistente: persistente !== null };
}

/**
 * Esegue `fn` in esclusiva fra le schede e le finestre dell'app aperte sullo
 * stesso dispositivo, dove il browser lo permette (Web Locks). Serve al
 * rinnovo della sessione persistente, che tutte condividono: vedi
 * rinnovaSessione.
 */
function inEsclusiva<T>(fn: () => Promise<T>): Promise<T> {
  return navigator.locks ? navigator.locks.request('clubby-rinnovo', () => fn()) as Promise<T> : fn();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [salvati] = useState(leggiTokenSalvati);
  const [tokenSet, setTokenSet] = useState<TokenSet | null>(salvati.tokenSet);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  // true collegato, false nessun socio da collegare, null non ancora saputo
  // (sessione ripresa dal browser, o tentativo fallito).
  const [socioCollegato, setSocioCollegato] = useState<boolean | null>(null);
  const tokenTentato = useRef<string | null>(null);
  const timerRinnovo = useRef<number | null>(null);
  // I token correnti, leggibili dai callback senza aspettare un nuovo render:
  // un rinnovo innescato da una chiamata API deve usare il refresh token
  // appena ruotato, non quello catturato quando il callback è stato creato.
  const tokenRef = useRef<TokenSet | null>(tokenSet);
  // Rinnovo in corso, condiviso. Il refresh token vale una volta sola
  // (rotazione): due rinnovi in parallelo con lo stesso token farebbero
  // fallire il secondo, e l'utente verrebbe disconnesso senza motivo.
  const rinnovoInCorso = useRef<Promise<string | null> | null>(null);
  // La sessione corrente sta in localStorage ("Resta collegato")? Decisa
  // all'accesso, vale anche per i rinnovi e per il cambio password.
  const persistenteRef = useRef(salvati.persistente);

  /** Adotta in memoria una sessione già salvata (da questa o da un'altra scheda). */
  const usaSessione = useCallback((ts: TokenSet) => {
    tokenRef.current = ts;
    setTokenSet(ts);
    setSessionExpired(false);
  }, []);

  const salvaSessione = useCallback((sessione: Sessione, persistente = persistenteRef.current) => {
    const ts: TokenSet = {
      accessToken: sessione.access_token,
      refreshToken: sessione.refresh_token,
      expiresAt: Date.now() + sessione.expires_in * 1000,
    };
    persistenteRef.current = persistente;
    archivio(persistente).setItem(CHIAVE_TOKEN, JSON.stringify(ts));
    // Una sessione sola: passando da un modo all'altro non resta indietro
    // quella vecchia, che al prossimo avvio verrebbe ripresa al posto di questa.
    archivio(!persistente).removeItem(CHIAVE_TOKEN);
    usaSessione(ts);
  }, [usaSessione]);

  const pulisci = useCallback(() => {
    // Da entrambi: "Esci" deve chiudere anche una sessione persistente, e le
    // altre schede la vedono sparire (evento storage, sotto).
    sessionStorage.removeItem(CHIAVE_TOKEN);
    localStorage.removeItem(CHIAVE_TOKEN);
    tokenRef.current = null;
    setTokenSet(null);
    setSocioCollegato(null);
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
   * Rinnova la sessione con il refresh token e restituisce il nuovo access
   * token, o null se non si può. Unico punto di rinnovo: lo usano il timer, il
   * ritorno sulla scheda e il client API su un 401, e chiamate concorrenti
   * ricevono lo stesso esito invece di consumare due volte lo stesso token.
   */
  const rinnovaSessione = useCallback((): Promise<string | null> => {
    if (rinnovoInCorso.current) return rinnovoInCorso.current;
    if (!tokenRef.current) return Promise.resolve(null);

    /**
     * Con "Resta collegato" la sessione è una sola per tutte le schede e le
     * finestre dell'app aperte sul dispositivo, e il refresh token vale una
     * volta sola: se due rinnovassero insieme, la seconda verrebbe respinta e
     * disconnetterebbe tutti. Il rinnovo avviene quindi in esclusiva, e chi
     * arriva per secondo trova in localStorage la sessione già rinnovata
     * dall'altra e la adotta invece di rinnovare di nuovo.
     */
    const giaRinnovataAltrove = (): TokenSet | null => {
      if (!persistenteRef.current) return null;
      const salvata = leggiDa(localStorage);
      return salvata && salvata.refreshToken !== tokenRef.current?.refreshToken ? salvata : null;
    };

    rinnovoInCorso.current = inEsclusiva(async () => {
      const altrove = giaRinnovataAltrove();
      if (altrove) {
        usaSessione(altrove);
        if (altrove.expiresAt - Date.now() > 60_000) return altrove.accessToken;
      }
      const attuale = tokenRef.current;
      if (!attuale) return null;
      try {
        const sessione = await authApi.rinnova(attuale.refreshToken);
        salvaSessione(sessione);
        return sessione.access_token;
      } catch (e) {
        // Authorizer irraggiungibile: la sessione potrebbe essere ancora
        // valida, disconnettere sarebbe sbagliato. Si riproverà alla prossima
        // chiamata o al ritorno sulla scheda.
        if (e instanceof AuthError && e.status === 0) return null;
        // Respinto perché un'altra scheda, senza Web Locks, ha rinnovato nel
        // frattempo: la sua sessione è buona.
        const nelFrattempo = giaRinnovataAltrove();
        if (nelFrattempo) {
          usaSessione(nelFrattempo);
          return nelFrattempo.accessToken;
        }
        // Il refresh token è scaduto o è stato revocato (logout altrove,
        // cambio password, disattivazione): non c'è modo di recuperare in
        // silenzio, serve un nuovo accesso.
        pulisci();
        setSessionExpired(true);
        return null;
      }
    }).finally(() => {
      rinnovoInCorso.current = null;
    });
    return rinnovoInCorso.current;
  }, [salvaSessione, usaSessione, pulisci]);

  /**
   * Sessione persistente cambiata da un'altra scheda o finestra dell'app:
   * rinnovata, e allora si usa la nuova; chiusa con "Esci", e allora si esce
   * anche qui. Il browser manda l'evento solo alle ALTRE schede, e solo per
   * localStorage: le sessioni di scheda non ne sono toccate.
   */
  useEffect(() => {
    const allineaAltreSchede = (e: StorageEvent) => {
      if (e.storageArea !== localStorage || e.key !== CHIAVE_TOKEN) return;
      // Chi ha una sessione di scheda la tiene: è un accesso diverso.
      if (tokenRef.current && !persistenteRef.current) return;
      const nuova = e.newValue ? leggiDa(localStorage) : null;
      if (nuova) {
        persistenteRef.current = true;
        usaSessione(nuova);
      } else if (tokenRef.current) {
        pulisci();
      }
    };
    window.addEventListener('storage', allineaAltreSchede);
    return () => window.removeEventListener('storage', allineaAltreSchede);
  }, [usaSessione, pulisci]);

  useEffect(() => {
    setTokenRefresher(rinnovaSessione);
    return () => setTokenRefresher(null);
  }, [rinnovaSessione]);

  /**
   * Rinnova l'access token un minuto prima della scadenza. Il margine evita
   * che una richiesta partita mentre il token sta scadendo arrivi al backend
   * già scaduta.
   */
  useEffect(() => {
    if (!tokenSet) return;

    const fraQuanto = Math.max(0, tokenSet.expiresAt - Date.now() - 60_000);
    timerRinnovo.current = window.setTimeout(() => { void rinnovaSessione(); }, fraQuanto);

    return () => {
      if (timerRinnovo.current) clearTimeout(timerRinnovo.current);
    };
  }, [tokenSet, rinnovaSessione]);

  /**
   * Il timer non basta da solo: con la scheda in secondo piano o il computer
   * in sospensione il browser lo congela. Al ritorno (scheda di nuovo visibile
   * o rete di nuovo disponibile) si rinnova subito se il token è scaduto o
   * sta per scadere, prima che l'utente faccia qualcosa.
   */
  useEffect(() => {
    const controlla = () => {
      const attuale = tokenRef.current;
      if (document.visibilityState !== 'visible' || !attuale) return;
      if (attuale.expiresAt - Date.now() < 60_000) void rinnovaSessione();
    };
    document.addEventListener('visibilitychange', controlla);
    window.addEventListener('online', controlla);
    return () => {
      document.removeEventListener('visibilitychange', controlla);
      window.removeEventListener('online', controlla);
    };
  }, [rinnovaSessione]);

  /**
   * Chiede al backend se questo account ha una scheda socio collegata.
   *
   * Sola lettura: il collegamento lo fa un amministratore, mai l'applicazione
   * da sé. Serve a sapere se mostrare l'avviso "account non ancora collegato",
   * e viene richiesto a ogni accesso perché nel frattempo un admin può aver
   * fatto l'abbinamento.
   */
  const verificaSocio = useCallback(async (accessToken: string) => {
    // Una verifica per token: senza, l'effetto qui sotto e la chiamata fatta
    // subito dopo l'accesso partirebbero tutte e due.
    tokenTentato.current = accessToken;
    try {
      const { createApiClient } = await import('../api/client');
      const socio = await createApiClient(accessToken).getStatoSocio();
      // 204 (nessuna scheda collegata) arriva qui come undefined.
      setSocioCollegato(socio !== undefined);
    } catch (err) {
      // Non è un motivo per bloccare l'accesso: si riproverà al prossimo.
      console.warn('[auth] Stato del collegamento al socio non verificabile:', err);
      setSocioCollegato(null);
    }
  }, []);

  const login = useCallback(async (email: string, password: string, restaCollegato = false) => {
    setIsLoading(true);
    try {
      const sessione = await authApi.login(email, password);
      salvaSessione(sessione, restaCollegato);
      await verificaSocio(sessione.access_token);
    } finally {
      setIsLoading(false);
    }
  }, [salvaSessione, verificaSocio]);

  /**
   * Registra l'account sull'authorizer. La scheda socio non viene creata né
   * collegata: è un'operazione che spetta a un amministratore, e fino ad
   * allora l'account esiste ma non vede dati.
   */
  const register = useCallback(async (dati: DatiRegistrazione, restaCollegato = false) => {
    setIsLoading(true);
    try {
      const sessione = await authApi.registra(dati);
      salvaSessione(sessione, restaCollegato);
      await verificaSocio(sessione.access_token);
    } finally {
      setIsLoading(false);
    }
  }, [salvaSessione, verificaSocio]);

  /**
   * Sessione ripresa dal browser (ricarica della pagina, app riaperta): lo stato del
   * collegamento non è noto in questo giro, quindi si chiede ora. Una volta
   * per token, così il rinnovo periodico non lo ripete.
   */
  useEffect(() => {
    if (!tokenSet) {
      tokenTentato.current = null;
      return;
    }
    if (tokenTentato.current === tokenSet.accessToken) return;
    void verificaSocio(tokenSet.accessToken);
  }, [tokenSet, verificaSocio]);

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
      socioCollegato,
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
