/**
 * Gestione degli utenti: registrazione, accesso, ruoli, password.
 *
 * Sostituisce integralmente ciò che prima faceva Keycloak. Gli identificativi
 * degli utenti (utente.id) sono gli stessi valori che finiscono nel claim
 * `sub` dei token e che il backend applicativo salva in socio.id_viewer: è
 * quel collegamento a tenere insieme un account e il socio corrispondente.
 */

import { query } from '../db/client.js';
import {
  BadRequestError, ConflictError, NotFoundError, UnauthorizedError, ForbiddenError,
} from '../middleware/errors.js';
import {
  hashPassword, verificaPassword, vaRiCifrata,
  generaPasswordTemporanea, erroreValidazionePassword,
} from '../crypto/password.js';
import {
  firmaAccessToken, generaRefreshToken, hashRefreshToken,
  DURATA_ACCESS_TOKEN_SECONDI, DURATA_REFRESH_TOKEN_SECONDI,
  type ClaimsUtente,
} from '../crypto/tokens.js';

export type Ruolo = 'admin' | 'viewer';

export interface Utente {
  id: string;
  email: string;
  nome: string;
  cognome: string;
  telefono: string | null;
  ruolo: Ruolo;
  attivo: boolean;
  cambio_password_richiesto: boolean;
  ultimo_accesso: string | null;
  created_at: string;
}

/** Riga del database, con l'hash che non deve mai uscire dal servizio. */
interface RigaUtente extends Utente {
  password_hash: string;
}

export interface Sessione {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  utente: Utente;
}

// Campi restituiti dalle query: password_hash è escluso ovunque non serva,
// così non può finire per distrazione in una risposta HTTP.
const CAMPI_PUBBLICI = `id, email, nome, cognome, telefono, ruolo, attivo,
                        cambio_password_richiesto, ultimo_accesso, created_at`;

/**
 * Le email si confrontano senza distinzione di maiuscole: senza questa
 * normalizzazione "Mario@x.it" e "mario@x.it" diventerebbero due account
 * distinti, e l'utente non capirebbe perché il login "non funziona".
 */
function normalizzaEmail(email: string): string {
  return String(email ?? '').trim().toLowerCase();
}

function validaEmail(email: string): void {
  // Volutamente permissiva: le regex severe per le email rifiutano indirizzi
  // validi più spesso di quanto blocchino errori di battitura.
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new BadRequestError('Email non valida');
  }
}

function toUtente(row: unknown): Utente {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    email: r.email as string,
    nome: r.nome as string,
    cognome: r.cognome as string,
    telefono: (r.telefono as string | null) ?? null,
    ruolo: r.ruolo as Ruolo,
    attivo: r.attivo as boolean,
    cambio_password_richiesto: r.cambio_password_richiesto as boolean,
    ultimo_accesso: (r.ultimo_accesso as string | null) ?? null,
    created_at: r.created_at as string,
  };
}

function claimsDa(utente: Utente): ClaimsUtente {
  return {
    sub: utente.id,
    email: utente.email,
    nome: utente.nome,
    cognome: utente.cognome,
    roles: [utente.ruolo],
    cambio_password_richiesto: utente.cambio_password_richiesto,
  };
}

/** Emette access token + refresh token e registra quest'ultimo per poterlo revocare. */
async function apriSessione(utente: Utente): Promise<Sessione> {
  const accessToken = await firmaAccessToken(claimsDa(utente));
  const refreshToken = generaRefreshToken();

  await query(
    `INSERT INTO refresh_token (utente_id, token_hash, expires_at)
     VALUES (:utenteId, :tokenHash, NOW() + (:durata * INTERVAL '1 second'))`,
    {
      utenteId: utente.id,
      tokenHash: hashRefreshToken(refreshToken),
      durata: DURATA_REFRESH_TOKEN_SECONDI,
    }
  );

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: DURATA_ACCESS_TOKEN_SECONDI,
    utente,
  };
}

// ---------------------------------------------------------------
// Registrazione e accesso
// ---------------------------------------------------------------

