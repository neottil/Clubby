/**
 * Configurazione runtime del frontend.
 * I valori vengono iniettati come variabili d'ambiente Vite al build time.
 *
 * Variabili necessarie:
 *
 * Locale (docker-compose / .env.local):
 *   VITE_API_BASE_URL          = http://localhost:3000
 *   VITE_KEYCLOAK_URL          = http://localhost:8080
 *   VITE_KEYCLOAK_REALM        = clubmanager
 *   VITE_KEYCLOAK_CLIENT_ID    = clubmanager-spa
 *   VITE_TENANT_ID             = asd1
 *
 * Produzione:
 *   VITE_API_BASE_URL          = https://api.<dominio>
 *   VITE_KEYCLOAK_URL          = https://auth.<dominio>
 *   VITE_KEYCLOAK_REALM        = clubmanager
 *   VITE_KEYCLOAK_CLIENT_ID    = clubmanager-spa
 *   VITE_TENANT_ID             = asd1
 */

export const config = {
  apiBaseUrl:       import.meta.env.VITE_API_BASE_URL       ?? 'http://localhost:3000',
  keycloakUrl:      import.meta.env.VITE_KEYCLOAK_URL       ?? 'http://localhost:8080',
  keycloakRealm:    import.meta.env.VITE_KEYCLOAK_REALM     ?? 'clubmanager',
  keycloakClientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'clubmanager-spa',
  tenantId:         import.meta.env.VITE_TENANT_ID           ?? 'asd1',
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

/** Keycloak logout endpoint */
export function getKeycloakLogoutUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id:                config.keycloakClientId,
    post_logout_redirect_uri: redirectUri,
  });
  return `${oidcBase()}/logout?${params.toString()}`;
}
