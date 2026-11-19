/**
 * Punto d'ingresso della suite delle API: `npm run test:api [-- file...]`
 * (spec 014).
 *
 * Prepara una volta per esecuzione ciò che i file di test condividono, e poi
 * lancia `node --test`:
 *
 *   1. controlla che Docker risponda, o si ferma con un messaggio;
 *   2. avvia con Testcontainers un PostgreSQL usa-e-getta e vi crea i database
 *      MODELLO dell'app e degli account, dalla stessa baseline e con lo stesso
 *      `scripts/migra.sh` di docker-compose.yml;
 *   3. esegue i file in parallelo (`TEST_PARALLELISMO`, 4 per default; 1 con
 *      `TEST_DEBUG=1`). Ogni file, nel proprio processo, clona i modelli in
 *      due database suoi e vi avvia contro backend e authorizer: vedi
 *      ambiente.ts;
 *   4. spegne Postgres e la rete della suite, anche su Ctrl+C.
 *
 * Il database di sviluppo non c'entra in nessun passaggio: l'unico database
 * che la suite conosce è questo container, e i file di test non partono se
 * non ricevono da qui le sue coordinate (vedi ambiente.ts).
 *
 * Variabili:
 *   TEST_PARALLELISMO          file eseguiti insieme (default 4)
 *   TEST_DEBUG=1               un file alla volta, servizi con --inspect su
 *                              9229 (backend) e 9230 (authorizer)
 *   TEST_IMMAGINE_BACKEND      in CI: i servizi partono da queste immagini
 *   TEST_IMMAGINE_AUTHORIZER   invece che dai sorgenti, e le migrazioni
 *                              dell'app dall'immagine del backend
 */

import { spawn } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GenericContainer, Network, Wait, getContainerRuntimeClient } from 'testcontainers';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const QUI = dirname(fileURLToPath(import.meta.url));
const RADICE = join(QUI, '..', '..');

const IMMAGINE_POSTGRES = 'postgres:18.3-alpine';
// Lo stesso utente che crea i database in docker-compose.yml: è il
// superutente del container, e serve tale per clonare i modelli.
const PG_UTENTE = 'clubby';
const PG_PASSWORD = 'clubby';
const MODELLO_APP = 'clubby_modello';
const MODELLO_AUTH = 'clubby_auth_modello';
const AUTH_UTENTE = 'clubby_auth';

const debug = process.env.TEST_DEBUG === '1';
const parallelismo = debug ? 1 : Number(process.env.TEST_PARALLELISMO ?? 4);
const immagineBackend = process.env.TEST_IMMAGINE_BACKEND;
const immagineAuthorizer = process.env.TEST_IMMAGINE_AUTHORIZER;

if (!Number.isInteger(parallelismo) || parallelismo < 1) {
  console.error(`TEST_PARALLELISMO non valido: "${process.env.TEST_PARALLELISMO}". Serve un intero da 1 in su.`);
  process.exit(2);
}
if (!!immagineBackend !== !!immagineAuthorizer) {
  console.error('TEST_IMMAGINE_BACKEND e TEST_IMMAGINE_AUTHORIZER vanno impostate insieme, o nessuna delle due.');
  process.exit(2);
}

// I file da eseguire: quelli passati dopo `--`, altrimenti tutti. Un argomento
// vuoto (la configurazione di debug di VS Code senza file) vale "tutti".
const argomenti = process.argv.slice(2).filter(a => a.trim() !== '');
const file = argomenti.length > 0
  ? argomenti
  : readdirSync(QUI).filter(f => f.endsWith('.test.ts')).sort().map(f => join(QUI, f));

// ------------------------------------------------------------
// 1. Docker
// ------------------------------------------------------------
try {
  await getContainerRuntimeClient();
} catch (e) {
  console.error(
    '\nDocker non risponde: la suite gira solo su un database usa-e-getta in un container.\n' +
    'Avvia Docker e rilancia npm run test:api. Su Windows con Docker dentro WSL, la suite va\n' +
    'lanciata da WSL, come npm run dev: da Windows quel Docker non si vede.\n' +
    `Dettaglio: ${(e as Error).message}\n`
  );
  process.exit(1);
}

// Da qui in avanti ogni uscita passa da `chiudi`, che spegne ciò che è acceso.
// Se il processo morisse senza passarci, Testcontainers ha comunque il suo
// "reaper" (Ryuk), che toglie i container quando questo processo sparisce.
let rete: Awaited<ReturnType<Network['start']>> | undefined;
let postgres: Awaited<ReturnType<PostgreSqlContainer['start']>> | undefined;
let chiusura: Promise<void> | undefined;
function chiudi(): Promise<void> {
  chiusura ??= (async () => {
    await postgres?.stop().catch(() => {});
    await rete?.stop().catch(() => {});
  })();
  return chiusura;
}

// Ctrl+C arriva anche a node --test e ai servizi, che si chiudono da soli: qui
// basta non morire prima di aver spento Postgres.
let interrotto = false;
for (const segnale of ['SIGINT', 'SIGTERM'] as const) {
  process.on(segnale, () => { interrotto = true; });
}

