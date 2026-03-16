/**
 * Configurazione runtime del frontend.
 * I valori vengono iniettati come variabili d'ambiente Vite al build time
 * (recuperate da SSM Parameter Store durante la CI/CD).
 */

export const config = {
  apiBaseUrl:        import.meta.env.VITE_API_BASE_URL        ?? 'http://localhost:3000',
  cognitoUserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID ?? '',
  cognitoClientId:   import.meta.env.VITE_COGNITO_CLIENT_ID   ?? '',
  cognitoDomain:     import.meta.env.VITE_COGNITO_DOMAIN       ?? '',
  awsRegion:         import.meta.env.VITE_AWS_REGION           ?? 'eu-central-1',
  tenantId:          import.meta.env.VITE_TENANT_ID            ?? 'asd1',
} as const;

/** URL del Cognito Hosted UI (authorize endpoint) */
export function getCognitoAuthorizeUrl(redirectUri: string): string {
  const base = `https://${config.cognitoDomain}.auth.${config.awsRegion}.amazoncognito.com`;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     config.cognitoClientId,
    redirect_uri:  redirectUri,
    scope:         'openid email profile',
  });
  return `${base}/oauth2/authorize?${params.toString()}`;
}

export function getCognitoLogoutUrl(redirectUri: string): string {
  const base = `https://${config.cognitoDomain}.auth.${config.awsRegion}.amazoncognito.com`;
  const params = new URLSearchParams({
    client_id:  config.cognitoClientId,
    logout_uri: redirectUri,
  });
  return `${base}/logout?${params.toString()}`;
}

export function getCognitoTokenUrl(): string {
  return `https://${config.cognitoDomain}.auth.${config.awsRegion}.amazoncognito.com/oauth2/token`;
}
