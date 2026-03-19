/**
 * Configurazione runtime del frontend.
 * I valori vengono iniettati come variabili d'ambiente Vite al build time
 * (recuperate da SSM Parameter Store durante la CI/CD).
 *
 * Variabili necessarie:
 *
 * Locale (docker-compose / .env.local):
 *   VITE_API_BASE_URL          = http://localhost:3000
 *   VITE_COGNITO_USER_POOL_ID  = eu-central-1_XXXXXXXXX      (output localstack)
 *   VITE_COGNITO_CLIENT_ID     = <client-id>                 (output localstack)
 *   VITE_COGNITO_ENDPOINT      = http://localhost:4566        ← URL base LocalStack
 *   VITE_TENANT_ID             = asd1
 *
 * Produzione (iniettate da CI/CD da SSM):
 *   VITE_API_BASE_URL          = https://xxxxxx.execute-api.eu-central-1.amazonaws.com
 *   VITE_COGNITO_USER_POOL_ID  = eu-central-1_XXXXXXXXX
 *   VITE_COGNITO_CLIENT_ID     = <client-id>
 *   VITE_COGNITO_ENDPOINT      = https://<domain>.auth.eu-central-1.amazoncognito.com
 *   VITE_TENANT_ID             = asd1
 *
 * Nota: VITE_AWS_REGION e VITE_COGNITO_DOMAIN non servono più —
 * l'endpoint OAuth completo è in VITE_COGNITO_ENDPOINT.
 */

export const config = {
  apiBaseUrl:        import.meta.env.VITE_API_BASE_URL        ?? 'http://localhost:3000',
  cognitoUserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID ?? '',
  cognitoClientId:   import.meta.env.VITE_COGNITO_CLIENT_ID   ?? '',
  /**
   * URL base dell'OAuth endpoint Cognito.
   * Locale:    http://localhost:4566
   * Produzione: https://<dominio>.auth.<region>.amazoncognito.com
   */
  cognitoEndpoint:   import.meta.env.VITE_COGNITO_ENDPOINT    ?? 'http://localhost:4566',
  tenantId:          import.meta.env.VITE_TENANT_ID            ?? 'asd1',
} as const;

/** URL del Cognito Hosted UI (authorize endpoint) */
export function getCognitoAuthorizeUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     config.cognitoClientId,
    redirect_uri:  redirectUri,
    scope:         'openid email profile',
  });
  return `${config.cognitoEndpoint}/oauth2/authorize?${params.toString()}`;
}

export function getCognitoLogoutUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id:  config.cognitoClientId,
    logout_uri: redirectUri,
  });
  return `${config.cognitoEndpoint}/logout?${params.toString()}`;
}

export function getCognitoTokenUrl(): string {
  return `${config.cognitoEndpoint}/oauth2/token`;
}