export interface DatiRegistrazione {
  email: string;
  password: string;
  nome: string;
  cognome: string;
  telefono?: string;
}

/**
 * Registra un nuovo utente, sempre con ruolo `viewer`: la promozione ad admin
 * è un'azione riservata a un admin esistente (vedi cambiaRuolo). Il ruolo non
 * è accettato in ingresso proprio per non renderlo auto-assegnabile.
 */
export async function registra(dati: DatiRegistrazione): Promise<Sessione> {
  const email = normalizzaEmail(dati.email);
  validaEmail(email);

  const nome = String(dati.nome ?? '').trim();
  const cognome = String(dati.cognome ?? '').trim();
  if (!nome) throw new BadRequestError('Il nome è obbligatorio');
  if (!cognome) throw new BadRequestError('Il cognome è obbligatorio');

  const errorePassword = erroreValidazionePassword(dati.password);
  if (errorePassword) throw new BadRequestError(errorePassword);

  const esistente = await query(`SELECT id FROM utente WHERE email = :email`, { email });
  if (esistente.rows.length > 0) {
    throw new ConflictError('Esiste già un account con questa email');
  }

  const result = await query(
    `INSERT INTO utente (email, password_hash, nome, cognome, telefono, ruolo)
     VALUES (:email, :passwordHash, :nome, :cognome, :telefono, 'viewer')
     RETURNING ${CAMPI_PUBBLICI}`,
    {
      email,
      passwordHash: await hashPassword(dati.password),
      nome,
      cognome,
      telefono: String(dati.telefono ?? '').trim() || null,
    }
  );

  return apriSessione(toUtente(result.rows[0]));
}

/**
 * Verifica le credenziali e apre una sessione.
 *
 * Il messaggio di errore è identico che l'email non esista o che la password
 * sia sbagliata: distinguerli permetterebbe di scoprire quali indirizzi sono
 * registrati. Per lo stesso motivo, quando l'email non esiste si calcola
 * comunque un hash fittizio, così il tempo di risposta non tradisce la
 * differenza.
 */
