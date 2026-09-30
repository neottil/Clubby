/**
 * Amministrazione: ruoli degli utenti e associazione utente ↔ socio.
 *
 * I ruoli e gli account vivono nell'authorizer, non qui: questo servizio si
 * limita a inoltrargli le richieste. L'associazione utente ↔ socio invece è
 * dato applicativo e resta nel database dell'app (socio.id_viewer).
 *
 * Le chiamate all'authorizer riportano il token dell'admin che ha fatto la
 * richiesta, invece di usare credenziali di servizio: così l'authorizer
 * applica i propri controlli sull'identità reale di chi opera (compreso il
 * divieto di togliersi da soli il ruolo di admin), e il backend non custodisce
 * alcun segreto che gli permetterebbe di modificare utenti per conto proprio.
 */

import { BadRequestError, NotFoundError } from '../middleware/auth.js';
import {
  collegaSocioAdAccount,
  disassociaViewer,
  getSocioById,
  sociPerAccount,
} from './soci.service.js';
import { chiamaAuthorizer, type UtenteAuth } from './authorizer.client.js';
import { limiteEOffset } from '../util/paginazione.js';

export type { UtenteAuth };

// ---------------------------------------------------------------
// Utenti registrati
// ---------------------------------------------------------------

/**
 * Account con il nominativo del socio a cui è collegato, quando c'è.
 *
 * L'authorizer conosce solo email e ruolo: il nome di una persona vive sulla
 * sua riga di socio, in questo database. Un account non ancora collegato non
 * ha quindi alcun nominativo, ed è corretto che sia così — l'unica cosa che se
 * ne sa è l'email con cui si è registrato.
 */
export interface UtenteAmministrabile extends UtenteAuth {
  socio_id: string | null;
  nome: string | null;
  cognome: string | null;
  telefono: string | null;
}

export async function listaUtenti(tokenChiamante: string): Promise<UtenteAmministrabile[]> {
  const [account, sociCollegati] = await Promise.all([
    chiamaAuthorizer<UtenteAuth[]>('/admin/utenti', tokenChiamante),
    sociPerAccount(),
  ]);

  return account.map(u => {
    const socio = sociCollegati.get(u.id);
    return {
      ...u,
      socio_id: socio?.id ?? null,
      nome:     socio?.nome ?? null,
      cognome:  socio?.cognome ?? null,
      telefono: socio?.telefono ?? null,
    };
  });
}

/** Nominativo di un account, o null se non è collegato a un socio. */
function nominativo(u: UtenteAmministrabile): string | null {
  return u.cognome || u.nome ? `${u.cognome ?? ''} ${u.nome ?? ''}`.trim() : null;
}

/**
 * Account a pagine, nell'ordine della card Utenti - Soci: in cima quelli da
 * collegare (chiedono un intervento), poi gli altri per nominativo; chi non ha
 * nominativo per email.
 *
 * La paginazione si fa qui e non a database perché gli account vivono
 * nell'authorizer e il nominativo nel database applicativo: non c'è una query
 * sola che li unisca. Gli account sono tanti quanti gli iscritti, e il browser
 * riceve comunque la sola pagina.
 *
 * `da_collegare` conta gli account attivi senza scheda su tutti gli account,
 * non sulla pagina: è il numero mostrato nel riepilogo della card.
 */
export async function listaUtentiPaginata(
  tokenChiamante: string,
  options: { q?: string; limit?: number; offset?: number }
): Promise<{ rows: UtenteAmministrabile[]; total: number; da_collegare: number }> {
  const { limit, offset } = limiteEOffset(options);
  const tutti = await listaUtenti(tokenChiamante);

  const filtrati = tutti.filter(u =>
    corrispondeRicerca(`${u.cognome ?? ''} ${u.nome ?? ''} ${u.email} ${u.telefono ?? ''}`, options.q)
  );
  filtrati.sort((a, b) => {
    const collegatoA = a.socio_id ? 1 : 0;
    const collegatoB = b.socio_id ? 1 : 0;
    if (collegatoA !== collegatoB) return collegatoA - collegatoB;
    return (nominativo(a) ?? a.email).localeCompare(nominativo(b) ?? b.email, 'it');
  });

  return {
    rows: filtrati.slice(offset, offset + limit),
    total: filtrati.length,
    da_collegare: tutti.filter(u => !u.socio_id && u.attivo).length,
  };
}

