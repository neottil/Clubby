/**
 * Costruzione dei dati di un test (spec 014).
 *
 * Ogni test parte da database vuoti (ambiente.ts li azzera prima di ciascuno)
 * e crea con queste funzioni SOLO ciò che verifica. Niente dataset comune: un
 * caso che ha bisogno di un socio con un voucher crea quello, e i totali che
 * controlla sono esattamente quelli dei record che ha creato.
 *
 * I dati si creano dalle API, come farebbe un admin dall'interfaccia. Una cosa
 * sola passa dal database: il privilegio del primo admin, che dalle API può
 * concedere solo un altro admin.
 *
 * I nomi restano riconoscibili come dati di prova (email su clubby.test, nomi
 * che finiscono in "_test"): non servono più a cancellarli, ma rendono leggibile
 * un log o un dump del database dei test.
 */

import { randomUUID } from 'node:crypto';
import { api, atteso, authApi, claims, giorniFa, type Sessione } from './helpers.ts';
import { db } from './ambiente.ts';

export const DOMINIO = 'clubby.test';
const NOTA = 'Creato dai test API';

// Una password nuova a ogni esecuzione: nessuna credenziale fissa nel codice.
const PASSWORD = `Test_${randomUUID()}`;

/** Una sessione che sa anche rifare l'accesso (dopo un cambio di ruolo). */
export interface Utente extends Sessione {
  email: string;
}

export type Ruolo = 'socio' | 'istruttore';

/** Email di prova da un nome breve: "socio1" → socio1_test@clubby.test. */
export function email(nome: string): string {
  return `${nome}_test@${DOMINIO}`;
}

/** Accede con le credenziali di prova; rifà l'accesso se riceve un Utente. */
export async function accedi(chi: string | { email: string }): Promise<Utente> {
  const indirizzo = typeof chi === 'string' ? chi : chi.email;
  const r = await authApi(undefined, 'POST', '/auth/login', { email: indirizzo, password: PASSWORD });
  const body = atteso(r, 200, `accesso di ${indirizzo}`);
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    id: body.utente.id,
    roles: claims(body.access_token).roles,
    email: indirizzo,
  };
}

/** Registrazione pubblica: l'account nasce socio, senza privilegi. */
export async function registra(nome: string): Promise<Utente> {
  const indirizzo = email(nome);
  const r = await authApi(undefined, 'POST', '/auth/register', { email: indirizzo, password: PASSWORD });
  atteso(r, 201, `registrazione di ${indirizzo}`);
  return accedi(indirizzo);
}

/**
 * Il primo admin del test. Il privilegio passa dal database perché dalle API
 * lo concede solo un altro admin; il ruolo nel club è a scelta (istruttore per
 * default, come l'admin di un club piccolo che tiene anche le lezioni).
 */
export async function creaAdmin(nome = 'admin', ruolo: Ruolo = 'istruttore'): Promise<Utente> {
  const u = await registra(nome);
  await db.auth.query('UPDATE utente SET ruolo = $1, admin = TRUE WHERE id = $2', [ruolo, u.id]);
  // Accesso nuovo: il token di prima porta ancora il ruolo di socio.
  return accedi(u);
}

/** Esegue una chiamata di preparazione come admin, fallendo con un messaggio leggibile. */
async function esegui(admin: Sessione, method: string, path: string, body: unknown, cosa: string): Promise<any> {
  return atteso(await api(admin, method, path, body), [200, 201, 204], cosa);
}

/** Un account con il ruolo indicato, assegnato dall'admin come dall'interfaccia. */
export async function creaAccount(admin: Sessione, nome: string, ruolo: Ruolo = 'socio'): Promise<Utente> {
  const u = await registra(nome);
  if (ruolo === 'socio') return u;
  await esegui(admin, 'POST', '/api/admin/ruolo', { utente_id: u.id, ruolo }, `ruolo di ${nome}`);
  // Il cambio di ruolo chiude le sessioni: serve un accesso nuovo.
  return accedi(u);
}

/** Un'attività di listino; `attiva: false` la disattiva subito dopo. */
export async function creaAttivita(admin: Sessione, nome: string, costo = 30, attiva = true): Promise<string> {
  const creata = await esegui(admin, 'POST', '/api/attivita', { nome: `${nome}_test`, costo_default: costo }, `attività ${nome}`);
  if (!attiva) await esegui(admin, 'PATCH', `/api/attivita/${creata.id}`, { attiva: false }, `disattivazione di ${nome}`);
  return creata.id;
}

