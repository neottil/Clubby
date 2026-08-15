/**
 * Configurazione runtime del frontend.
 * I valori vengono iniettati come variabili d'ambiente Vite al build time.
 *
 * Variabili necessarie:
 *
 * Locale (docker-compose / .env.local):
 *   VITE_API_BASE_URL          = http://localhost:3000   (obbligatoria)
 *   VITE_AUTH_BASE_URL         = http://localhost:3001   (obbligatoria)
 *   VITE_TENANT_NAME           = La mia ASD              (obbligatoria)
 *   VITE_ACTIVITY_SELECT_VALUES_MAPPING = JSON {"Attività": costoDefault, ...} (opzionale)
 *   VITE_SELECT_ISTRUTTORI_VALUES = Luca,Elisabetta,Marco (opzionale)
 *
 * Produzione:
 *   VITE_API_BASE_URL          = https://<dominio>/api
 *   VITE_AUTH_BASE_URL         = https://auth.<dominio>
 *   VITE_TENANT_NAME           = La mia ASD              (obbligatoria)
 *   VITE_ACTIVITY_SELECT_VALUES_MAPPING = JSON {"Attività": costoDefault, ...} (opzionale)
 *   VITE_SELECT_ISTRUTTORI_VALUES = Luca,Elisabetta,Marco (opzionale)
 */

function requireEnv(name: string): string {
  const value = import.meta.env[name];
  if (!value) {
    throw new Error(`[config] Variabile d'ambiente obbligatoria non impostata: ${name}`);
  }
  return value as string;
}

/**
 * Mapping "attività" → costo di default, da VITE_ACTIVITY_SELECT_VALUES_MAPPING
 * (JSON, es. {"Dog Dance": 20, "Mantrailing": 20}). Opzionale: se assente o
 * malformata, restituisce un mapping vuoto (nessun blocco dell'app) e avvisa
 * in console.
 */
/**
 * Elenco degli istruttori selezionabili, da VITE_SELECT_ISTRUTTORI_VALUES
 * (lista separata da virgole, es. "Luca,Elisabetta,Marco").
 *
 * Opzionale, e l'assenza è significativa: un tenant con un solo istruttore non
 * la configura, e allora il campo non viene mostrato da nessuna parte (form,
 * tabella incontri) e il resoconto presenta un unico prospetto senza
 * intestazione per istruttore. Vedi IncontriPage e ResocontoPage.
 */
function parseIstruttori(): string[] {
  const raw = import.meta.env.VITE_SELECT_ISTRUTTORI_VALUES;
  if (!raw) return [];
  return (raw as string)
    .split(',')
    .map(nome => nome.trim())
    .filter(Boolean);
}

function parseActivityMapping(): Record<string, number> {
  const raw = import.meta.env.VITE_ACTIVITY_SELECT_VALUES_MAPPING;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw as string);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('deve essere un oggetto JSON piatto {"Attività": costo}');
    }
    return parsed as Record<string, number>;
  } catch (err) {
    console.warn('[config] VITE_ACTIVITY_SELECT_VALUES_MAPPING non valida, ignorata:', err);
    return {};
  }
}

export const config = {
  apiBaseUrl:           requireEnv('VITE_API_BASE_URL'),
  /** URL dell'authorizer: registrazione, accesso e gestione della password. */
  authBaseUrl:          requireEnv('VITE_AUTH_BASE_URL'),
  tenantName:           requireEnv('VITE_TENANT_NAME'),
  activityCostMapping:  parseActivityMapping(),
  istruttori:           parseIstruttori(),
} as const;

/**
 * True se il tenant ha configurato più istruttori: unico interruttore per la
 * visibilità del campo "istruttore" nel form e nella tabella incontri, e per
 * il raggruppamento nella pagina Resoconto.
 */
export const istruttoriAbilitati = config.istruttori.length > 0;

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

// Le funzioni per gli endpoint OIDC di Keycloak (authorize, token,
// registrations, logout) sono state rimosse insieme a Keycloak: accesso e
// registrazione avvengono ora con chiamate dirette all'authorizer, vedi
// auth/authApi.ts.
