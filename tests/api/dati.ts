/**
 * Dati dei test delle API: ogni file di test li crea prima di cominciare e li
 * elimina alla fine, anche quando i test falliscono. I test non dipendono da
 * nessun dato già presente, né dal seed demo.
 *
 * Ogni record si riconosce a colpo d'occhio come dato di prova: le email sono
 * sul dominio clubby.test, e nomi e cognomi dei soci e nomi delle attività
 * finiscono in "_test". Se la pulizia non andasse a buon fine (processo
 * interrotto, database irraggiungibile) nessuno li scambierebbe per dati reali;
 * vengono comunque rimossi dall'esecuzione successiva prima di crearne di nuovi,
 * oppure a mano con `npm run test:api:pulizia`.
 *
 * I dati si creano dalle API, come farebbe un admin dall'interfaccia. Due cose
 * passano invece direttamente dai database:
 *   - il privilegio del primo admin: dalle API lo concede solo un altro admin,
 *     e i test non devono appoggiarsi a un account reale;
 *   - la pulizia: l'authorizer non espone l'eliminazione degli account, e il
 *     backend rifiuta per scelta di eliminare un'attività con incontri.
 *
 * Connessioni: per default i parametri DB_* di backend/.env e authorizer/.env;
 * TEST_APP_DB_URL e TEST_AUTH_DB_URL (connection string) li sostituiscono.
 */

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { api, atteso, authApi, claims, giorniFa, type Sessione } from './helpers.ts';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Il driver è quello già installato per il backend: i test non hanno
// dipendenze proprie da installare.
const { Pool } = createRequire(join(RADICE, 'backend', 'package.json'))('pg');

// ------------------------------------------------------------
// Marcatori dei dati di prova
// ------------------------------------------------------------
const DOMINIO = 'clubby.test';
const NOTA = 'Creato dai test API';
/** Pattern LIKE: "\_" è un trattino basso letterale, non il carattere jolly. */
const LIKE_EMAIL = `%@${DOMINIO}`;
const LIKE_NOME = '%\\_test';

export const ACCOUNT = {
  istruttore1: `istruttore_uno_test@${DOMINIO}`,
  istruttore2: `istruttore_due_test@${DOMINIO}`,
  socio1:      `socio_uno_test@${DOMINIO}`,
  socio2:      `socio_due_test@${DOMINIO}`,
};
export type NomeAccount = keyof typeof ACCOUNT;
const NOMI_ACCOUNT = Object.keys(ACCOUNT) as NomeAccount[];

export type Sessioni = Record<NomeAccount, Sessione>;
type NomeSocio = NomeAccount | 'senzaAccount';

// Una password nuova a ogni esecuzione: nessuna credenziale fissa nel codice.
const PASSWORD = `Test_${randomUUID()}`;

const LISTINO = [
  ['educazione',  'educazione_test',  30, true],
  ['mantrailing', 'mantrailing_test', 25, true],
  ['k9',          'k9_test',          35, true],
  ['dogdance',    'dogdance_test',    20, true],
  ['passeggiata', 'passeggiata_test', 15, true],
  ['agility',     'agility_test',     30, false],
] as const;
export type NomeAttivita = (typeof LISTINO)[number][0];

const SOCI: [NomeSocio, string, string][] = [
  ['istruttore1',  'mario_test',   'rossi_test'],
  ['istruttore2',  'chiara_test',  'conti_test'],
  ['socio1',       'paolo_test',   'ferrari_test'],
  ['socio2',       'sara_test',    'romano_test'],
  ['senzaAccount', 'giorgio_test', 'ricci_test'],
];

const ABILITAZIONI_ISTRUTTORE2: NomeAttivita[] = ['educazione', 'dogdance', 'mantrailing'];

