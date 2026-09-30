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
    } catch {
      // Corpo assente o non JSON (es. una pagina di errore del proxy): resta
      // il messaggio "HTTP <status>" già preparato, che è comunque più utile
      // di un fallimento nel gestire il fallimento.
    }
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
  /**
   * '1' restringe agli incontri ancora da rendicontare. Assente, l'elenco li
   * contiene tutti: la rendicontazione riguarda il compenso dell'istruttore e
   * non deve nascondere nulla a chi sta guardando altro.
   */
  solo_da_rendicontare?: '1';
  sort?: string;
  dir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * Scheda socio.
 *
 * I campi personali sono opzionali perché il backend non li serve a tutti: un
 * istruttore riceve l'elenco ridotto al nominativo (`listSociRidotti` in
 * soci.service.ts), e quei campi non escono nemmeno dal database. Dichiararli
 * obbligatori qui descriverebbe una risposta che per metà degli utenti non
 * arriva mai.
 */
export interface Socio {
  id: string;
  nome: string;
  cognome: string;
  email?: string | null;
  telefono?: string | null;
  data_iscrizione?: string;
  /** Account collegato alla scheda, se un admin ne ha associato uno. */
  id_viewer?: string | null;
  note?: string | null;
}

/** Corpo di creazione e modifica di un socio: solo i campi scrivibili. */
export interface SocioInput {
  nome: string;
  cognome: string;
  email?: string;
  telefono?: string;
  data_iscrizione?: string;
  note?: string;
}

/** Incontro, come lo servono gli elenchi e il dettaglio. */
export interface Incontro {
  id: string;
  socio_id: string;
  data_incontro: string;
  attivita_id: string;
  /** Nome dell'attività: arriva già con la riga (JOIN col listino). */
  attivita: string;
  /**
   * Account dell'istruttore che ha tenuto l'incontro. null per gli incontri
   * non attribuiti a nessuno: il nome si risolve dall'elenco istruttori,
   * perché a database c'è solo l'identificativo.
   */
  istruttore_id: string | null;
  costo: number;
  note: string | null;
  /** false = testo semplice, true = Markdown. */
  note_markdown: boolean;
  /**
   * Quando l'incontro è stato rendicontato all'istruttore, null se ancora no.
   * Non si annulla, e un incontro rendicontato non si può eliminare.
   */
  rendicontato_il: string | null;
  /**
   * La ricevuta che comprende questa riga, quando ce n'è una.
   *
   * Assenti a modulo ricevute spento, e sugli incontri visti da un istruttore
   * che li ha soltanto tenuti: quel documento è di un altro socio.
   */
  documento_id?: string | null;
  documento_anno?: number | null;
  documento_numero?: number | null;
  /** Nominativo del socio: presente nelle righe dell'elenco. */
  nome?: string;
  cognome?: string;
}

/** Corpo di creazione e modifica di un incontro. */
export interface IncontroInput {
  socio_id: string;
  data_incontro: string;
  attivita_id: string;
  istruttore_id?: string;
  costo: number;
  note?: string;
  note_markdown?: boolean;
}

/** Voucher prepagato di un socio. */
export interface Voucher {
  id: string;
  socio_id: string;
  data_creazione: string;
  saldo_iniziale: number;
  saldo_residuo: number;
  /** Nominativo del socio: presente nelle righe dell'elenco paginato. */
  nome?: string;
  cognome?: string;
}

export interface VoucherInput {
  socio_id: string;
  /** Credito di un voucher venduto prima di Clubby; 0 per un voucher nuovo. */
  saldo_iniziale?: number;
}

/** Movimento di un voucher: una ricarica o l'addebito di un incontro. */
export interface Movimento {
  id: string;
  voucher_id: string;
  incontro_id: string | null;
  tipo: 'ricarica' | 'addebito';
  data_movimento: string;
  /** Valore sul voucher: è questo che muove il saldo. */
  importo: number;
  /**
   * Quanto è stato pagato, se meno del valore accreditato (ricariche con
   * extra). null quando le due cose coincidono.
   */
  importo_pagato: number | null;
  descrizione: string | null;
  /**
   * La ricevuta che comprende questa ricarica, se ne è stata emessa una.
   *
   * Null su addebiti e rettifiche — non sono voci registrabili — e sulle
   * ricariche marcate come emesse prima che l'applicazione producesse
   * documenti.
   */
  documento_id: string | null;
  /**
   * Anno e numero della ricevuta: insieme sono il codice mostrato e il nome
   * del file scaricato (vedi utils/ricevuta). Null quando lo è documento_id.
   */
  documento_anno: number | null;
  documento_numero: number | null;
}

