/**
 * Gestione degli utenti: registrazione, accesso, ruoli, password.
 *
 * Gli identificativi degli utenti (utente.id) sono gli stessi valori che
 * finiscono nel claim `sub` dei token e che il backend applicativo salva in
 * socio.id_viewer: è quel collegamento a tenere insieme un account e il socio
 * corrispondente.
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

/**
 * Ruolo nel club: socio o istruttore. Un istruttore può a sua volta partecipare
 * come socio agli incontri di un altro istruttore.
 *
 * Amministrare l'applicazione NON è un ruolo: è il flag `admin` sull'account,
 * indipendente da questo. Quando era un terzo ruolo alternativo, chi
 * amministrava non poteva essere anche istruttore.
 */
export type Ruolo = 'socio' | 'istruttore';

const RUOLI: readonly Ruolo[] = ['socio', 'istruttore'];

/**
 * Account. Nome, cognome e telefono NON sono qui: l'anagrafica è del socio,
 * nel database applicativo, che ne è l'unica fonte. Vedi db/schema.sql.
 */
export interface Utente {
  id: string;
  email: string;
  ruolo: Ruolo;
  /** Privilegio di amministrare l'applicazione, indipendente dal ruolo. */
  admin: boolean;
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
const CAMPI_PUBBLICI = `id, email, ruolo, admin, attivo,
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
    ruolo: r.ruolo as Ruolo,
    admin: r.admin === true,
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
    // Il privilegio di amministrazione viaggia nello stesso elenco del ruolo:
    // chi verifica il token controlla semplicemente se contiene 'admin', senza
    // dover conoscere un claim in più.
    roles: utente.admin ? [utente.ruolo, 'admin'] : [utente.ruolo],
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
}

/**
 * Registra un nuovo utente, sempre come `socio` e senza privilegi di
 * amministrazione: ruolo e privilegi li concede un admin esistente (vedi
 * cambiaRuolo e cambiaAdmin). Il ruolo non
 * è accettato in ingresso proprio per non renderlo auto-assegnabile.
 *
 * Servono solo email e password. L'anagrafica non viene chiesta qui perché non
 * appartiene a questo servizio: sta sulla riga del socio, e il collegamento fra
 * account e socio è un'operazione manuale di un amministratore, mai automatica.
 */
export async function registra(dati: DatiRegistrazione): Promise<Sessione> {
  const email = normalizzaEmail(dati.email);
  validaEmail(email);

  const errorePassword = erroreValidazionePassword(dati.password);
  if (errorePassword) throw new BadRequestError(errorePassword);

  const esistente = await query(`SELECT id FROM utente WHERE email = :email`, { email });
  if (esistente.rows.length > 0) {
    throw new ConflictError('Esiste già un account con questa email');
  }

  const result = await query(
    `INSERT INTO utente (email, password_hash, ruolo)
     VALUES (:email, :passwordHash, 'socio')
     RETURNING ${CAMPI_PUBBLICI}`,
    { email, passwordHash: await hashPassword(dati.password) }
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
            u.id, u.email, u.ruolo, u.admin, u.attivo,
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
    `SELECT ${CAMPI_PUBBLICI} FROM utente ORDER BY email`
  );
  return result.rows.map(toUtente);
}

/** Un istruttore come lo vede chi non è admin: l'identificativo e l'email. */
export interface Istruttore {
  id: string;
  email: string;
}

/**
 * Elenco degli istruttori attivi, leggibile da qualsiasi utente autenticato.
 *
 * Esiste separato da listaUtenti (riservato agli admin) perché serve a chiunque
 * apra la pagina Incontri: senza, per mostrare "chi ha tenuto l'incontro"
 * servirebbero privilegi di amministrazione.
 *
 * Restituisce id ed email e nient'altro: il nominativo di un istruttore è
 * quello del suo socio, e vive nel database applicativo. È il backend a
 * completarlo, vedi handlers/istruttori.ts.
 */
export async function listaIstruttori(): Promise<Istruttore[]> {
  const result = await query(
    `SELECT id, email FROM utente
     WHERE ruolo = 'istruttore' AND attivo = TRUE
     ORDER BY email`
  );
  return result.rows.map(r => ({ id: r.id as string, email: r.email as string }));
}

export async function getUtente(id: string): Promise<Utente> {
  const result = await query(`SELECT ${CAMPI_PUBBLICI} FROM utente WHERE id = :id`, { id });
  if (result.rows.length === 0) throw new NotFoundError('Utente non trovato');
  return toUtente(result.rows[0]);
}

/**
 * Cambia il ruolo nel club di un utente (socio o istruttore).
 *
 * Non tocca il privilegio di amministrazione, quindi un admin può cambiare
 * anche il proprio ruolo senza rischiare di chiudersi fuori.
 */
export async function cambiaRuolo(id: string, ruolo: Ruolo): Promise<Utente> {
  if (!RUOLI.includes(ruolo)) {
    throw new BadRequestError(`Ruolo non valido. Valori ammessi: ${RUOLI.join(', ')}`);
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

/**
 * Concede o toglie il privilegio di amministrare l'applicazione.
 *
 * `attoreId` è l'admin che esegue l'operazione: non può togliere il privilegio
 * a sé stesso. È anche ciò che impedisce di restare senza amministratori — per
 * toglierlo all'ultimo admin servirebbe un altro admin.
 */
export async function cambiaAdmin(id: string, admin: boolean, attoreId: string): Promise<Utente> {
  if (id === attoreId && !admin) {
    throw new BadRequestError('Non puoi rimuovere a te stesso il privilegio di amministratore');
  }

  const result = await query(
    `UPDATE utente SET admin = :admin WHERE id = :id RETURNING ${CAMPI_PUBBLICI}`,
    { id, admin }
  );
  if (result.rows.length === 0) throw new NotFoundError('Utente non trovato');

  // Come per il ruolo: il privilegio viaggia nel token.
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

export interface DatiAdminIniziale {
  email: string;
  password: string;
}

/**
 * Crea il primo amministratore se non esiste ancora nessun utente.
 *
 * Idempotente: a istanza già popolata non fa nulla e non tocca gli account
 * esistenti, così può essere eseguito a ogni avvio senza rischi.
 *
 * Solo email e password: l'admin iniziale è un account, non una persona
 * censita. Se chi amministra è anche un socio dell'associazione, si crea la
 * scheda socio dal pannello e la si collega a questo account — il
 * collegamento fra account e socio è sempre un'operazione manuale.
 */
export async function creaAdminIniziale(dati: DatiAdminIniziale): Promise<boolean> {
  const conteggio = await query(`SELECT COUNT(*) AS n FROM utente`);
  if (Number(conteggio.rows[0].n) > 0) return false;

  const emailNormalizzata = normalizzaEmail(dati.email);
  validaEmail(emailNormalizzata);
  const errore = erroreValidazionePassword(dati.password);
  if (errore) throw new BadRequestError(`Password dell'admin iniziale non valida: ${errore}`);

  await query(
    `INSERT INTO utente (email, password_hash, ruolo, admin, cambio_password_richiesto)
     VALUES (:email, :hash, 'socio', TRUE, TRUE)`,
    { email: emailNormalizzata, hash: await hashPassword(dati.password) }
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
