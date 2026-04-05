/**
 * Admin service: gestione ruoli Keycloak e associazione viewer ↔ socio
 */

import { BadRequestError, NotFoundError } from '../middleware/auth.js';
import { associaViewer, disassociaViewer, getSocioById } from './soci.service.js';

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'clubmanager';
const KEYCLOAK_ADMIN_CLIENT_ID = process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'clubmanager-backend';
const KEYCLOAK_ADMIN_CLIENT_SECRET = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET || '';

export interface KeycloakUser {
  sub: string;
  email: string;
  groups: string[];
  enabled: boolean;
}

interface KeycloakRole {
  id: string;
  name: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAdminToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }

  const tokenUrl = `${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: KEYCLOAK_ADMIN_CLIENT_ID,
    client_secret: KEYCLOAK_ADMIN_CLIENT_SECRET,
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to get admin token: ${res.status} ${text}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.token;
}

async function keycloakAdminFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAdminToken();
  const url = `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

// ---------------------------------------------------------------
// Lista utenti Keycloak (per la UI admin)
// ---------------------------------------------------------------
export async function listKeycloakUsers(): Promise<KeycloakUser[]> {
  const res = await keycloakAdminFetch('/users?max=100');
  if (!res.ok) {
    throw new Error(`Failed to list users: ${res.status}`);
  }
  const users: any[] = await res.json();

  return Promise.all(
    users.map(async (u) => {
      // Get user's realm roles
      const rolesRes = await keycloakAdminFetch(`/users/${u.id}/role-mappings/realm`);
      const roles: any[] = rolesRes.ok ? await rolesRes.json() : [];
      const groups = roles.map((r: any) => r.name);

      return {
        sub: u.id,
        email: u.email ?? u.username ?? '',
        groups,
        enabled: u.enabled ?? true,
      };
    })
  );
}

async function getRealmRole(roleName: string): Promise<KeycloakRole> {
  const res = await keycloakAdminFetch(`/roles/${roleName}`);
  if (!res.ok) {
    throw new NotFoundError(`Ruolo '${roleName}' non trovato in Keycloak`);
  }
  return res.json();
}

// ---------------------------------------------------------------
// Promuovi utente a admin
// ---------------------------------------------------------------
export async function promuoviAdmin(keycloakUserId: string): Promise<void> {
  // Find user by email (keycloakUserId can be an email or a UUID)
  let userId = keycloakUserId;

  // If it looks like an email, resolve to user ID
  if (keycloakUserId.includes('@')) {
    const searchRes = await keycloakAdminFetch(`/users?email=${encodeURIComponent(keycloakUserId)}`);
    if (!searchRes.ok) throw new NotFoundError(`Utente '${keycloakUserId}' non trovato`);
    const users: any[] = await searchRes.json();
    if (users.length === 0) throw new NotFoundError(`Utente '${keycloakUserId}' non trovato`);
    userId = users[0].id;
  }

  const role = await getRealmRole('admin');
  const res = await keycloakAdminFetch(`/users/${userId}/role-mappings/realm`, {
    method: 'POST',
    body: JSON.stringify([role]),
  });
  if (!res.ok) {
    throw new Error(`Failed to assign admin role: ${res.status}`);
  }
}

// ---------------------------------------------------------------
// Assegna ruolo viewer a un utente Keycloak
// ---------------------------------------------------------------
export async function assegnaRuoloViewer(keycloakUserId: string): Promise<void> {
  const role = await getRealmRole('viewer');
  const res = await keycloakAdminFetch(`/users/${keycloakUserId}/role-mappings/realm`, {
    method: 'POST',
    body: JSON.stringify([role]),
  });
  if (!res.ok) {
    throw new Error(`Failed to assign viewer role: ${res.status}`);
  }
}

// ---------------------------------------------------------------
// Associa un viewer Keycloak a un socio
// ---------------------------------------------------------------
export async function associaViewerASocio(
  socioId: string,
  keycloakUserId: string
): Promise<void> {
  // Resolve user ID if email was provided
  let userId = keycloakUserId;
  if (keycloakUserId.includes('@')) {
    const searchRes = await keycloakAdminFetch(`/users?email=${encodeURIComponent(keycloakUserId)}`);
    if (!searchRes.ok) throw new NotFoundError(`Utente Keycloak '${keycloakUserId}' non trovato`);
    const users: any[] = await searchRes.json();
    if (users.length === 0) throw new NotFoundError(`Utente Keycloak '${keycloakUserId}' non trovato`);
    userId = users[0].id;
  }

  // Verifica esistenza socio
  await getSocioById(socioId);

  // Assign viewer role in Keycloak
  const role = await getRealmRole('viewer');
  await keycloakAdminFetch(`/users/${userId}/role-mappings/realm`, {
    method: 'POST',
    body: JSON.stringify([role]),
  });

  // Salva l'associazione nel DB
  await associaViewer(socioId, userId);
}

// ---------------------------------------------------------------
// Disassocia viewer da socio
// ---------------------------------------------------------------
export async function disassociaViewerDaSocio(socioId: string): Promise<void> {
  await getSocioById(socioId);
  await disassociaViewer(socioId);
}