export interface MovimentoInput {
  tipo: 'ricarica' | 'addebito';
  importo: number;
  data_movimento?: string;
  descrizione?: string;
}

/** Ruolo nel club, indipendente dal privilegio di amministrazione. */
export type Ruolo = 'socio' | 'istruttore';

/**
 * Account, come lo serve la pagina Impostazioni: le credenziali vengono
 * dall'authorizer, nominativo e telefono dalla scheda socio collegata — null
 * finché l'account non ne ha una.
 */
export interface AdminUser {
  id: string;
  email: string;
  nome: string | null;
  cognome: string | null;
  telefono: string | null;
  socio_id: string | null;
  ruolo: Ruolo;
  admin: boolean;
  attivo: boolean;
  cambio_password_richiesto: boolean;
}

/**
 * Le azioni di amministrazione rispondono con la sola conferma testuale: chi
 * chiama ricarica l'elenco, non legge il corpo.
 */
export interface Esito {
  message: string;
}

/** Ultima ricarica di un voucher: solo quando e quanto. */
export interface UltimaRicarica {
  data_movimento: string;
  importo: number;
}

/**
 * Voce registrabile: una ricarica di voucher, una quota di tesseramento o un
 * incontro non coperto da voucher.
 */
export interface VoceDocumento {
  id: string;
  tipo: 'ricarica' | 'tesseramento' | 'incontro';
  data: string;
  socio_id: string;
  nome: string;
  cognome: string;
  descrizione: string;
  importo: number;
  /**
   * Quando è stato emesso il documento che comprende questa voce, null se
   * ancora no. Arriva valorizzato solo chiedendo anche le voci già emesse:
   * per default l'elenco contiene solo quelle da registrare.
   */
  emessa_il: string | null;
  /**
   * La ricevuta che comprende questa voce, se ne esiste una.
   *
   * Null sulle voci marcate come emesse prima che l'applicazione producesse
   * documenti: sono storico, e nella tabella semplicemente non mostrano
   * l'icona del PDF.
   */
  documento_id: string | null;
  /**
   * Anno e numero della ricevuta: insieme sono il codice mostrato e il nome
   * del file scaricato (vedi utils/ricevuta). Null quando lo è documento_id.
   */
  documento_anno: number | null;
  documento_numero: number | null;
}

/** Voce da marcare come registrata: la coppia che la identifica. */
export interface RiferimentoVoce {
  tipo: VoceDocumento['tipo'];
  id: string;
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

export interface VociDocumentoQuery {
  socio_id?: string;
  da?: string;
  a?: string;
  /**
   * '1' comprende anche le voci per cui un documento è già stato emesso.
   * Assente, l'elenco contiene solo quelle ancora da registrare: è ciò che
   * serve a chi apre la pagina.
   */
  includi_emesse?: '1';
  limit?: number;
  offset?: number;
}

/** Filtri dell'elenco delle ricevute emesse. */
export interface DocumentiQuery {
  socio_id?: string;
  da?: string;
  a?: string;
  limit?: number;
  offset?: number;
}

/** Una ricevuta emessa, come compare nell'elenco (senza i byte del PDF). */
export interface Documento {
  id: string;
  anno: number;
  numero: number;
  data_documento: string;
  socio_id: string;
  /** Nome e cognome come erano al momento dell'emissione. */
  intestatario: string;
  causale: string;
  importo: number;
  importo_lettere: string;
  nome_file: string;
  emesso_da: string | null;
  created_at: string;
  /** Dalla JOIN con socio: il nome ATTUALE, per il filtro e la ricerca. */
  nome: string;
  cognome: string;
}

export interface EmissioneInput {
  socio_id: string;
  causale: string;
  voci: RiferimentoVoce[];
}

/** Esito dell'anteprima: il PDF da mostrare, più i dati che lo accompagnano. */
export interface AnteprimaDocumento {
  pdf_base64: string;
  numero_provvisorio: number;
  anno: number;
  importo: number;
  importo_lettere: string;
  nome_file: string;
}

export interface DocumentoEmesso {
  id: string;
  anno: number;
  numero: number;
  data_documento: string;
  importo: number;
  importo_lettere: string;
  nome_file: string;
  pdf_base64: string;
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
  /**
   * La ricevuta che comprende questa riga, quando ce n'è una.
   *
   * Assenti a modulo ricevute spento, e sugli incontri visti da un istruttore
   * che li ha soltanto tenuti: quel documento è di un altro socio.
   */
  documento_id?: string | null;
  documento_anno?: number | null;
  documento_numero?: number | null;
}

export interface Impostazioni {
  quota_tesseramento: number;
  /** Percentuale aggiunta a una ricarica dove RECHARGE_MODE vale "percentage". */
  percentuale_ricarica: number;
  /** Testo multiriga in cima alle ricevute: denominazione, indirizzo, C.F. */
  ricevuta_intestazione: string;
  /** Piè di pagina delle ricevute, tipicamente la clausola sul bollo. */
  ricevuta_pie_pagina: string;
}

/** Taglio di ricarica preconfigurato (RECHARGE_MODE = "map"). */
export interface TaglioRicarica {
  id: string;
  /** Quanto paga il socio. */
  importo: number;
  /** Quanto gli viene accreditato sul voucher. */
  valore: number;
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
    getSoci:        ()                    => request<Socio[]>('/api/soci', {}, token),
    getSociPagina:  (params: SociQuery)   => request<Paginated<Socio>>(`/api/soci${qsDi(params)}`, {}, token),
    getSocio:       (id: string)          => request<Socio>(`/api/soci/${id}`, {}, token),
    createSocio:    (body: SocioInput)    => request<Socio>('/api/soci', { method: 'POST', body: JSON.stringify(body) }, token),
    updateSocio:    (id: string, body: Partial<SocioInput>) => request<Socio>(`/api/soci/${id}`, { method: 'PUT', body: JSON.stringify(body) }, token),
    deleteSocio:    (id: string)          => request<void>(`/api/soci/${id}`, { method: 'DELETE' }, token),