// [socio, istruttore, attività, costo, giorni fa]
const INCONTRI: [NomeSocio, NomeAccount, NomeAttivita, number, number][] = [
  // socio1, tenuti da istruttore1. Voucher 150 → 60
  ['socio1', 'istruttore1', 'educazione',  30, 50],
  ['socio1', 'istruttore1', 'mantrailing', 25, 22],
  ['socio1', 'istruttore1', 'k9',          35, 6],
  // socio2, tenuti da istruttore2. Voucher 40 + ricarica 30 → -5
  ['socio2', 'istruttore2', 'educazione',  30, 45],
  ['socio2', 'istruttore2', 'dogdance',    20, 26],
  ['socio2', 'istruttore2', 'mantrailing', 25, 4],
  // istruttore2 come socia, tenuti da istruttore1. Voucher 100 → 50
  ['istruttore2', 'istruttore1', 'k9',          35, 30],
  ['istruttore2', 'istruttore1', 'passeggiata', 15, 12],
];

/** Cosa contengono i dati creati qui sopra: le attese dei test. */
export const ATTESE = {
  incontriTotali: 8,
  costoTotale: 215,
  // Incontri tenuti come istruttore.
  tenutiIstruttore1: { total: 5, costo: 140 },
  tenutiIstruttore2: { total: 3, costo: 75 },
  // Incontri a cui l'account ha partecipato come socio.
  comeSocioIstruttore2: { total: 2, costo: 50 },
  comeSocioSocio1: { total: 3, costo: 90 },
  comeSocioSocio2: { total: 3, costo: 75 },
  saldoSocio1: 60,
  saldoSocio2: -5,
  // Ricariche registrabili: l'acquisto del voucher più le ricariche successive.
  ricaricheSocio1: 150,
  ricaricheSocio2: 70,
  abilitazioniIstruttore2: ['dogdance_test', 'educazione_test', 'mantrailing_test'],
  attivitaAttive: LISTINO.filter(a => a[3]).map(a => a[1] as string),
  attivitaDisattivata: 'agility_test',
};

export interface DatiTest {
  sessioni: Sessioni;
  /** Id delle schede socio. */
  soci: Record<NomeSocio, string>;
  /** Id delle attività di listino. */
  attivita: Record<NomeAttivita, string>;
}

// ------------------------------------------------------------
// Database
// ------------------------------------------------------------
function leggiEnv(modulo: string): Record<string, string> {
  const file = join(RADICE, modulo, '.env');
  const valori: Record<string, string> = {};
  if (!existsSync(file)) return valori;
  for (const riga of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = riga.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) valori[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }
  return valori;
}

function connessione(modulo: 'backend' | 'authorizer', variabileUrl: string) {
  const url = process.env[variabileUrl];
  if (url) return new Pool({ connectionString: url });
  const env = leggiEnv(modulo);
  return new Pool({
    host: env.DB_HOST ?? 'localhost',
    port: Number(env.DB_PORT ?? 5432),
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
  });
}

/**
 * Elimina ogni dato di prova, di questa esecuzione o di una precedente
 * interrotta. Riconosce i record solo dai marcatori: non tocca nient'altro.
 */
