/**
 * Admin service: gestione ruoli Cognito e associazione viewer ↔ socio
 */

import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  AdminListGroupsForUserCommand,
  AdminGetUserCommand,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { BadRequestError, NotFoundError } from '../middleware/auth.js';
import { associaViewer, disassociaViewer, getSocioById } from './soci.service.js';

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;
const AWS_REGION   = process.env.AWS_REGION_NAME ?? 'eu-central-1';

// AWS_ENDPOINT è settato solo in locale (es. http://localstack:4566).
// In produzione la variabile non esiste e il client usa l'endpoint AWS reale.
const AWS_ENDPOINT = process.env.AWS_ENDPOINT;

const cognito = new CognitoIdentityProviderClient({
  region: AWS_REGION,
  ...(AWS_ENDPOINT ? { endpoint: AWS_ENDPOINT } : {}),
});

export interface CognitoUser {
  sub: string;
  email: string;
  groups: string[];
  enabled: boolean;
}

// ---------------------------------------------------------------
// Lista utenti Cognito (per la UI admin)
// ---------------------------------------------------------------
export async function listCognitoUsers(): Promise<CognitoUser[]> {
  const command = new ListUsersCommand({
    UserPoolId: USER_POOL_ID,
    Limit: 60,
  });

  const response = await cognito.send(command);
  const users = response.Users ?? [];

  return Promise.all(
    users.map(async (u) => {
      const email =
        u.Attributes?.find((a) => a.Name === 'email')?.Value ?? '';
      const sub =
        u.Attributes?.find((a) => a.Name === 'sub')?.Value ?? '';

      // recupera gruppi
      const groupsResp = await cognito.send(
        new AdminListGroupsForUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: u.Username!,
        })
      );
      const groups = (groupsResp.Groups ?? []).map((g) => g.GroupName ?? '');

      return {
        sub,
        email,
        groups,
        enabled: u.Enabled ?? true,
      };
    })
  );
}

// ---------------------------------------------------------------
// Promuovi utente a admin
// ---------------------------------------------------------------
export async function promuoviAdmin(cognitoUsername: string): Promise<void> {
  await cognito.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: USER_POOL_ID,
      Username: cognitoUsername,
      GroupName: 'admin',
    })
  );
}

// ---------------------------------------------------------------
// Associa un viewer Cognito a un socio
// ---------------------------------------------------------------
export async function associaViewerASocio(
  socioId: string,
  cognitoUsername: string
): Promise<void> {
  // Verifica che l'utente Cognito esista
  let userSub: string;
  try {
    const userResp = await cognito.send(
      new AdminGetUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: cognitoUsername,
      })
    );
    userSub =
      userResp.UserAttributes?.find((a) => a.Name === 'sub')?.Value ?? '';
  } catch {
    throw new NotFoundError(`Utente Cognito '${cognitoUsername}' non trovato`);
  }

  if (!userSub) {
    throw new BadRequestError('Impossibile recuperare il sub Cognito');
  }

  // Verifica esistenza socio
  await getSocioById(socioId);

  // Salva il Cognito sub nel socio
  await associaViewer(socioId, userSub);
}

// ---------------------------------------------------------------
// Disassocia viewer da socio
// ---------------------------------------------------------------
export async function disassociaViewerDaSocio(socioId: string): Promise<void> {
  await getSocioById(socioId);
  await disassociaViewer(socioId);
}
