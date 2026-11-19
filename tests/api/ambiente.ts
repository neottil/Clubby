/**
 * L'ambiente di un file di test (spec 014): i suoi database e i suoi servizi.
 *
 * Ogni file chiama `usaAmbiente()` una volta, in testa, con la configurazione
 * del backend che gli serve. La funzione registra gli hook di node:test:
 *
 *   before      clona i database modello preparati da avvia.ts in due database
 *               di questo processo, e vi avvia contro authorizer e backend su
 *               porte libere: dai sorgenti in locale (si possono seguire con il
 *               debugger), dalle immagini TEST_IMMAGINE_* in CI;
 *   beforeEach  azzera i due database, così ogni test parte dal vuoto e si
 *               costruisce i dati che gli servono (vedi fabbrica.ts);
 *   after       se un test è fallito stampa il log dei servizi, poi li spegne
 *               e cancella i due database.
 *
 * Senza le variabili che imposta avvia.ts il file si ferma subito: la suite non
 * ha indirizzi di ripiego, e non può finire sui servizi o sul database di
 * sviluppo per sbaglio.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, afterEach, before, beforeEach } from 'node:test';
import pg from 'pg';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { servizi } from './helpers.ts';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Gli interruttori del backend che un file può scegliere. */
export interface Configurazione {
  RECHARGE_MODE?: string;
  ENABLE_MODULE_TESSERAMENTO?: 'true' | 'false';
  ENABLE_MODULE_RICEVUTE?: 'true' | 'false';
}

const PREDEFINITA: Required<Configurazione> = {
  RECHARGE_MODE: 'free',
  ENABLE_MODULE_TESSERAMENTO: 'true',
  ENABLE_MODULE_RICEVUTE: 'true',
};

/**
 * L'issuer scritto nei token, uguale per authorizer e backend. Dai sorgenti la
 * porta dell'authorizer si sceglie all'avvio, quindi l'issuer è un nome fisso:
 * il backend lo confronta con quello dei token, ma per scaricare le chiavi usa
 * AUTH_INTERNAL_URL, che è l'indirizzo vero.
 */
const ISSUER_LOCALE = 'http://authorizer.clubby.test';

/** Il logo delle ricevute: un SVG con il PNG gemello, come in un ambiente vero. */
const LOGO_FILE = 'clubby_dev.svg';

if (process.env.TEST_AVVIATO_DA !== 'avvia.ts') {
  throw new Error(
    'I test delle API si eseguono solo con `npm run test:api` (anche per un file solo: ' +
    '`npm run test:api -- tests/api/<file>.test.ts`). Preparano un database usa-e-getta con ' +
    'Testcontainers e non girano contro i servizi o il database di sviluppo.'
  );
}

const env = process.env as Record<string, string>;
const debug = env.TEST_DEBUG === '1';
const immagineBackend = env.TEST_IMMAGINE_BACKEND;
const immagineAuthorizer = env.TEST_IMMAGINE_AUTHORIZER;

// Nomi dei database di questo processo: il pid li rende unici fra i file che
// girano insieme sullo stesso Postgres.
const DB_APP = `clubby_t${process.pid}`;
const DB_AUTH = `clubby_auth_t${process.pid}`;

/** Connessioni dirette ai due database del file: primo admin e azzeramento. */
export const db: { app: pg.Pool; auth: pg.Pool } = {} as { app: pg.Pool; auth: pg.Pool };

function pool(database: string): pg.Pool {
  const p = new pg.Pool({
    host: env.TEST_PG_HOST,
    port: Number(env.TEST_PG_PORTA),
    user: env.TEST_PG_UTENTE,
    password: env.TEST_PG_PASSWORD,
    database,
    max: 2,
  });
  // pool.end() si risolve prima che i socket siano chiusi davvero: il DROP
  // DATABASE ... WITH (FORCE) di fine file può raggiungere una connessione
  // ancora aperta, che riceve "terminating connection due to administrator
  // command" quando nessuno l'ascolta più e farebbe fallire il file intero.
  // Un errore durante una query arriva comunque a chi l'ha lanciata.
  p.on('connect', client => client.on('error', () => {}));
  p.on('error', () => {});
  return p;
}