export async function pulisciDatiTest(): Promise<void> {
  const app  = connessione('backend', 'TEST_APP_DB_URL');
  const auth = connessione('authorizer', 'TEST_AUTH_DB_URL');
  try {
    const { rows } = await auth.query('SELECT id::text AS id FROM utente WHERE email LIKE $1', [LIKE_EMAIL]);
    const idAccount: string[] = rows.map((r: { id: string }) => r.id);

    // Abilitazioni e attribuzioni puntano agli account senza foreign key
    // (stanno in un altro database): vanno tolte esplicitamente.
    await app.query(
      `DELETE FROM istruttore_attivita
       WHERE istruttore_id = ANY($1::varchar[])
          OR attivita_id IN (SELECT id FROM attivita WHERE nome LIKE $2)`,
      [idAccount, LIKE_NOME]
    );
    // I documenti PRIMA dei soci: documento.socio_id ha una foreign key senza
    // ON DELETE, quindi una ricevuta di prova bloccherebbe l'eliminazione del
    // socio e la pulizia fallirebbe a metà. Le righe di
    // documento_emesso_voce che vi puntano se ne vanno con il documento solo
    // se le si toglie prima: anche quella foreign key è senza cascata.
    await app.query(
      `DELETE FROM documento_emesso_voce
        WHERE documento_id IN (
          SELECT d.id FROM documento d
            JOIN socio s ON s.id = d.socio_id
           WHERE s.email LIKE $1 OR s.cognome LIKE $2)`,
      [LIKE_EMAIL, LIKE_NOME]
    );
    await app.query(
      `DELETE FROM documento
        WHERE socio_id IN (SELECT id FROM socio WHERE email LIKE $1 OR cognome LIKE $2)`,
      [LIKE_EMAIL, LIKE_NOME]
    );
    // Voucher, movimenti e incontri se ne vanno a cascata con il socio.
    await app.query('DELETE FROM socio WHERE email LIKE $1 OR cognome LIKE $2', [LIKE_EMAIL, LIKE_NOME]);
    // Rete di sicurezza per incontri di prova finiti fuori dai soci di prova,
    // che altrimenti bloccherebbero l'eliminazione delle attività.
    await app.query(
      `DELETE FROM incontro
       WHERE attivita_id IN (SELECT id FROM attivita WHERE nome LIKE $1)
          OR istruttore_id = ANY($2::varchar[])`,
      [LIKE_NOME, idAccount]
    );
    await app.query('DELETE FROM attivita WHERE nome LIKE $1', [LIKE_NOME]);
    // Le voci registrate puntano a tre tabelle diverse senza foreign key, quindi
    // le cancellazioni qui sopra non se le portano dietro: si tolgono quelle
    // rimaste a puntare nel vuoto. Il criterio è l'assenza della riga
    // d'origine, non il marcatore "_test": una riga orfana non serve comunque
    // a nessuno, qualunque l'abbia creata.
    await app.query(
      `DELETE FROM documento_emesso_voce d
        WHERE (d.tipo = 'incontro'
               AND NOT EXISTS (SELECT 1 FROM incontro i WHERE i.id = d.riferimento_id))
           OR (d.tipo = 'tesseramento'
               AND NOT EXISTS (SELECT 1 FROM tesseramento t WHERE t.id = d.riferimento_id))
           OR (d.tipo = 'ricarica'
               AND NOT EXISTS (SELECT 1 FROM movimento_voucher m WHERE m.id = d.riferimento_id))`
    );
    // Le sessioni se ne vanno a cascata con l'account.
    await auth.query('DELETE FROM utente WHERE email LIKE $1', [LIKE_EMAIL]);
  } finally {
    await Promise.all([app.end(), auth.end()]);
  }
}

// Un'interruzione (Ctrl+C, o il runner che chiude il processo) salterebbe gli
// hook after(): la pulizia va fatta qui.
for (const segnale of ['SIGINT', 'SIGTERM'] as const) {
  process.once(segnale, () => {
    pulisciDatiTest().finally(() => process.exit(130));
  });
}

// ------------------------------------------------------------
// Preparazione
// ------------------------------------------------------------
export async function accedi(nome: NomeAccount): Promise<Sessione> {
  const r = await authApi(undefined, 'POST', '/auth/login', { email: ACCOUNT[nome], password: PASSWORD });
  const body = atteso(r, 200, `accesso di ${ACCOUNT[nome]}`);
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    id: body.utente.id,
    roles: claims(body.access_token).roles,
  };
}

/**
 * Crea i dati di prova, dopo aver rimosso gli avanzi di esecuzioni precedenti.
 * Se la creazione si interrompe a metà, elimina quanto già creato.
 */
export async function preparaDati(): Promise<DatiTest> {
  await pulisciDatiTest();
  try {
    return await creaDati();
  } catch (e) {
    await pulisciDatiTest();
    throw e;
  }
}

