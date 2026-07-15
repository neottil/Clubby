/**
 * API client per le chiamate al backend
 */

import { config } from '../config';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// ---------------------------------------------------------------
// Notifica globale di sessione scaduta (401): registrata da AuthContext
// per poter pulire i token e reindirizzare al login da qualunque chiamata
// API, senza dover propagare una dipendenza dal contesto React fin qui.
// ---------------------------------------------------------------
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${config.apiBaseUrl}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      message = data.error ?? data.message ?? message;
    } catch {}
    if (res.status === 401) {
      onUnauthorized?.();
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ---------------------------------------------------------------
// Factory: crea un client con il token iniettato
// ---------------------------------------------------------------
export function createApiClient(token: string | null) {
  return {
    // Soci
    getSoci:        ()                    => request<any[]>('/api/soci', {}, token),
    getSocio:       (id: string)          => request<any>(`/api/soci/${id}`, {}, token),
    createSocio:    (body: any)           => request<any>('/api/soci', { method: 'POST', body: JSON.stringify(body) }, token),
    updateSocio:    (id: string, body: any) => request<any>(`/api/soci/${id}`, { method: 'PUT', body: JSON.stringify(body) }, token),
    deleteSocio:    (id: string)          => request<void>(`/api/soci/${id}`, { method: 'DELETE' }, token),

    // Incontri
    getIncontri:    (socioId?: string)    => request<any[]>(`/api/incontri${socioId ? `?socio_id=${socioId}` : ''}`, {}, token),
    getIncontro:    (id: string)          => request<any>(`/api/incontri/${id}`, {}, token),
    createIncontro: (body: any)           => request<any>('/api/incontri', { method: 'POST', body: JSON.stringify(body) }, token),
    updateIncontro: (id: string, body: any) => request<any>(`/api/incontri/${id}`, { method: 'PUT', body: JSON.stringify(body) }, token),
    deleteIncontro: (id: string)          => request<void>(`/api/incontri/${id}`, { method: 'DELETE' }, token),

    // Buoni
    getBuoni:       (socioId?: string)    => request<any[]>(`/api/buoni${socioId ? `?socio_id=${socioId}` : ''}`, {}, token),
    createBuono:    (body: any)           => request<any>('/api/buoni', { method: 'POST', body: JSON.stringify(body) }, token),

    // Movimenti
    getMovimenti:   (buonoId: string)     => request<any[]>(`/api/buoni/${buonoId}/movimenti`, {}, token),
    createMovimento:(buonoId: string, body: any) => request<any>(`/api/buoni/${buonoId}/movimenti`, { method: 'POST', body: JSON.stringify(body) }, token),

    // Admin
    getAdminUsers:  ()                    => request<any[]>('/api/admin/users', {}, token),
    associaViewer:  (body: any)           => request<any>('/api/admin/associa-viewer', { method: 'POST', body: JSON.stringify(body) }, token),
    disassociaViewer:(socioId: string)    => request<void>(`/api/admin/associa-viewer/${socioId}`, { method: 'DELETE' }, token),
    promuoviAdmin:  (body: any)           => request<any>('/api/admin/promuovi', { method: 'POST', body: JSON.stringify(body) }, token),
  };
}
