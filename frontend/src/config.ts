/**
 * Configurazione runtime del frontend.
 * I valori vengono iniettati come variabili d'ambiente Vite al build time.
 *
 * Variabili necessarie:
 *
 * Locale (docker-compose / .env.local):
 *   VITE_API_BASE_URL          = http://localhost:3000
 *   VITE_KEYCLOAK_URL          = http://localhost:8080
 *   VITE_KEYCLOAK_REALM        = clubmanager          (obbligatoria)
 *   VITE_KEYCLOAK_CLIENT_ID    = clubmanager-spa      (obbligatoria)
 *   VITE_TENANT_NAME           = La mia ASD           (obbligatoria)
 *   VITE_ACTIVITY_SELECT_VALUES_MAPPING = JSON {"Attività": costoDefault, ...} (opzionale)
 *
 * Produzione:
 *   VITE_API_BASE_URL          = https://api.<dominio>
 *   VITE_KEYCLOAK_URL          = https://auth.<dominio>
 *   VITE_KEYCLOAK_REALM        = clubmanager          (obbligatoria)
 *   VITE_KEYCLOAK_CLIENT_ID    = clubmanager-spa      (obbligatoria)
 *   VITE_TENANT_NAME           = La mia ASD           (obbligatoria)
 *   VITE_ACTIVITY_SELECT_VALUES_MAPPING = JSON {"Attività": costoDefault, ...} (opzionale)
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
  keycloakUrl:          requireEnv('VITE_KEYCLOAK_URL'),
  keycloakRealm:        requireEnv('VITE_KEYCLOAK_REALM'),
  keycloakClientId:     requireEnv('VITE_KEYCLOAK_CLIENT_ID'),
  tenantName:           requireEnv('VITE_TENANT_NAME'),
  activityCostMapping:  parseActivityMapping(),
} as const;

/** Base URL for Keycloak OIDC endpoints */
function oidcBase(): string {
  return `${config.keycloakUrl}/realms/${config.keycloakRealm}/protocol/openid-connect`;
}

/** Keycloak authorize endpoint (PKCE) */
export function getKeycloakAuthorizeUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     config.keycloakClientId,
    redirect_uri:  redirectUri,
    scope:         'openid email profile',
  });
  return `${oidcBase()}/auth?${params.toString()}`;
}

/** Keycloak token endpoint */
export function getKeycloakTokenUrl(): string {
  return `${oidcBase()}/token`;
}

/** Keycloak registration endpoint (PKCE) — stessa callback del login */
export function getKeycloakRegistrationUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id:    config.keycloakClientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope:        'openid email profile',
  });
  return `${oidcBase()}/registrations?${params.toString()}`;
}

/** Keycloak logout endpoint */
export function getKeycloakLogoutUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id:                config.keycloakClientId,
    post_logout_redirect_uri: redirectUri,
  });
  return `${oidcBase()}/logout?${params.toString()}`;
}