async function creaDati(): Promise<DatiTest> {
  // 1. Account, dalla registrazione pubblica: nascono soci senza privilegi.
  const idAccount = {} as Record<NomeAccount, string>;
  for (const nome of NOMI_ACCOUNT) {
    const r = await authApi(undefined, 'POST', '/auth/register', { email: ACCOUNT[nome], password: PASSWORD });
    idAccount[nome] = atteso(r, 201, `registrazione di ${ACCOUNT[nome]}`).utente.id;
  }

  // 2. Il primo admin, dal database (vedi in testa al file).
  const auth = connessione('authorizer', 'TEST_AUTH_DB_URL');
  try {
    await auth.query(`UPDATE utente SET ruolo = 'istruttore', admin = TRUE WHERE id = $1`, [idAccount.istruttore1]);
  } finally {
    await auth.end();
  }

  // 3. Il resto come lo farebbe l'admin dall'interfaccia.
  const admin = await accedi('istruttore1');
  const esegui = async (method: string, path: string, body: unknown, cosa: string) =>
    atteso(await api(admin, method, path, body), [200, 201, 204], cosa);

  await esegui('POST', '/api/admin/ruolo', { utente_id: idAccount.istruttore2, ruolo: 'istruttore' }, 'ruolo di istruttore2');

  const attivita = {} as Record<NomeAttivita, string>;
  for (const [chiave, nome, costo, attiva] of LISTINO) {
    const creata = await esegui('POST', '/api/attivita', { nome, costo_default: costo }, `attività ${nome}`);
    attivita[chiave] = creata.id;
    if (!attiva) await esegui('PUT', `/api/attivita/${creata.id}`, { attiva: false }, `disattivazione di ${nome}`);
  }

  const soci = {} as Record<NomeSocio, string>;
  for (const [chiave, nome, cognome] of SOCI) {
    const email = chiave === 'senzaAccount' ? `${nome}@${DOMINIO}` : ACCOUNT[chiave];
    const socio = await esegui('POST', '/api/soci', { nome, cognome, email, telefono: '000 0000000', note: NOTA }, `socio ${cognome}`);
    soci[chiave] = socio.id;
    if (chiave !== 'senzaAccount') {
      await esegui('POST', '/api/admin/associa-viewer', { socio_id: socio.id, utente_id: idAccount[chiave] }, `collegamento di ${cognome}`);
    }
  }

  const attive = LISTINO.filter(a => a[3]).map(a => attivita[a[0]]);
  await esegui('PUT', `/api/istruttori/${idAccount.istruttore1}/attivita`, { attivita_ids: attive }, 'abilitazioni di istruttore1');
  await esegui('PUT', `/api/istruttori/${idAccount.istruttore2}/attivita`,
    { attivita_ids: ABILITAZIONI_ISTRUTTORE2.map(a => attivita[a]) }, 'abilitazioni di istruttore2');

  // istruttore2 porta un voucher già in uso, con il saldo importato (non
  // registrabile); socio1 e socio2 lo acquistano, cioè lo attivano con una ricarica.
  await esegui('POST', '/api/voucher', { socio_id: soci.istruttore2, saldo_iniziale: 100 }, 'voucher importato di istruttore2');
  await esegui('POST', '/api/voucher', { socio_id: soci.socio1, ricarica: 150 }, 'voucher di socio1');
  const voucherSocio2 = await esegui('POST', '/api/voucher', { socio_id: soci.socio2, ricarica: 40 }, 'voucher di socio2');
  await esegui('POST', `/api/voucher/${voucherSocio2.id}/movimenti`,
    { tipo: 'ricarica', importo: 30, descrizione: NOTA }, 'ricarica di socio2');

  // In ordine di data: l'ultimo incontro di socio2 porta il saldo sotto zero,
  // e il backend rifiuterebbe addebiti successivi.
  for (const [socio, istruttore, nomeAttivita, costo, giorni] of INCONTRI) {
    await esegui('POST', '/api/incontri', {
      socio_id: soci[socio],
      data_incontro: giorniFa(giorni),
      attivita_id: attivita[nomeAttivita],
      istruttore_id: idAccount[istruttore],
      costo,
      note: NOTA,
    }, `incontro di ${socio} (${nomeAttivita})`);
  }

  // Accesso finale: il cambio di ruolo di istruttore2 ha chiuso le sue
  // sessioni, e un token ottenuto prima porterebbe ancora il ruolo vecchio.
  const sessioni = {} as Sessioni;
  for (const nome of NOMI_ACCOUNT) sessioni[nome] = await accedi(nome);

  return { sessioni, soci, attivita };
}