/** Abilita un istruttore alle attività indicate (l'insieme completo, come la PUT). */
export async function abilita(admin: Sessione, istruttore: Sessione, attivita: string[]): Promise<void> {
  await esegui(admin, 'PUT', `/api/istruttori/${istruttore.id}/attivita`, { attivita_ids: attivita }, 'abilitazioni');
}

/** Un istruttore abilitato alle attività indicate. */
export async function creaIstruttore(admin: Sessione, nome: string, attivita: string[] = []): Promise<Utente> {
  const u = await creaAccount(admin, nome, 'istruttore');
  if (attivita.length > 0) await abilita(admin, u, attivita);
  return u;
}

export interface OpzioniSocio {
  /** Nome e cognome; il suffisso _test lo aggiunge la fabbrica. */
  nome?: string;
  cognome?: string;
  /** Account da collegare alla scheda (ne usa l'email). */
  account?: Utente;
  /** Email della scheda, se non c'è un account. */
  email?: string;
  /** Voucher acquistato con una prima ricarica di questo importo. */
  ricarica?: number;
  /** Voucher importato con questo saldo, senza ricariche registrabili. */
  saldoIniziale?: number;
}

export interface Socio {
  id: string;
  /** Id del voucher, se ne è stato creato uno. */
  voucherId?: string;
}

/** Una scheda socio, collegata a un account e con un voucher se richiesti. */
export async function creaSocio(admin: Sessione, nome: string, opz: OpzioniSocio = {}): Promise<Socio> {
  const indirizzo = opz.account?.email ?? opz.email ?? email(nome);
  const socio = await esegui(admin, 'POST', '/api/soci', {
    nome: `${opz.nome ?? nome}_test`,
    cognome: `${opz.cognome ?? nome}_test`,
    email: indirizzo,
    telefono: '000 0000000',
    note: NOTA,
  }, `socio ${nome}`);
  if (opz.account) {
    await esegui(admin, 'POST', '/api/admin/associa-viewer', { socio_id: socio.id, utente_id: opz.account.id }, `collegamento di ${nome}`);
  }
  let voucherId: string | undefined;
  if (opz.ricarica !== undefined || opz.saldoIniziale !== undefined) {
    const corpo = opz.ricarica !== undefined
      ? { socio_id: socio.id, ricarica: opz.ricarica }
      : { socio_id: socio.id, saldo_iniziale: opz.saldoIniziale };
    voucherId = (await esegui(admin, 'POST', '/api/voucher', corpo, `voucher di ${nome}`)).id;
  }
  return { id: socio.id, voucherId };
}

/** Una ricarica registrata dall'admin; restituisce il movimento. */
export async function ricarica(admin: Sessione, voucherId: string, importo: number, extra: Record<string, unknown> = {}): Promise<any> {
  return esegui(admin, 'POST', `/api/voucher/${voucherId}/movimenti`,
    { tipo: 'ricarica', importo, descrizione: NOTA, ...extra }, 'ricarica');
}

export interface OpzioniIncontro {
  socio: string;
  attivita: string;
  istruttore: Sessione;
  costo?: number;
  /** Data dell'incontro, in giorni fa (default 1). */
  giorni?: number;
  note?: string;
}

/** Un incontro, registrato da `chi` (l'admin o l'istruttore che lo tiene). */
export async function creaIncontro(chi: Sessione, opz: OpzioniIncontro): Promise<any> {
  return esegui(chi, 'POST', '/api/incontri', {
    socio_id: opz.socio,
    data_incontro: giorniFa(opz.giorni ?? 1),
    attivita_id: opz.attivita,
    istruttore_id: opz.istruttore.id,
    costo: opz.costo ?? 30,
    note: opz.note ?? NOTA,
  }, 'incontro');
}

/** Un taglio di ricarica (modalità map). */
export async function creaTaglio(admin: Sessione, importo: number, valore: number): Promise<string> {
  return (await esegui(admin, 'POST', '/api/ricarica-tagli', { importo, valore }, `taglio da ${importo}`)).id;
}

export interface OpzioniTesseramento {
  /** Data del rinnovo, in giorni fa (default 0, oggi). */
  rinnovo?: number;
  /** Scadenza, in giorni fa: negativa per una data futura (default -365). */
  scadenza?: number;
}

/** Un tesseramento (rinnovo) con il suo numero di tessera; restituisce la riga creata. */
export async function creaTesseramento(admin: Sessione, socioId: string, numero: string, opz: OpzioniTesseramento = {}): Promise<any> {
  return esegui(admin, 'POST', '/api/tesseramenti', {
    socio_id: socioId,
    data_rinnovo: giorniFa(opz.rinnovo ?? 0),
    scadenza: giorniFa(opz.scadenza ?? -365),
    numero_tessera: numero,
  }, `tesseramento ${numero}`);
}
