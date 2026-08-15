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

/**
 * Risposta degli endpoint a elenco paginato. `total` è il numero di righe che
 * soddisfano il filtro, non quante ne sono state restituite: serve a sapere se
 * c'è dell'altro da caricare.
 */
export interface Paginated<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

/** Query string dai soli parametri valorizzati (gli altri restano ai default del backend). */
function queryString(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export interface IncontriQuery {
  socio_id?: string;
  q?: string;
  attivita?: string;
  da?: string;
  a?: string;
  sort?: string;
  dir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
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

    // Incontri — elenco paginato: filtri e ordinamento sono applicati dal
    // backend, perché il client ne vede una pagina per volta.
    getIncontri:    (params: IncontriQuery = {}) => request<Paginated<any>>(`/api/incontri${queryString(params as Record<string, string | number | undefined>)}`, {}, token),
    // Resoconto già aggregato per istruttore/attività: non scarica gli
    // incontri, quindi non è soggetto alla paginazione dell'elenco.
    getResoconto:   (da?: string, a?: string) => request<any[]>(`/api/incontri/resoconto${queryString({ da, a })}`, {}, token),
    getIncontro:    (id: string)          => request<any>(`/api/incontri/${id}`, {}, token),
    createIncontro: (body: any)           => request<any>('/api/incontri', { method: 'POST', body: JSON.stringify(body) }, token),
    updateIncontro: (id: string, body: any) => request<any>(`/api/incontri/${id}`, { method: 'PUT', body: JSON.stringify(body) }, token),
    deleteIncontro: (id: string)          => request<void>(`/api/incontri/${id}`, { method: 'DELETE' }, token),

    // Vouchers
    getVouchers:       (socioId?: string)    => request<any[]>(`/api/voucher${socioId ? `?socio_id=${socioId}` : ''}`, {}, token),
    createVoucher:    (body: any)           => request<any>('/api/voucher', { method: 'POST', body: JSON.stringify(body) }, token),

    // Movimenti
    getMovimenti:   (voucherId: string, params: { limit?: number; offset?: number } = {}) =>
      request<Paginated<any>>(`/api/voucher/${voucherId}/movimenti${queryString(params)}`, {}, token),
    createMovimento:(voucherId: string, body: any) => request<any>(`/api/voucher/${voucherId}/movimenti`, { method: 'POST', body: JSON.stringify(body) }, token),

    // Admin
    getAdminUsers:  ()                    => request<any[]>('/api/admin/users', {}, token),
    associaViewer:  (body: any)           => request<any>('/api/admin/associa-viewer', { method: 'POST', body: JSON.stringify(body) }, token),
    disassociaViewer:(socioId: string)    => request<void>(`/api/admin/associa-viewer/${socioId}`, { method: 'DELETE' }, token),
    promuoviAdmin:  (body: any)           => request<any>('/api/admin/promuovi', { method: 'POST', body: JSON.stringify(body) }, token),
    retrocediAdmin: (body: any)           => request<any>('/api/admin/retrocedi', { method: 'POST', body: JSON.stringify(body) }, token),

    // Versione del backend in esecuzione (pagina Info)
    getVersion:     ()                    => request<{ version: string }>('/api/version', {}, token),
  };
}