let codice = 1;
try {
  console.log(`[test] Avvio di ${IMMAGINE_POSTGRES} con Testcontainers…`);
  rete = await new Network().start();

  // ------------------------------------------------------------
  // 2. Postgres e database modello
  // ------------------------------------------------------------
  // Stessa inizializzazione di docker-compose.yml: lo schema dell'app gira sul
  // database predefinito, init-auth-db.sh crea quello degli account e vi
  // applica il suo schema. Cambiano solo i nomi: questi sono i MODELLI da cui
  // ogni file clona i propri database.
  postgres = await new PostgreSqlContainer(IMMAGINE_POSTGRES)
    .withDatabase(MODELLO_APP)
    .withUsername(PG_UTENTE)
    .withPassword(PG_PASSWORD)
    .withEnvironment({ AUTH_DB_NAME: MODELLO_AUTH, AUTH_DB_USER: AUTH_UTENTE, AUTH_DB_PASSWORD: AUTH_UTENTE })
    .withNetwork(rete)
    .withNetworkAliases('postgres')
    .withCopyFilesToContainer([
      { source: join(RADICE, 'backend/src/db/schema.sql'), target: '/docker-entrypoint-initdb.d/01-schema-app.sql' },
      { source: join(RADICE, 'scripts/init-auth-db.sh'), target: '/docker-entrypoint-initdb.d/02-init-auth-db.sh' },
      { source: join(RADICE, 'authorizer/src/db/schema.sql'), target: '/schema/authorizer-schema.sql' },
      { source: join(RADICE, 'scripts/migra.sh'), target: '/migra/migra.sh' },
    ])
    .withCopyDirectoriesToContainer([
      { source: join(RADICE, 'backend/src/db/migrations'), target: '/migra/app' },
      { source: join(RADICE, 'authorizer/src/db/migrations'), target: '/migra/auth' },
    ])
    .start();

  // Migrazioni dell'app. In locale dai file del repository, con lo script
  // dentro il container di Postgres, come il servizio "migrazioni" del
  // compose. In CI dall'immagine del backend sotto prova, come il Job di
  // migrazione in cluster: sono quelle che accompagnano il codice provato.
  if (immagineBackend) {
    await new GenericContainer(immagineBackend)
      .withNetwork(rete)
      .withEnvironment({ DB_HOST: 'postgres', DB_PORT: '5432', DB_NAME: MODELLO_APP, DB_USER: PG_UTENTE, DB_PASSWORD: PG_PASSWORD })
      .withCommand(['sh', '/app/scripts/migra.sh'])
      .withWaitStrategy(Wait.forOneShotStartup())
      .start()
      .then(c => c.stop());
  } else {
    await migra(MODELLO_APP, PG_UTENTE, PG_PASSWORD, '/migra/app');
  }
  // L'authorizer non ha migrazioni nella propria immagine (vedi
  // authorizer/src/db/migrations/README.md): si applicano dal repository.
  await migra(MODELLO_AUTH, AUTH_UTENTE, AUTH_UTENTE, '/migra/auth');

  // ------------------------------------------------------------
  // 3. I file di test
  // ------------------------------------------------------------
  // La chiave di firma dei token: una per esecuzione, passata all'authorizer
  // invece di lasciargli leggere quella dell'authorizer/.env dell'utente.
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const ambiente: Record<string, string> = {
    ...process.env as Record<string, string>,
    TEST_AVVIATO_DA: 'avvia.ts',
    TEST_PG_HOST: postgres.getHost(),
    TEST_PG_PORTA: String(postgres.getPort()),
    TEST_PG_UTENTE: PG_UTENTE,
    TEST_PG_PASSWORD: PG_PASSWORD,
    TEST_PG_MODELLO_APP: MODELLO_APP,
    TEST_PG_MODELLO_AUTH: MODELLO_AUTH,
    TEST_PG_UTENTE_AUTH: AUTH_UTENTE,
    TEST_RETE: rete.getName(),
    // Le "\n" scritte come due caratteri: tokens.ts dell'authorizer le
    // riconverte, ed è la forma che regge ovunque una variabile d'ambiente.
    TEST_CHIAVE_JWT: privateKey.replace(/\n/g, '\\n'),
  };

  console.log(`[test] Database modello pronti. ${file.length} file, ${parallelismo} alla volta` +
    `${immagineBackend ? ', servizi dalle immagini' : ', servizi dai sorgenti'}${debug ? ', debug' : ''}.`);

  codice = await new Promise<number>((resolve) => {
    const figlio = spawn(process.execPath, [
      '--test',
      `--test-concurrency=${parallelismo}`,
      ...file.map(f => relative(process.cwd(), f) || f),
    ], { stdio: 'inherit', env: ambiente });
    figlio.on('exit', (c, segnale) => resolve(c ?? (segnale ? 130 : 1)));
  });
} catch (e) {
  console.error('[test] Preparazione dell\'ambiente fallita:', e);
  codice = 1;
} finally {
  await chiudi();
}
process.exit(interrotto && codice === 0 ? 130 : codice);

/** migra.sh dentro il container di Postgres, sul database indicato. */
async function migra(database: string, utente: string, password: string, cartella: string): Promise<void> {
  const r = await postgres!.exec([
    'sh', '-c',
    `DB_HOST=localhost DB_PORT=5432 DB_NAME=${database} DB_USER=${utente} DB_PASSWORD=${password} ` +
    `MIGRATIONS_DIR=${cartella} sh /migra/migra.sh`,
  ]);
  if (r.exitCode !== 0) throw new Error(`Migrazioni di ${database} fallite:\n${r.output}`);
}
