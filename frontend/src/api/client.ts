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

// ---------------------------------------------------------------
// Rinnovo della sessione su 401, registrato da AuthContext: restituisce un
// access token nuovo, o null se la sessione non è più recuperabile (in quel
// caso AuthContext ha già chiuso la sessione).
//
// Serve perché il rinnovo a tempo non basta: con la scheda in secondo piano o
// il computer in sospensione il browser congela i timer, e alla ripresa la
// prima chiamata parte con un access token scaduto. Senza questo tentativo,
// quel 401 disconnetteva l'utente anche con un refresh token valido per giorni.
// ---------------------------------------------------------------
let rinnovaToken: (() => Promise<string | null>) | null = null;
export function setTokenRefresher(fn: (() => Promise<string | null>) | null): void {
  rinnovaToken = fn;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
  giaRiprovata = false
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

  // Un solo tentativo di rinnovo per richiesta: se anche il token nuovo viene
  // rifiutato, il problema non è la scadenza e riprovare non servirebbe.
  if (res.status === 401 && token && !giaRiprovata && rinnovaToken) {
    const nuovo = await rinnovaToken();
    if (nuovo) return request<T>(path, options, nuovo, true);
    throw new ApiError(401, 'Sessione scaduta: accedi di nuovo');
  }

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
  /**
   * Somma dei costi di tutte le righe che soddisfano il filtro (solo per gli
   * incontri): come `total`, riguarda l'intero risultato e non la pagina.
   */
  totale_costo?: number;
  limit: number;
  offset: number;
}

/**
 * Righe caricate a ogni "Carica altri" negli elenchi paginati. Allineato al
 * default del backend (util/paginazione.ts): non è un vincolo, ma tenere lo
 * stesso valore evita pagine di dimensione diversa a seconda di chi decide.
 */
export const DIMENSIONE_PAGINA = 25;