export async function login(email: string, password: string): Promise<Sessione> {
  const emailNormalizzata = normalizzaEmail(email);

  const result = await query(
    `SELECT ${CAMPI_PUBBLICI}, password_hash FROM utente WHERE email = :email`,
    { email: emailNormalizzata }
  );

  if (result.rows.length === 0) {
    await verificaPassword(password ?? '', 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
    throw new UnauthorizedError('Email o password non corretti');
  }

  const riga = result.rows[0] as unknown as RigaUtente;
  const corretta = await verificaPassword(password ?? '', riga.password_hash);
  if (!corretta) throw new UnauthorizedError('Email o password non corretti');

  if (!riga.attivo) throw new ForbiddenError('Account disattivato');

  // Aggiorna i parametri di hashing se nel frattempo sono stati irrobustiti:
  // l'unico momento in cui la password è disponibile in chiaro è questo.
  if (vaRiCifrata(riga.password_hash)) {
    await query(
      `UPDATE utente SET password_hash = :hash WHERE id = :id`,
      { id: riga.id, hash: await hashPassword(password) }
    );
  }

  await query(`UPDATE utente SET ultimo_accesso = NOW() WHERE id = :id`, { id: riga.id });

  return apriSessione(toUtente(riga));
}

/**
 * Scambia un refresh token valido con una sessione nuova, revocando quello
 * usato (rotazione): un token intercettato vale al massimo un utilizzo, e il
 * successivo tentativo con lo stesso valore fallisce.
 */
export async function rinnova(refreshToken: string): Promise<Sessione> {
  if (!refreshToken) throw new UnauthorizedError('Refresh token mancante');

  const result = await query(
    `SELECT rt.id AS token_id,
            u.id, u.email, u.nome, u.cognome, u.telefono, u.ruolo, u.attivo,
            u.cambio_password_richiesto, u.ultimo_accesso, u.created_at
     FROM refresh_token rt
     JOIN utente u ON u.id = rt.utente_id
     WHERE rt.token_hash = :tokenHash
       AND rt.revoked_at IS NULL
       AND rt.expires_at > NOW()`,
    { tokenHash: hashRefreshToken(refreshToken) }
  );

  if (result.rows.length === 0) throw new UnauthorizedError('Sessione scaduta, effettua di nuovo l\'accesso');

  const riga = result.rows[0] as Record<string, unknown>;
  const utente = toUtente(riga);
  if (!utente.attivo) throw new ForbiddenError('Account disattivato');

  await query(
    `UPDATE refresh_token SET revoked_at = NOW() WHERE id = :id`,
    { id: riga.token_id }
  );

  return apriSessione(utente);
}

/** Revoca un singolo refresh token (logout dal dispositivo corrente). */
export async function logout(refreshToken: string): Promise<void> {
  if (!refreshToken) return;
  await query(
    `UPDATE refresh_token SET revoked_at = NOW()
     WHERE token_hash = :tokenHash AND revoked_at IS NULL`,
    { tokenHash: hashRefreshToken(refreshToken) }
  );
}

/** Revoca tutte le sessioni di un utente (cambio password, disattivazione, reset). */
async function revocaTutteLeSessioni(utenteId: string): Promise<void> {
  await query(
    `UPDATE refresh_token SET revoked_at = NOW()
     WHERE utente_id = :utenteId AND revoked_at IS NULL`,
    { utenteId }
  );
}

// ---------------------------------------------------------------
// Password
// ---------------------------------------------------------------

/**
 * Cambio password da parte dell'utente stesso. Richiede quella attuale anche
 * se la sessione è già autenticata: senza, un browser lasciato aperto
 * basterebbe a prendere possesso permanente dell'account.
 */
export async function cambiaPassword(
  utenteId: string,
  passwordAttuale: string,
  passwordNuova: string
): Promise<Sessione> {
  const errore = erroreValidazionePassword(passwordNuova);
  if (errore) throw new BadRequestError(errore);

  const result = await query(
    `SELECT ${CAMPI_PUBBLICI}, password_hash FROM utente WHERE id = :id`,
    { id: utenteId }
  );
  if (result.rows.length === 0) throw new NotFoundError('Utente non trovato');

  const riga = result.rows[0] as unknown as RigaUtente;
  const corretta = await verificaPassword(passwordAttuale ?? '', riga.password_hash);
  if (!corretta) throw new UnauthorizedError('La password attuale non è corretta');

  await query(
    `UPDATE utente SET password_hash = :hash, cambio_password_richiesto = FALSE WHERE id = :id`,
    { id: utenteId, hash: await hashPassword(passwordNuova) }
  );

  // Tutte le sessioni aperte vengono chiuse: se la password è stata cambiata
  // perché si sospetta un accesso altrui, lasciarle valide vanificherebbe
  // l'operazione. Compresa quella in corso — da cui la sessione nuova
  // restituita qui, altrimenti l'utente si ritroverebbe disconnesso proprio
  // per aver fatto la cosa giusta. Il flag nel token va aggiornato comunque:
  // quello vecchio riporta ancora cambio_password_richiesto a true.
  await revocaTutteLeSessioni(utenteId);

  return apriSessione({ ...toUtente(riga), cambio_password_richiesto: false });
}

/**
 * Reset eseguito da un admin: genera una password temporanea, la restituisce
 * una sola volta perché l'admin la consegni all'interessato, e obbliga a
 * sostituirla al primo accesso.
 *
 * Non c'è invio di email — il progetto non ha un SMTP — quindi la consegna
 * avviene fuori dall'applicazione (a voce, messaggio). È il motivo per cui la
 * password è generata leggibile e le sessioni attive vengono chiuse subito.
 */
export async function resetPasswordDaAdmin(utenteId: string): Promise<{ password_temporanea: string }> {
  const esistente = await query(`SELECT id FROM utente WHERE id = :id`, { id: utenteId });
  if (esistente.rows.length === 0) throw new NotFoundError('Utente non trovato');

  const temporanea = generaPasswordTemporanea();
  await query(
    `UPDATE utente
     SET password_hash = :hash, cambio_password_richiesto = TRUE
     WHERE id = :id`,
    { id: utenteId, hash: await hashPassword(temporanea) }
  );
  await revocaTutteLeSessioni(utenteId);

  return { password_temporanea: temporanea };
}

// ---------------------------------------------------------------
// Amministrazione
// ---------------------------------------------------------------

export async function listaUtenti(): Promise<Utente[]> {
  const result = await query(
    `SELECT ${CAMPI_PUBBLICI} FROM utente ORDER BY cognome, nome`
  );
  return result.rows.map(toUtente);
}

export async function getUtente(id: string): Promise<Utente> {
  const result = await query(`SELECT ${CAMPI_PUBBLICI} FROM utente WHERE id = :id`, { id });
  if (result.rows.length === 0) throw new NotFoundError('Utente non trovato');
  return toUtente(result.rows[0]);
}

/**
 * Cambia il ruolo di un utente. `attoreId` è l'admin che esegue l'operazione:
 * serve a impedirgli di togliersi da solo i privilegi, che è il modo più
 * semplice di restare senza nessun admin nell'istanza.
 */
export async function cambiaRuolo(id: string, ruolo: Ruolo, attoreId: string): Promise<Utente> {
  if (ruolo !== 'admin' && ruolo !== 'viewer') {
    throw new BadRequestError('Ruolo non valido');
  }
  if (id === attoreId && ruolo !== 'admin') {
    throw new BadRequestError('Non puoi rimuovere a te stesso il ruolo di amministratore');
  }

  const result = await query(
    `UPDATE utente SET ruolo = :ruolo WHERE id = :id RETURNING ${CAMPI_PUBBLICI}`,
    { id, ruolo }
  );
  if (result.rows.length === 0) throw new NotFoundError('Utente non trovato');

  // Il ruolo è dentro il token: finché quello in circolazione non scade,
  // porterebbe ancora il ruolo vecchio. Chiudere le sessioni rende la modifica
  // effettiva subito, al costo di un nuovo accesso per l'interessato.
  await revocaTutteLeSessioni(id);

  return toUtente(result.rows[0]);
}

export async function cambiaAttivo(id: string, attivo: boolean, attoreId: string): Promise<Utente> {
  if (id === attoreId && !attivo) {
    throw new BadRequestError('Non puoi disattivare il tuo stesso account');
  }

  const result = await query(
    `UPDATE utente SET attivo = :attivo WHERE id = :id RETURNING ${CAMPI_PUBBLICI}`,
    { id, attivo }
  );
  if (result.rows.length === 0) throw new NotFoundError('Utente non trovato');

  if (!attivo) await revocaTutteLeSessioni(id);
  return toUtente(result.rows[0]);
}

/**
 * Crea il primo amministratore se non esiste ancora nessun utente.
 * Idempotente: a istanza già popolata non fa nulla e non tocca gli account
 * esistenti, così può essere eseguito a ogni avvio senza rischi.
 */
export async function creaAdminIniziale(email: string, password: string): Promise<boolean> {
  const conteggio = await query(`SELECT COUNT(*) AS n FROM utente`);
  if (Number(conteggio.rows[0].n) > 0) return false;

  const emailNormalizzata = normalizzaEmail(email);
  validaEmail(emailNormalizzata);
  const errore = erroreValidazionePassword(password);
  if (errore) throw new BadRequestError(`Password dell'admin iniziale non valida: ${errore}`);

  await query(
    `INSERT INTO utente (email, password_hash, nome, cognome, ruolo, cambio_password_richiesto)
     VALUES (:email, :hash, 'Amministratore', 'Clubby', 'admin', TRUE)`,
    { email: emailNormalizzata, hash: await hashPassword(password) }
  );
  return true;
}

/** Elimina i refresh token scaduti o revocati da tempo. */
export async function pulisciTokenScaduti(): Promise<number> {
  const result = await query(
    `DELETE FROM refresh_token
     WHERE expires_at < NOW() OR revoked_at < NOW() - INTERVAL '7 days'`
  );
  return result.numberOfRecordsUpdated ?? 0;
}