    // Incontri — elenco paginato: filtri e ordinamento sono applicati dal
    // backend, perché il client ne vede una pagina per volta.
    getIncontri:    (params: IncontriQuery = {}) => request<Paginated<Incontro>>(`/api/incontri${queryString(params as Record<string, string | number | undefined>)}`, {}, token),
    getIncontro:    (id: string)          => request<Incontro>(`/api/incontri/${id}`, {}, token),
    createIncontro: (body: IncontroInput) => request<Incontro>('/api/incontri', { method: 'POST', body: JSON.stringify(body) }, token),
    updateIncontro: (id: string, body: Partial<IncontroInput>) => request<Incontro>(`/api/incontri/${id}`, { method: 'PUT', body: JSON.stringify(body) }, token),
    deleteIncontro: (id: string)          => request<void>(`/api/incontri/${id}`, { method: 'DELETE' }, token),
    // Segna come rendicontati gli incontri indicati (solo admin). Risponde con
    // quanti lo sono diventati davvero: chi era già stato rendicontato da un
    // altro admin nel frattempo non viene toccato e non viene contato.
    rendicontaIncontri: (ids: string[]) =>
      request<{ richiesti: number; rendicontati: number }>('/api/incontri/rendiconta', { method: 'POST', body: JSON.stringify({ ids }) }, token),

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
    getVouchers:       (socioId?: string)    => request<Voucher[]>(`/api/voucher${socioId ? `?socio_id=${socioId}` : ''}`, {}, token),
    getVouchersPagina: (params: VouchersQuery) => request<Paginated<Voucher>>(`/api/voucher${qsDi(params)}`, {}, token),
    createVoucher:    (body: VoucherInput)  => request<Voucher>('/api/voucher', { method: 'POST', body: JSON.stringify(body) }, token),
    // Ultima ricarica di un voucher, chiesta a parte dalla scheda del proprio
    // voucher: gli elenchi non la portano, per non calcolarla su ogni riga.
    // Restituisce undefined (204) se il voucher non ne ha ancora ricevuta una.
    getUltimaRicarica: (voucherId: string) =>
      request<UltimaRicarica | undefined>(`/api/voucher/${voucherId}/ultima-ricarica`, {}, token),

    // Movimenti
    getMovimenti:   (voucherId: string, params: { limit?: number; offset?: number } = {}) =>
      request<Paginated<Movimento>>(`/api/voucher/${voucherId}/movimenti${queryString(params)}`, {}, token),
    createMovimento:(voucherId: string, body: MovimentoInput) => request<Movimento>(`/api/voucher/${voucherId}/movimenti`, { method: 'POST', body: JSON.stringify(body) }, token),