/** Query string dai soli parametri valorizzati (gli altri restano ai default del backend). */
function queryString(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

/** queryString per un oggetto di parametri tipizzato. */
function qsDi(params: object): string {
  return queryString(params as Record<string, string | number | undefined>);
}

export interface IncontriQuery {
  /**
   * In quale veste compare chi chiede: 'socio' gli incontri a cui ha
   * partecipato, 'istruttore' quelli che ha tenuto. Omesso, l'admin riceve
   * tutti gli incontri e gli altri ruoli quelli come socio.
   */
  ambito?: 'socio' | 'istruttore';
  socio_id?: string;
  q?: string;
  attivita_id?: string;
  istruttore_id?: string;
  da?: string;
  a?: string;
  sort?: string;
  dir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/** Ultima ricarica di un voucher: solo quando e quanto. */
export interface UltimaRicarica {
  data_movimento: string;
  importo: number;
}

/**
 * Voce di Fatturazione: una ricarica di voucher, una quota di tesseramento o un
 * incontro non coperto da voucher.
 */
export interface VoceFatturazione {
  id: string;
  tipo: 'ricarica' | 'tesseramento' | 'incontro';
  data: string;
  socio_id: string;
  nome: string;
  cognome: string;
  descrizione: string;
  importo: number;
}

/** Parametri comuni degli elenchi paginati con ricerca e ordinamento. */
export interface ElencoQuery {
  q?: string;
  sort?: string;
  dir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface SociQuery extends ElencoQuery {
  /** Solo le schede non collegate ad alcun account (solo admin). */
  senza_account?: '1';
}

export interface VouchersQuery extends ElencoQuery {
  socio_id?: string;
  /** Tutti tranne il voucher di questo socio (il proprio, mostrato a parte). */
  escludi_socio_id?: string;
}

export type StatoTesseramento = 'attivo' | 'in_scadenza' | 'scaduto' | 'mai';

export interface TesseramentiQuery extends ElencoQuery {
  stato?: StatoTesseramento;
}

/** Riga della pagina Tesseramenti: la situazione del socio con lo stato calcolato dal backend. */
export interface RigaTesseramento extends SituazioneTesseramento {
  stato: StatoTesseramento;
}

export interface FatturazioneQuery {
  socio_id?: string;
  da?: string;
  a?: string;
  limit?: number;
  offset?: number;
}

/** Un socio con il suo ultimo rinnovo del tesseramento (null se mai tesserato). */
export interface SituazioneTesseramento {
  socio_id: string;
  nome: string;
  cognome: string;
  ultimo_rinnovo: string | null;
  scadenza: string | null;
  rinnovi: number;
}

export interface Tesseramento {
  id: string;
  socio_id: string;
  data_rinnovo: string;
  scadenza: string;
  importo: number;
  created_at: string;
}

export interface Impostazioni {
  quota_tesseramento: number;
}

/** Voce del listino attività, come la serve /api/attivita. */
export interface Attivita {
  id: string;
  nome: string;
  costo_default: number;
  attiva: boolean;
}

/**
 * Istruttore. Nome e cognome sono quelli della sua scheda socio e sono null
 * finché l'account non è collegato a una: in quel caso resta solo l'email a
 * identificarlo (vedi nomeIstruttore). `attivita_ids` arriva solo agli admin,
 * che sono gli unici a gestire le abilitazioni.
 */
export interface Istruttore {
  id: string;
  email: string;
  nome: string | null;
  cognome: string | null;
  attivita_ids?: string[];
}

/**
 * Come si scrive un istruttore in interfaccia. Ripiega sull'email quando
 * l'account non è ancora collegato a un socio: mostrare uno spazio vuoto
 * farebbe sembrare l'elenco rotto.
 */
export function nomeIstruttore(i: Istruttore): string {
  return i.cognome || i.nome ? `${i.cognome ?? ''} ${i.nome ?? ''}`.trim() : i.email;
}

// ---------------------------------------------------------------
// Factory: crea un client con il token iniettato
// ---------------------------------------------------------------
export function createApiClient(token: string | null) {
  return {
    // Soci
    // Elenco completo, per i menu di scelta; a pagine per la tabella Soci.
    getSoci:        ()                    => request<any[]>('/api/soci', {}, token),
    getSociPagina:  (params: SociQuery)   => request<Paginated<any>>(`/api/soci${qsDi(params)}`, {}, token),
    getSocio:       (id: string)          => request<any>(`/api/soci/${id}`, {}, token),
    createSocio:    (body: any)           => request<any>('/api/soci', { method: 'POST', body: JSON.stringify(body) }, token),
    updateSocio:    (id: string, body: any) => request<any>(`/api/soci/${id}`, { method: 'PUT', body: JSON.stringify(body) }, token),
    deleteSocio:    (id: string)          => request<void>(`/api/soci/${id}`, { method: 'DELETE' }, token),

    // Incontri — elenco paginato: filtri e ordinamento sono applicati dal
    // backend, perché il client ne vede una pagina per volta.
    getIncontri:    (params: IncontriQuery = {}) => request<Paginated<any>>(`/api/incontri${queryString(params as Record<string, string | number | undefined>)}`, {}, token),
    getIncontro:    (id: string)          => request<any>(`/api/incontri/${id}`, {}, token),
    createIncontro: (body: any)           => request<any>('/api/incontri', { method: 'POST', body: JSON.stringify(body) }, token),
    updateIncontro: (id: string, body: any) => request<any>(`/api/incontri/${id}`, { method: 'PUT', body: JSON.stringify(body) }, token),
    deleteIncontro: (id: string)          => request<void>(`/api/incontri/${id}`, { method: 'DELETE' }, token),

    // Attività — il listino: nomi e costi proposti. Un istruttore riceve dal
    // backend le sole attività a cui è abilitato, senza doverlo chiedere.
    getAttivita:    (tutte = false)        => request<Attivita[]>(`/api/attivita${tutte ? '?tutte=1' : ''}`, {}, token),
    createAttivita: (body: Partial<Attivita>) => request<Attivita>('/api/attivita', { method: 'POST', body: JSON.stringify(body) }, token),
    updateAttivita: (id: string, body: Partial<Attivita>) => request<Attivita>(`/api/attivita/${id}`, { method: 'PUT', body: JSON.stringify(body) }, token),
    deleteAttivita: (id: string)          => request<void>(`/api/attivita/${id}`, { method: 'DELETE' }, token),

    // Istruttori e loro abilitazioni
    getIstruttori:  ()                    => request<Istruttore[]>('/api/istruttori', {}, token),
    setAbilitazioni:(istruttoreId: string, attivitaIds: string[]) =>
      request<{ attivita_ids: string[] }>(`/api/istruttori/${istruttoreId}/attivita`, { method: 'PUT', body: JSON.stringify({ attivita_ids: attivitaIds }) }, token),

    // Vouchers
    getVouchers:       (socioId?: string)    => request<any[]>(`/api/voucher${socioId ? `?socio_id=${socioId}` : ''}`, {}, token),
    getVouchersPagina: (params: VouchersQuery) => request<Paginated<any>>(`/api/voucher${qsDi(params)}`, {}, token),
    createVoucher:    (body: any)           => request<any>('/api/voucher', { method: 'POST', body: JSON.stringify(body) }, token),
    // Ultima ricarica di un voucher, chiesta a parte dalla scheda del proprio
    // voucher: gli elenchi non la portano, per non calcolarla su ogni riga.
    // Restituisce undefined (204) se il voucher non ne ha ancora ricevuta una.
    getUltimaRicarica: (voucherId: string) =>
      request<UltimaRicarica | undefined>(`/api/voucher/${voucherId}/ultima-ricarica`, {}, token),

    // Movimenti
    getMovimenti:   (voucherId: string, params: { limit?: number; offset?: number } = {}) =>
      request<Paginated<any>>(`/api/voucher/${voucherId}/movimenti${queryString(params)}`, {}, token),
    createMovimento:(voucherId: string, body: any) => request<any>(`/api/voucher/${voucherId}/movimenti`, { method: 'POST', body: JSON.stringify(body) }, token),

    // Fatturazione (solo admin), paginata come gli incontri
    getFatturazione: (params: FatturazioneQuery = {}) =>
      request<Paginated<VoceFatturazione> & { totale_importo: number }>(`/api/fatturazione${queryString(params as Record<string, string | number | undefined>)}`, {}, token),

    // Tesseramenti (solo admin)
    getTesseramentiPagina: (params: TesseramentiQuery) =>
      request<Paginated<RigaTesseramento> & { conteggi: Record<StatoTesseramento, number> }>(`/api/tesseramenti${qsDi(params)}`, {}, token),
    getStoricoTesseramenti: (socioId: string) => request<Tesseramento[]>(`/api/tesseramenti/${socioId}`, {}, token),
    rinnovaTesseramento: (body: { socio_id: string; scadenza: string; data_rinnovo?: string; importo?: number }) =>
      request<Tesseramento>('/api/tesseramenti', { method: 'POST', body: JSON.stringify(body) }, token),

    // Impostazioni dell'associazione (solo admin)
    getImpostazioni: () => request<Impostazioni>('/api/impostazioni', {}, token),
    aggiornaImpostazioni: (body: Partial<Impostazioni>) =>
      request<Impostazioni>('/api/impostazioni', { method: 'PUT', body: JSON.stringify(body) }, token),

    // Scheda socio di chi sta usando l'applicazione, se un admin l'ha
    // collegata. Restituisce undefined (204) quando l'account non ne ha
    // ancora una: è uno stato normale, non un errore.
    getStatoSocio:  ()                    => request<any>('/api/auth/socio', {}, token),

    // Admin
    getAdminUsersPagina: (params: ElencoQuery) =>
      request<Paginated<any> & { da_collegare: number }>(`/api/admin/users${qsDi(params)}`, {}, token),
    associaViewer:  (body: any)           => request<any>('/api/admin/associa-viewer', { method: 'POST', body: JSON.stringify(body) }, token),
    // Solo scollegamento: lo stato dell'account non cambia.
    disassociaViewer:(socioId: string) =>
      request<void>(`/api/admin/associa-viewer/${socioId}`, { method: 'DELETE' }, token),
    cambiaAttivo:   (utenteId: string, attivo: boolean) =>
      request<any>('/api/admin/attivo', { method: 'POST', body: JSON.stringify({ utente_id: utenteId, attivo }) }, token),
    // Ruolo nel club (socio o istruttore). Il privilegio di amministrare l'app
    // è indipendente e si imposta a parte con impostaAdmin.
    impostaRuolo:   (utenteId: string, ruolo: string) =>
      request<any>('/api/admin/ruolo', { method: 'POST', body: JSON.stringify({ utente_id: utenteId, ruolo }) }, token),
    impostaAdmin:   (utenteId: string, admin: boolean) =>
      request<any>('/api/admin/amministratore', { method: 'POST', body: JSON.stringify({ utente_id: utenteId, admin }) }, token),
    // Restituisce la password temporanea generata: va consegnata
    // all'interessato, non viene inviata per email e non è più recuperabile.
    resetPassword:  (body: any)           => request<{ password_temporanea: string }>('/api/admin/reset-password', { method: 'POST', body: JSON.stringify(body) }, token),

    // Versione del backend in esecuzione (pagina Info)
    getVersion:     ()                    => request<{ version: string }>('/api/version', {}, token),
  };
}