// ------------------------------------------------------------
// Servizi
// ------------------------------------------------------------
interface Servizio {
  url: string;
  log(): Promise<string>;
  ferma(): Promise<void>;
}

const processi = new Set<ChildProcess>();
// Un processo dei test che muore lascerebbe orfani i servizi avviati dai
// sorgenti: si spengono anche qui, che è sincrono e gira comunque.
process.on('exit', () => { for (const p of processi) p.kill(); });

function portaLibera(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
}

async function attendiSalute(url: string, morto: () => string | null): Promise<void> {
  const fine = Date.now() + 60_000;
  while (Date.now() < fine) {
    const motivo = morto();
    if (motivo) throw new Error(motivo);
    try {
      if ((await fetch(`${url}/health`)).ok) return;
    } catch { /* non ancora in ascolto */ }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error(`${url} non ha risposto a /health entro 60 secondi`);
}

/**
 * Avvia un modulo dai sorgenti: `node --import tsx src/server.ts`, un processo
 * solo, a cui il debugger si collega senza intermediari. Le variabili passate
 * sono TUTTE quelle che il modulo legge: env.ts non sovrascrive ciò che è già
 * impostato, quindi il .env dell'utente non arriva mai a questi processi.
 */
async function daiSorgenti(modulo: 'backend' | 'authorizer', variabili: Record<string, string>, ispezione: number): Promise<Servizio> {
  // Una porta libera può essere presa da un altro file nell'istante fra la
  // scelta e l'ascolto: in quel caso si riprova con un'altra.
  for (let tentativo = 1; ; tentativo++) {
    const porta = await portaLibera();
    const url = `http://127.0.0.1:${porta}`;
    const righe: string[] = [];
    const figlio = spawn(process.execPath, [
      ...(debug ? [`--inspect=127.0.0.1:${ispezione}`] : []),
      '--import', 'tsx',
      'src/server.ts',
    ], {
      cwd: join(RADICE, modulo),
      env: { ...ambienteDiBase(), ...variabili, PORT: String(porta), HOST: '127.0.0.1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    processi.add(figlio);
    const raccogli = (dati: Buffer) => {
      righe.push(...dati.toString().split(/\r?\n/).filter(Boolean));
      if (righe.length > 200) righe.splice(0, righe.length - 200);
    };
    figlio.stdout!.on('data', raccogli);
    figlio.stderr!.on('data', raccogli);
    let uscito: string | null = null;
    figlio.once('exit', (c, s) => { uscito = `${modulo} terminato all'avvio (${c ?? s})`; processi.delete(figlio); });

    try {
      await attendiSalute(url, () => uscito);
    } catch (e) {
      figlio.kill();
      const occupata = righe.some(r => r.includes('EADDRINUSE'));
      if (occupata && tentativo < 5) continue;
      throw new Error(`${(e as Error).message}\n--- log di ${modulo} ---\n${righe.join('\n')}`);
    }
    return {
      url,
      log: async () => righe.join('\n'),
      ferma: () => new Promise<void>(resolve => {
        if (figlio.exitCode !== null || figlio.signalCode !== null) return resolve();
        figlio.once('exit', () => resolve());
        figlio.kill();
      }),
    };
  }
}

/** L'ambiente del processo dei test, senza le variabili della suite. */
function ambienteDiBase(): Record<string, string> {
  const base: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith('TEST_') && !k.startsWith('NODE_TEST')) base[k] = v;
  }
  return base;
}

/** In CI: lo stesso servizio come container, dall'immagine della run. */
async function daImmagine(immagine: string, alias: string, portaInterna: number, variabili: Record<string, string>): Promise<Servizio> {
  const c: StartedTestContainer = await new GenericContainer(immagine)
    .withNetworkMode(env.TEST_RETE)
    .withNetworkAliases(alias)
    .withExposedPorts(portaInterna)
    .withEnvironment({ ...variabili, PORT: String(portaInterna) })
    .withWaitStrategy(Wait.forHttp('/health', portaInterna).withStartupTimeout(60_000))
    .start();
  return {
    url: `http://${c.getHost()}:${c.getMappedPort(portaInterna)}`,
    log: async () => {
      const flusso = await c.logs({ tail: 200 });
      let testo = '';
      await new Promise<void>(resolve => {
        flusso.on('data', (d: Buffer | string) => { testo += d.toString(); });
        flusso.on('end', () => resolve());
        flusso.on('error', () => resolve());
        setTimeout(resolve, 2000);
      });
      return testo;
    },
    ferma: async () => { await c.stop(); },
  };
}

// ------------------------------------------------------------
// Database
// ------------------------------------------------------------
async function suPostgres<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({
    host: env.TEST_PG_HOST,
    port: Number(env.TEST_PG_PORTA),
    user: env.TEST_PG_UTENTE,
    password: env.TEST_PG_PASSWORD,
    database: 'postgres',
  });
  c.on('error', () => {});
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

async function clonaDatabase(nome: string, modello: string, proprietario: string): Promise<void> {
  await suPostgres(async c => {
    await c.query(`DROP DATABASE IF EXISTS "${nome}" WITH (FORCE)`);
    // Due cloni dello stesso modello nello stesso istante possono scontrarsi
    // ("source database is being accessed by other users"): si riprova.
    for (let tentativo = 1; ; tentativo++) {
      try {
        await c.query(`CREATE DATABASE "${nome}" TEMPLATE "${modello}" OWNER "${proprietario}"`);
        return;
      } catch (e) {
        if (tentativo >= 10 || !/being accessed by other users/.test((e as Error).message)) throw e;
        await new Promise(r => setTimeout(r, 100 * tentativo));
      }
    }
  });
}

/** Le tabelle da svuotare a ogni test: tutte, tranne il registro e le impostazioni. */
async function tabelleDaAzzerare(p: pg.Pool): Promise<string[]> {
  const { rows } = await p.query(
    `SELECT format('%I', tablename) AS nome FROM pg_tables
      WHERE schemaname = 'public' AND tablename NOT IN ('migrazione', 'impostazione')`
  );
  return rows.map((r: { nome: string }) => r.nome);
}

// ------------------------------------------------------------
// usaAmbiente
// ------------------------------------------------------------
export interface Ambiente {
  /** La configurazione con cui gira il backend di questo file. */
  configurazione: Required<Configurazione>;
}

let registrato = false;

export function usaAmbiente(configurazione: Configurazione = {}): Ambiente {
  if (registrato) throw new Error('usaAmbiente() va chiamata una volta sola per file');
  registrato = true;

  const config = { ...PREDEFINITA, ...configurazione };
  let backend: Servizio | undefined;
  let authorizer: Servizio | undefined;
  let tabelleApp: string[] = [];
  let tabelleAuth: string[] = [];
  let impostazioniIniziali = '[]';
  let fallito = false;

  async function stampaLog(): Promise<void> {
    for (const [nome, s] of [['authorizer', authorizer], ['backend', backend]] as const) {
      if (!s) continue;
      const testo = (await s.log().catch(e => `(log non disponibile: ${(e as Error).message})`)).split('\n').slice(-60).join('\n');
      console.error(`\n--- ultime righe di log: ${nome} (${config.RECHARGE_MODE}, tesseramento ${config.ENABLE_MODULE_TESSERAMENTO}, ricevute ${config.ENABLE_MODULE_RICEVUTE}) ---\n${testo}\n`);
    }
  }

  before(async () => {
    try {
      await clonaDatabase(DB_APP, env.TEST_PG_MODELLO_APP, env.TEST_PG_UTENTE);
      await clonaDatabase(DB_AUTH, env.TEST_PG_MODELLO_AUTH, env.TEST_PG_UTENTE_AUTH);
      db.app = pool(DB_APP);
      db.auth = pool(DB_AUTH);
      tabelleApp = await tabelleDaAzzerare(db.app);
      tabelleAuth = await tabelleDaAzzerare(db.auth);
      impostazioniIniziali = JSON.stringify(
        (await db.app.query('SELECT coalesce(json_agg(i), \'[]\') AS righe FROM impostazione i')).rows[0].righe
      );

      // L'admin creato all'avvio dall'authorizer, se mancano utenti: c'è
      // perché la variabile va impostata (altrimenti la leggerebbe dal .env
      // dell'utente), e sparisce al primo azzeramento.
      const adminIniziale = {
        INITIAL_ADMIN_EMAIL: `admin_iniziale_t${process.pid}@clubby.test`,
        INITIAL_ADMIN_PASSWORD: `Test_${process.pid}_${Date.now()}`,
      };

      if (immagineAuthorizer && immagineBackend) {
        const aliasAuth = `authorizer-t${process.pid}`;
        const issuer = `http://${aliasAuth}:3001`;
        const comuni = { DB_HOST: 'postgres', DB_PORT: '5432', APP_VERSION: 'test', CORS_ORIGIN: '*' };
        authorizer = await daImmagine(immagineAuthorizer, aliasAuth, 3001, {
          ...comuni, ...adminIniziale,
          DB_NAME: DB_AUTH, DB_USER: env.TEST_PG_UTENTE_AUTH, DB_PASSWORD: env.TEST_PG_UTENTE_AUTH,
          AUTH_ISSUER: issuer, AUTH_JWT_PRIVATE_KEY: env.TEST_CHIAVE_JWT,
        });
        backend = await daImmagine(immagineBackend, `backend-t${process.pid}`, 3000, {
          ...comuni, ...config,
          DB_NAME: DB_APP, DB_USER: env.TEST_PG_UTENTE, DB_PASSWORD: env.TEST_PG_PASSWORD,
          AUTH_ISSUER: issuer, AUTH_INTERNAL_URL: issuer,
          BRANDING_DIR: '/app/branding', LOGO_FILE,
        });
      } else {
        const comuni = {
          DB_HOST: env.TEST_PG_HOST, DB_PORT: env.TEST_PG_PORTA,
          APP_VERSION: 'test', CORS_ORIGIN: '*', NODE_ENV: 'test',
        };
        authorizer = await daiSorgenti('authorizer', {
          ...comuni, ...adminIniziale,
          DB_NAME: DB_AUTH, DB_USER: env.TEST_PG_UTENTE_AUTH, DB_PASSWORD: env.TEST_PG_UTENTE_AUTH,
          AUTH_ISSUER: ISSUER_LOCALE, AUTH_JWT_PRIVATE_KEY: env.TEST_CHIAVE_JWT,
        }, 9230);
        backend = await daiSorgenti('backend', {
          ...comuni, ...config,
          DB_NAME: DB_APP, DB_USER: env.TEST_PG_UTENTE, DB_PASSWORD: env.TEST_PG_PASSWORD,
          AUTH_ISSUER: ISSUER_LOCALE, AUTH_INTERNAL_URL: authorizer.url,
          BRANDING_DIR: join(RADICE, 'branding'), LOGO_FILE,
        }, 9229);
      }
      servizi.api = backend.url;
      servizi.auth = authorizer.url;
    } catch (e) {
      fallito = true;
      throw e;
    }
  });

  beforeEach(async () => {
    // Una sola istruzione per database: TRUNCATE di tutte le tabelle insieme
    // risolve da sé l'ordine delle foreign key.
    if (tabelleApp.length > 0) {
      // Una transazione vuole una connessione sola: il pool potrebbe dare a
      // ogni query una connessione diversa.
      const c = await db.app.connect();
      try {
        await c.query('BEGIN');
        await c.query(`TRUNCATE ${tabelleApp.join(', ')} RESTART IDENTITY CASCADE`);
        await c.query('TRUNCATE impostazione');
        await c.query(
          'INSERT INTO impostazione SELECT * FROM json_populate_recordset(NULL::impostazione, $1::json)',
          [impostazioniIniziali]
        );
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    }
    if (tabelleAuth.length > 0) {
      await db.auth.query(`TRUNCATE ${tabelleAuth.join(', ')} RESTART IDENTITY CASCADE`);
    }
  });

  afterEach((t) => {
    if (t.passed === false) fallito = true;
  });

  after(async () => {
    if (fallito) await stampaLog();
    await Promise.all([backend?.ferma(), authorizer?.ferma()].map(p => p?.catch(() => {})));
    await Promise.all([db.app?.end(), db.auth?.end()].map(p => p?.catch(() => {})));
    await suPostgres(async c => {
      await c.query(`DROP DATABASE IF EXISTS "${DB_APP}" WITH (FORCE)`);
      await c.query(`DROP DATABASE IF EXISTS "${DB_AUTH}" WITH (FORCE)`);
    }).catch(() => {});
  });

  return { configurazione: config };
}