    // Documenti / ricevute (solo admin, tranne il download di una ricevuta)
    getVociDocumento: (params: VociDocumentoQuery = {}) =>
      request<Paginated<VoceDocumento> & { totale_importo: number }>(`/api/documenti/voci${queryString(params as Record<string, string | number | undefined>)}`, {}, token),
    getDocumenti: (params: DocumentiQuery = {}) =>
      request<Paginated<Documento>>(`/api/documenti${queryString(params as Record<string, string | number | undefined>)}`, {}, token),
    // Genera il PDF senza scrivere niente: il numero che torna è provvisorio,
    // perché quello definitivo si assegna solo alla conferma.
    anteprimaDocumento: (body: EmissioneInput) =>
      request<AnteprimaDocumento>('/api/documenti/anteprima', { method: 'POST', body: JSON.stringify(body) }, token),
    // Emissione definitiva. Risponde 409 se nel frattempo qualcuno ha
    // registrato una delle voci selezionate: l'importo non sarebbe più quello
    // visto in anteprima.
    emettiDocumento: (body: EmissioneInput) =>
      request<DocumentoEmesso>('/api/documenti', { method: 'POST', body: JSON.stringify(body) }, token),
    /**
     * Scarica il PDF conservato di una ricevuta.
     *
     * Non passa da `request`: quella funzione fa `res.json()`, e qui il corpo
     * è binario. Il token viaggia in un header, quindi non basta nemmeno un
     * link — serve fetch, e poi un blob da dare al browser.
     */
    getDocumentoPdf: async (id: string): Promise<Blob> => {
      const res = await fetch(`${config.apiBaseUrl}/api/documenti/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        throw new ApiError(res.status, res.status === 403
          ? 'Questa ricevuta non è intestata a te'
          : 'Ricevuta non disponibile');
      }
      return res.blob();
    },

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

    // Tagli di ricarica (solo admin). Esistono in ogni modalità: si possono
    // preparare prima di attivare RECHARGE_MODE=map.
    getTagliRicarica: () => request<TaglioRicarica[]>('/api/ricarica-tagli', {}, token),
    creaTaglioRicarica: (body: { importo: number; valore: number }) =>
      request<TaglioRicarica>('/api/ricarica-tagli', { method: 'POST', body: JSON.stringify(body) }, token),
    eliminaTaglioRicarica: (id: string) =>
      request<void>(`/api/ricarica-tagli/${id}`, { method: 'DELETE' }, token),

    // Scheda socio di chi sta usando l'applicazione, se un admin l'ha
    // collegata. Restituisce undefined (204) quando l'account non ne ha
    // ancora una: è uno stato normale, non un errore.
    getStatoSocio:  ()                    => request<Socio | undefined>('/api/auth/socio', {}, token),

    // Admin
    getAdminUsersPagina: (params: ElencoQuery) =>
      request<Paginated<AdminUser> & { da_collegare: number }>(`/api/admin/users${qsDi(params)}`, {}, token),
    associaViewer:  (body: { socio_id: string; utente_id: string }) =>
      request<Esito>('/api/admin/associa-viewer', { method: 'POST', body: JSON.stringify(body) }, token),
    // Solo scollegamento: lo stato dell'account non cambia.
    disassociaViewer:(socioId: string) =>
      request<void>(`/api/admin/associa-viewer/${socioId}`, { method: 'DELETE' }, token),
    cambiaAttivo:   (utenteId: string, attivo: boolean) =>
      request<Esito>('/api/admin/attivo', { method: 'POST', body: JSON.stringify({ utente_id: utenteId, attivo }) }, token),
    // Ruolo nel club (socio o istruttore). Il privilegio di amministrare l'app
    // è indipendente e si imposta a parte con impostaAdmin.
    impostaRuolo:   (utenteId: string, ruolo: Ruolo) =>
      request<Esito>('/api/admin/ruolo', { method: 'POST', body: JSON.stringify({ utente_id: utenteId, ruolo }) }, token),
    impostaAdmin:   (utenteId: string, admin: boolean) =>
      request<Esito>('/api/admin/amministratore', { method: 'POST', body: JSON.stringify({ utente_id: utenteId, admin }) }, token),
    // Restituisce la password temporanea generata: va consegnata
    // all'interessato, non viene inviata per email e non è più recuperabile.
    resetPassword:  (body: { utente_id: string }) =>
      request<{ password_temporanea: string }>('/api/admin/reset-password', { method: 'POST', body: JSON.stringify(body) }, token),

    // Versione del backend in esecuzione (pagina Info)
    getVersion:     ()                    => request<{ version: string }>('/api/version', {}, token),
  };
}