/** Stessa regola di util/ricerca.ts, per elenchi già in memoria. */
function corrispondeRicerca(testo: string, q: string | undefined): boolean {
  const parole = (q ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const dove = testo.toLowerCase();
  return parole.every(p => dove.includes(p));
}

/**
 * Risolve un riferimento a utente — id oppure email — nel suo id.
 * L'interfaccia admin passa l'id, ma accettare anche l'email rende utilizzabili
 * a mano gli endpoint (e i file Bruno) senza dover prima cercare l'UUID.
 */
async function risolviUtenteId(riferimento: string, tokenChiamante: string): Promise<string> {
  if (!riferimento) throw new BadRequestError('Utente non specificato');
  if (!riferimento.includes('@')) return riferimento;

  const utenti = await listaUtenti(tokenChiamante);
  const trovato = utenti.find(u => u.email.toLowerCase() === riferimento.toLowerCase());
  if (!trovato) throw new NotFoundError(`Utente '${riferimento}' non trovato`);
  return trovato.id;
}

async function cambiaRuolo(
  riferimento: string,
  ruolo: UtenteAuth['ruolo'],
  tokenChiamante: string
): Promise<void> {
  const id = await risolviUtenteId(riferimento, tokenChiamante);
  await chiamaAuthorizer(`/admin/utenti/${id}/ruolo`, tokenChiamante, {
    method: 'POST',
    body: JSON.stringify({ ruolo }),
  });
}

const RUOLI: UtenteAuth['ruolo'][] = ['socio', 'istruttore'];

/**
 * Imposta il ruolo di un utente. Validato qui oltre che nell'authorizer: un
 * valore fuori elenco deve fermarsi al primo servizio che lo vede, con un
 * messaggio che dice quali sono quelli ammessi.
 */
export async function impostaRuolo(
  riferimento: string,
  ruolo: string,
  tokenChiamante: string
): Promise<void> {
  if (!RUOLI.includes(ruolo as UtenteAuth['ruolo'])) {
    throw new BadRequestError(`Ruolo non valido: ammessi ${RUOLI.join(', ')}`);
  }
  await cambiaRuolo(riferimento, ruolo as UtenteAuth['ruolo'], tokenChiamante);
}

/**
 * Concede o toglie il privilegio di amministrare l'app. Il divieto di toglierlo
 * a sé stessi è applicato dall'authorizer, che conosce l'identità reale del
 * chiamante dal token.
 */
export async function impostaAdmin(
  riferimento: string,
  admin: boolean,
  tokenChiamante: string
): Promise<void> {
  const id = await risolviUtenteId(riferimento, tokenChiamante);
  await chiamaAuthorizer(`/admin/utenti/${id}/admin`, tokenChiamante, {
    method: 'POST',
    body: JSON.stringify({ admin }),
  });
}

/**
 * Azzera la password di un utente e restituisce quella temporanea generata.
 * Va consegnata all'interessato fuori dall'applicazione (non c'è invio di
 * email) e va sostituita al primo accesso.
 */
export async function resetPasswordUtente(
  riferimento: string,
  tokenChiamante: string
): Promise<{ password_temporanea: string }> {
  const id = await risolviUtenteId(riferimento, tokenChiamante);
  return chiamaAuthorizer<{ password_temporanea: string }>(
    `/admin/utenti/${id}/reset-password`,
    tokenChiamante,
    { method: 'POST' }
  );
}

// ---------------------------------------------------------------
// Associazione utente ↔ socio (dato applicativo, resta nel DB dell'app)
// ---------------------------------------------------------------

/**
 * Collega un account a un socio e allinea l'anagrafica del socio a quella
 * dell'account (vedi collegaSocioAdAccount).
 *
 * È la via manuale, quella che serve quando la persona si è registrata con
 * un'email diversa da quella con cui l'associazione l'aveva censita: lì
 * l'aggancio automatico non può decidere da solo, e stabilire chi è chi resta
 * un giudizio umano.
 */
export async function associaViewerASocio(
  socioId: string,
  riferimentoUtente: string,
  tokenChiamante: string
): Promise<void> {
  const utenti = await listaUtenti(tokenChiamante);
  const riferimento = (riferimentoUtente ?? '').trim();
  if (!riferimento) throw new BadRequestError('Utente non specificato');

  // Accetta id o email, come il resto degli endpoint di amministrazione.
  const account = utenti.find(u =>
    u.id === riferimento || u.email.toLowerCase() === riferimento.toLowerCase()
  );
  if (!account) throw new NotFoundError(`Utente '${riferimentoUtente}' non trovato`);

  // Verifica che il socio esista prima di scrivere l'associazione
  await getSocioById(socioId);
  await collegaSocioAdAccount(socioId, account);
}

/**
 * Scollega un account da un socio. Lo stato dell'account non viene toccato:
 * scollegare e disattivare sono due decisioni distinte dell'admin, e nessuna
 * delle due trascina l'altra.
 */
export async function disassociaViewerDaSocio(socioId: string): Promise<void> {
  await getSocioById(socioId);
  await disassociaViewer(socioId);
}

/**
 * Attiva o disattiva un account. Un account spento non accede più e le sue
 * sessioni vengono revocate, ma non viene eliminato: resta come traccia di chi
 * ha operato, e un'eliminazione vera lascerebbe orfani i riferimenti negli
 * incontri e nelle abilitazioni, che vivono in un altro database. Il
 * collegamento alla scheda socio resta com'è.
 */
export async function cambiaAttivoUtente(
  riferimento: string,
  attivo: boolean,
  tokenChiamante: string
): Promise<void> {
  const id = await risolviUtenteId(riferimento, tokenChiamante);
  await chiamaAuthorizer(`/admin/utenti/${id}/attivo`, tokenChiamante, {
    method: 'POST',
    body: JSON.stringify({ attivo }),
  });
}
