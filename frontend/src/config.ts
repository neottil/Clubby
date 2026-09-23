/**
 * Configurazione del frontend, letta all'avvio.
 *
 * In un ambiente deployato arriva da /config.json, servito da nginx a partire
 * da un ConfigMap generato al deploy (frontend/k8s/configmap.yaml): la stessa
 * immagine serve così qualunque club, con nome, indirizzi, colori e logo del
 * proprio ambiente. Prima erano variabili VITE_* compilate nel bundle, e ogni
 * club avrebbe richiesto una build e un'immagine proprie.
 *
 * In locale (vite dev) /config.json non esiste e si ripiega sulle VITE_* di
 * frontend/.env.local, generato da scripts/init-local.sh:
 *   VITE_API_BASE_URL    = http://localhost:3000   (obbligatoria)
 *   VITE_AUTH_BASE_URL   = http://localhost:3001   (obbligatoria)
 *   VITE_TENANT_NAME     = La mia ASD              (obbligatoria)
 *   VITE_THEME_*         colori (opzionali, vedi theme.ts)
 *   VITE_LOGO_FILE       logo in public/branding/ (opzionale)
 *   VITE_ENABLE_MODULE_TESSERAMENTO  "true" per attivare il modulo
 *   VITE_ENABLE_MODULE_FATTURAZIONE  "true" per attivare il modulo
 *
 * Attività, costi e istruttori non sono configurazione: sono dati del club,
 * gestiti dal pannello Admin e serviti dall'API (/api/attivita,
 * /api/istruttori).
 */

export interface Tema {
  primary?: string;
  primaryText?: string;
  danger?: string;
  success?: string;
  navBg?: string;
  navText?: string;
}

/**
 * Moduli opzionali: un club che non li ha attivi non ne vede né le pagine né
 * le voci di menu. Attivi solo se esplicitamente accesi, come nel backend
 * (backend/src/util/moduli.ts), che è dove il controllo conta davvero: qui si
 * evita soltanto di mostrare sezioni che risponderebbero 404.
 */
export interface Moduli {
  /** Pagina Tesseramenti e quota di tesseramento nel pannello Admin. */
  tesseramento: boolean;
  /** Pagina Fatturazione. */
  fatturazione: boolean;
}

export interface ConfigFrontend {
  apiBaseUrl: string;
  /** URL dell'authorizer: registrazione, accesso e gestione della password. */
  authBaseUrl: string;
  tenantName: string;
  tema: Tema;
  /** Percorso del logo (favicon e barra di navigazione). */
  logo: string;
  moduli: Moduli;
}

const LOGO_PREDEFINITO = '/logo.svg';

/**
 * Valorizzata da caricaConfig() prima che l'applicazione venga montata (vedi
 * main.tsx): chi la legge durante il rendering la trova sempre completa.
 */
export const config: ConfigFrontend = {
  apiBaseUrl: '',
  authBaseUrl: '',
  tenantName: '',
  tema: {},
  logo: LOGO_PREDEFINITO,
  moduli: { tesseramento: false, fatturazione: false },
};

/** /config.json se servito, altrimenti null (in locale non esiste). */
async function leggiConfigJson(): Promise<Partial<ConfigFrontend> | null> {
  try {
    const res = await fetch('/config.json', { cache: 'no-store' });
    // Controllo sul tipo: un server che risponde con index.html per ogni
    // percorso sconosciuto darebbe 200 anche senza il file.
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
    return await res.json() as Partial<ConfigFrontend>;
  } catch {
    return null;
  }
}

function daVariabiliVite(): Partial<ConfigFrontend> {
  const env = import.meta.env;
  return {
    apiBaseUrl: env.VITE_API_BASE_URL,
    authBaseUrl: env.VITE_AUTH_BASE_URL,
    tenantName: env.VITE_TENANT_NAME,
    tema: {
      primary: env.VITE_THEME_PRIMARY,
      primaryText: env.VITE_THEME_PRIMARY_TEXT,
      danger: env.VITE_THEME_DANGER,
      success: env.VITE_THEME_SUCCESS,
      navBg: env.VITE_THEME_NAV_BG,
      navText: env.VITE_THEME_NAV_TEXT,
    },
    logo: env.VITE_LOGO_FILE ? `/branding/${env.VITE_LOGO_FILE}` : '',
    moduli: {
      tesseramento: env.VITE_ENABLE_MODULE_TESSERAMENTO === 'true',
      fatturazione: env.VITE_ENABLE_MODULE_FATTURAZIONE === 'true',
    },
  };
}

/**
 * Legge la configurazione e la rende disponibile in `config`. Fallisce se
 * mancano i valori senza i quali l'app non può funzionare, invece di partire
 * e rompersi alla prima chiamata.
 */
export async function caricaConfig(): Promise<void> {
  const letta = (await leggiConfigJson()) ?? daVariabiliVite();

  const mancanti = (['apiBaseUrl', 'authBaseUrl', 'tenantName'] as const).filter(k => !letta[k]);
  if (mancanti.length > 0) {
    throw new Error(`Configurazione incompleta: mancano ${mancanti.join(', ')}.`);
  }

  Object.assign(config, {
    apiBaseUrl: letta.apiBaseUrl,
    authBaseUrl: letta.authBaseUrl,
    tenantName: letta.tenantName,
    tema: letta.tema ?? {},
    logo: letta.logo || LOGO_PREDEFINITO,
    // Non elencato fra i valori obbligatori: un config.json senza "moduli"
    // (ambiente deployato prima che i moduli esistessero) li lascia spenti,
    // che è il default voluto, invece di bloccare l'avvio dell'app.
    moduli: {
      tesseramento: letta.moduli?.tesseramento === true,
      fatturazione: letta.moduli?.fatturazione === true,
    },
  });
}

/**
 * Versione del frontend in esecuzione: il tag dell'immagine deployata, servito
 * da nginx su /version.json a partire da un ConfigMap valorizzato al deploy
 * (frontend/k8s/configmap.yaml). NON è una VITE_* compilata nel bundle: il
 * bundle è buildato una volta sola e non sa con quale tag l'immagine verrà poi
 * deployata — Promote la ri-tagga X.Y.Z senza ribuildarla.
 *
 * In locale (vite dev) il file non esiste: si ripiega su 'dev'.
 */
export async function fetchFrontendVersion(): Promise<string> {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' });
    if (!res.ok) return 'dev';
    const data = await res.json() as { version?: string };
    return data.version || 'dev';
  } catch {
    return 'dev';
  }
}

// Accesso, registrazione e gestione della sessione avvengono con chiamate
// dirette all'authorizer: vedi auth/authApi.ts.
