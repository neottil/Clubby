# 014 — I test delle API su un database usa-e-getta (Testcontainers)

## Stato

- [x] Draft
- [x] Approvata (Luca, 2026-11-19, con i servizi in CI dalle immagini della run)
- [x] In test (utente) (implementata il 2026-11-19 su `feature/spec-014`, non committata)
- [x] Completata (Luca, 2026-11-19, dopo le sue prove)

**Versioni**: nessun bump previsto. Backend, authorizer e frontend non cambiano
comportamento: dal backend spariscono solo due script di sviluppo e i due file
`.env.test*`, che non entrano nell'immagine (vedi Decisioni).

## Domande

Poste con il primo Draft il 2026-11-19. Le risposte di Luca (stesso giorno) sono
in grassetto; D1, D4 e D5 sono passate con l'approvazione della spec.

| # | Domanda | Risposta |
|---|---|---|
| D1 | Quanto isolare un test dall'altro? | Proposta: **database azzerato prima di ogni test**, dentro il database del proprio processo (D6) |
| D2 | Chi avvia backend e authorizer, e da cosa? | **La suite, dai sorgenti, così si può fare debug** (Luca, 09:07, dopo aver valutato i container dell'app). In CI, proposta: dalle immagini della run, come oggi (vedi D5) |
| D3 | Il modo di oggi (suite contro i servizi accesi a mano e il database di sviluppo) resta come alternativa? | **No. Il database dei test è solo su Testcontainers**: non dev'essere possibile lanciare i test contro l'applicazione locale accesa o i container di `docker-compose.yml` |
| D4 | I dati di un test si creano dalle API o con insert diretti? | Proposta: **dalle API, come oggi**. Dal database passano solo il primo admin e l'azzeramento |
| D5 | Anche la CI passa a Testcontainers? | Proposta: **sì per il database**, con lo stesso `avvia.ts`; i servizi in CI partono invece **dalle immagini della run**, come oggi, perché lì si prova l'artefatto che verrà deployato |
| D6 | Il parallelismo è dentro questa spec? | **Sì, con un database per processo** (Luca), per non allungare la suite. Ogni file di test è un processo, con i propri database e i propri processi di backend e authorizer |
| D7 | Servono test per le configurazioni (`RECHARGE_MODE`, moduli accesi o spenti)? | **Sì**, dove mancano, avviando l'applicazione con quella configurazione e chiamando le API (Luca) |

## Problema

La suite delle API (`tests/api/`, 18 file, 196 casi: l'unica cosa del
progetto che usa il database, non esistono test unitari) gira contro i servizi
che lo sviluppatore ha acceso a mano e contro **il database di sviluppo** su
`localhost:5432`, lo stesso in cui tiene i dati del seed e le proprie prove.
Oggi questo comporta:

- **Il contatore delle ricevute avanza a ogni esecuzione.** Una ricevuta emessa
  non si annulla e la numerazione per anno non ha buchi per costruzione: la
  pulizia toglie le ricevute di prova, ma `documento_numerazione` resta avanti
  di una decina di numeri a ogni giro.
- **Le impostazioni sono una riga per club**, non un dato riconoscibile dal
  suffisso `_test`: tre file le sovrascrivono e devono ricordarsi di rimetterle
  com'erano, anche quando un assert fallisce a metà.
- **I test convivono con dati che non conoscono.** Le asserzioni sui totali
  diventano `>=`, la numerazione si verifica solo come "consecutiva", e alcuni
  requisiti non si possono provare affatto: R7 della spec 013 (ricarica in
  modalità `map` senza tagli) è scritto "che la suite non può imporre su un
  database condiviso".
- **Un dataset unico per tutti.** Ogni file chiama `preparaDati()`, che crea 4
  account, 5 soci, 6 attività, 3 voucher e 8 incontri, e `ATTESE` ne descrive i
  totali. Un caso che ne usa un decimo dipende comunque da tutto.
- **Pulizia per marcatori.** `pulisciDatiTest()` cancella ciò che finisce in
  `_test` o sta su `clubby.test`, in un ordine studiato per le foreign key senza
  cascata. Ogni tabella nuova è un punto in cui la pulizia può restare indietro.
- **Avvio a mano, porte fisse, tutto in serie.** Servono `npm run
  dev:backend:test` (due istanze, 3000 e 3002) e `npm run dev:authorizer`, da
  spegnere alla fine; con `npm run dev` acceso la suite non parte. I file girano
  uno alla volta, perché condividono il database.
- **Configurazioni scoperte.** Modalità di ricarica e moduli si leggono
  all'avvio del backend, quindi oggi si provano solo `free` con i moduli accesi
  e, sulla 3002, `map` con **entrambi** i moduli spenti. La modalità
  `percentage` non ha nessun test delle API, e nemmeno un modulo spento con
  l'altro acceso.

## Obiettivo

`npm run test:api` crea da sé con Testcontainers un PostgreSQL usa-e-getta,
esegue i file di test in parallelo — ognuno con il proprio database e con
backend e authorizer avviati dai sorgenti nella configurazione che gli serve —
e butta via tutto. Il database di sviluppo non viene mai toccato e non c'è modo
di puntarci la suite. Ogni test parte da un database vuoto e si costruisce i
dati che gli servono, né più né meno. Backend e authorizer si possono seguire
con il debugger mentre la suite gira.

## Fuori perimetro

- **Test unitari** del backend o del frontend. `backend/package.json` dichiara
  `jest` ma non esiste nessun test unitario: introdurli è un'altra spec.
- **Test del frontend** in un browser. La suite resta black-box via HTTP.
- **Il database dell'ambiente `development` nel cluster**: la suite non l'ha mai
  toccato e continua a non toccarlo.
- **Seed demo** (`scripts/seed-demo-data.sh`) e collezione `bruno/`: lavorano
  sul database di sviluppo per scelta, e restano come sono.
- **Nuovi casi oltre a quelli di R16–R17.** I 196 esistenti si riscrivono sul
  nuovo modo di preparare i dati, e si aggiungono i soli casi sulle
  configurazioni chiesti da D7.

## Requisiti

### Ambiente dei test

| # | Requisito | Test |
|---|---|---|
| R1 | `npm run test:api` avvia con Testcontainers **un** PostgreSQL `postgres:18.3-alpine` per esecuzione e vi prepara i database modello `clubby_modello` e `clubby_auth_modello`: baseline e `init-auth-db.sh` come `docker-compose.yml`, poi le migrazioni con `scripts/migra.sh`. In locale dai file del repository, come il servizio `migrazioni` del compose; in CI dall'immagine del backend sotto prova, come oggi | `versioni.test.ts` › "è il numero dell'ultima migrazione presente nel repository" (il database clonato dal modello è migrato fino all'ultima migrazione del repository) |
| R2 | In locale backend e authorizer li avvia **la suite, dai sorgenti** (`node --import tsx <modulo>/src/server.ts`, un processo per servizio), su porte libere scelte all'avvio. Non si usano mai servizi già accesi | verifica manuale: con `npm run dev` acceso (porte 3000, 3001, 5173 occupate) `npm run test:api` parte e passa; una modifica non committata a un messaggio d'errore del backend è vista dal test che lo controlla, senza build |
| R3 | Ai servizi la suite passa **esplicitamente ogni variabile che il codice legge** (`DB_*` del database del file, porte, `AUTH_*`, `CORS_ORIGIN`, `RECHARGE_MODE`, `ENABLE_MODULE_*`, `BRANDING_DIR`, `LOGO_FILE`, `INITIAL_ADMIN_*`, `APP_VERSION`): poiché `env.ts` non sovrascrive ciò che è già impostato, niente di `backend/.env` o `authorizer/.env` arriva ai servizi dei test | verifica manuale: con `DB_PORT` di `backend/.env` puntato a una porta inesistente, la suite passa lo stesso |
| R4 | **Non è possibile** eseguire i test contro l'applicazione locale o i container di `docker-compose.yml`: i file di test non hanno indirizzi di ripiego, spariscono `TEST_APP_DB_URL` e `TEST_AUTH_DB_URL`, e un file lanciato direttamente con `node --test`, senza passare da `npm run test:api`, si ferma prima del primo test. Eseguire **un file solo** resta possibile, ma sempre da `npm run test:api` (R8): ciò che R4 vieta è il modo, non il file singolo | verifica manuale: `node --test tests/api/ruoli.test.ts` termina con il messaggio che rimanda a `npm run test:api`, senza nessuna chiamata a `localhost:3000` né al database su 5432 |
| R5 | Un'esecuzione completa della suite **non cambia niente nel database di sviluppo**: stesse righe, stesse impostazioni, stesso contatore delle ricevute | verifica manuale: `SELECT anno, ultimo FROM documento_numerazione`, `SELECT * FROM impostazione` e il conteggio delle righe di `socio`, `documento` e `utente` sul database di sviluppo, prima e dopo `npm run test:api`: identici |
| R6 | Finita la suite — verde, rossa o interrotta con Ctrl+C — non restano container, reti o processi della suite, e le porte scelte all'avvio sono libere | verifica manuale: dopo un'esecuzione completa e dopo una interrotta con Ctrl+C a metà, `docker ps -a` non elenca niente della suite e nessun processo `node` dei servizi resta acceso |
| R7 | Senza Docker raggiungibile la suite **fallisce subito**, con un messaggio che dice di avviare Docker e, per Docker dentro WSL, di lanciarla da WSL come `npm run dev`. Non salta i test | verifica manuale: Docker spento, `npm run test:api` termina in pochi secondi con il messaggio e codice d'uscita diverso da zero |
| R8 | Si può eseguire un file solo: `npm run test:api -- tests/api/ricariche.test.ts` prepara l'ambiente ed esegue solo quel file | verifica manuale: il comando esegue i soli casi di `ricariche.test.ts` |
| R9 | Se un test fallisce, la suite stampa le ultime righe di log del backend e dell'authorizer di **quel** file | verifica manuale: con un assert reso falso di proposito in `ruoli.test.ts`, l'output contiene il log dei due servizi di quel file e di nessun altro |

### Debug

| # | Requisito | Test |
|---|---|---|
| R10 | Da VS Code la configurazione **"Test API (debug)"** di `.vscode/launch.json` lancia la suite (o il file indicato alla richiesta) un file alla volta, collegando il debugger anche ai processi di backend e authorizer: un breakpoint nei sorgenti TypeScript del backend si ferma quando un test chiama quella rotta | verifica manuale: breakpoint nell'handler di `GET /api/soci/:id`, "Test API (debug)" su `attivita-soci.test.ts`: l'esecuzione si ferma sul breakpoint, e riprendendo il test passa |
| R11 | Con `TEST_DEBUG=1` i file girano **uno alla volta**, backend e authorizer si avviano con `--inspect` su **9229** e **9230** per collegarsi da qualunque debugger, e i test non hanno timeout, così una pausa su un breakpoint non fa fallire niente. La configurazione di R10 non la imposta: VS Code si collega da sé ai processi figli, e le porte fisse servono solo da fuori | verifica manuale: `TEST_DEBUG=1 npm run test:api -- tests/api/ruoli.test.ts`, ci si collega alla 9229 da Chrome (`chrome://inspect`) e un breakpoint nel backend si ferma |

### Parallelismo

| # | Requisito | Test |
|---|---|---|
| R12 | I file di test girano **in parallelo**, ognuno in un processo con **i propri database** (`clubby_t<pid>` e `clubby_auth_t<pid>`, clonati dai modelli con `CREATE DATABASE ... TEMPLATE`) e **i propri processi** di backend e authorizer. Nessun file vede i dati di un altro | verifica manuale: la suite è verde con `TEST_PARALLELISMO=1` e con il valore predefinito; il tempo delle due esecuzioni è riportato in Verifica |
| R13 | Il numero di file in parallelo è **4** per default, e si cambia con `TEST_PARALLELISMO` | verifica manuale: con `TEST_PARALLELISMO=2`, durante l'esecuzione non ci sono mai più di 2 backend della suite accesi (database `clubby_t<pid>` presenti nel container: al più 2 più il modello) |

### Configurazioni dell'applicazione

| # | Requisito | Test |
|---|---|---|
| R14 | Ogni file dichiara la configurazione del backend che gli serve (`RECHARGE_MODE`, `ENABLE_MODULE_TESSERAMENTO`, `ENABLE_MODULE_RICEVUTE`); senza dichiarazione vale `free` con i due moduli accesi | `ricariche-map.test.ts` › "fuori taglio senza valore: 400" (risponde così solo un backend avviato in `map`); `moduli-spenti.test.ts` › "a modulo Ricevute spento le rotte dei documenti rispondono 404" |
| R15 | La **seconda istanza** del backend sparisce: `ricariche-map.test.ts` e `moduli-spenti.test.ts` avviano il proprio backend in quella configurazione, e `helpers.ts` perde `API_URL_VARIANTI` e `apiVarianti` | verifica in revisione: `git grep -n "apiVarianti\|API_URL_VARIANTI" tests` non trova niente |
| R16 | Modalità **`percentage`**, oggi senza test delle API: la ricarica accredita il pagato più la percentuale, arrotondata al centesimo, e in Ricevute la voce vale il pagato; a percentuale 0 accredita il pagato; un `valore` esplicito è rifiutato (400). Un `RECHARGE_MODE` sconosciuto vale `free` | nuovo `ricariche-percentuale.test.ts` › "la ricarica accredita il pagato più la percentuale, la voce in Ricevute vale il pagato" (percentuale 10, pagato 50: movimento da 55 con `importo_pagato` 50); › "a percentuale 0 accredita il pagato (importo_pagato null)"; › "l'accredito si arrotonda al centesimo" (percentuale 15, pagato 33,33: movimento da 38,33); › "un valore esplicito è rifiutato (400)". Nuovo `ricariche-modalita-sconosciuta.test.ts` › "un RECHARGE_MODE sconosciuto vale free" (backend avviato con `RECHARGE_MODE=altro`: pagato 50, movimento da 50 con `importo_pagato` null, e un `valore` esplicito rifiutato come in `free`) |
| R17 | **Un modulo spento e l'altro acceso**, oggi mai provati. Ricevute spento, Tesseramento acceso: rotte dei documenti 404, tesseramenti funzionanti, e né incontri né storico dei tesseramenti portano i campi della ricevuta. Tesseramento spento, Ricevute acceso: rotte dei tesseramenti 404, elenco soci senza numero di tessera, ricevute emesse normalmente | nuovo `moduli-solo-tesseramento.test.ts` › "le rotte dei documenti rispondono 404"; › "un tesseramento si registra e compare nello storico"; › "incontri e storico dei tesseramenti non hanno i campi della ricevuta". Nuovo `moduli-solo-ricevute.test.ts` › "le rotte dei tesseramenti rispondono 404"; › "l'elenco dei soci non ha il numero di tessera"; › "una ricevuta di una ricarica si emette e si scarica" |
| R17-bis | Per ciascun modulo, a modulo **spento** rispondono 404 **tutte** le sue rotte (Tesseramento: `GET`/`POST /api/tesseramenti`, `GET /api/tesseramenti/:socioId`, `PATCH /api/tesseramenti/rinnovi/:id`; Ricevute: `GET /api/documenti/voci`, `POST /api/documenti/anteprima`, `GET`/`POST /api/documenti`, `GET /api/documenti/:id`), mentre le API fuori dal modulo rispondono normalmente. A modulo **acceso** le funzionalità restano provate dal resto della suite, che gira con i due moduli accesi (Luca, 2026-11-19) | `moduli-solo-tesseramento.test.ts` › "le rotte dei documenti rispondono 404"; `moduli-solo-ricevute.test.ts` › "le rotte dei tesseramenti rispondono 404"; `moduli-spenti.test.ts` › "a modulo Ricevute spento le rotte dei documenti rispondono 404" e › "a modulo Tesseramento spento le rotte dei tesseramenti rispondono 404" (con tutte le rotte di R17-bis); `moduli-spenti.test.ts` › "il resto dell'API risponde normalmente" |

### Dati dei test

| # | Requisito | Test |
|---|---|---|
| R18 | **Prima di ogni test** i database del file sono azzerati: tabelle dei dati vuote, contatore delle ricevute vuoto, impostazioni ai valori iniziali delle migrazioni, registro delle migrazioni intatto | `documenti-libere.test.ts` › "una ricevuta libera e una di socio emesse di seguito hanno numeri consecutivi" (la prima ricevuta del test è la n. 1 dell'anno, la seconda la n. 2) |
| R19 | Ogni test crea **soltanto** i dati che verifica, con le funzioni di costruzione di `tests/api/fabbrica.ts` (admin, account con ruolo, socio con o senza account e voucher, attività, abilitazioni, incontri, tesseramenti, tagli). Spariscono il dataset comune (`preparaDati`) e le sue attese (`ATTESE`) | verifica in revisione: `grep -n "preparaDati\|ATTESE" tests/api` non trova niente |
| R20 | I dati si creano **dalle API**, come farebbe un admin. Dal database passano solo il privilegio del primo admin e l'azzeramento | verifica in revisione: in `tests/api/` le sole query SQL sono in `fabbrica.ts` (primo admin) e in `ambiente.ts` (azzeramento e database del file) |
| R21 | Dove un caso verifica un totale, un conteggio o un numero di ricevuta, l'atteso è **esatto**: niente `>=` o ricerca del proprio record fra quelli di altri | `elenchi-paginati.test.ts` › "restituisce stato e conteggi per stato" (conteggi uguali ai tesseramenti creati dal caso) e `elenchi-paginati.test.ts` › "pagina gli account con il numero dei da collegare" (`total` e numero dei da collegare uguali agli account creati dal caso) |
| R22 | Nessun caso si perde: file e titoli dei casi di oggi restano quelli, perché le colonne **Test** delle spec 001–013 li citano per nome. Un caso che cambia titolo, si divide o sparisce è elencato in "Casi rinominati" con il motivo | verifica in revisione: confronto dell'elenco dei titoli prima e dopo (`grep -h "it('" tests/api/*.test.ts`); le differenze, tolti i casi nuovi di R16 e R17, sono tutte in "Casi rinominati" |
| R23 | La modalità a tagli **senza alcun taglio configurato** si prova davvero (R7 della spec 013, oggi non verificabile su un database condiviso) | `ricariche-map.test.ts` › "con un valore esplicito la ricarica passa a prescindere dai tagli" (eseguito su una tabella `ricarica_taglio` vuota) |

### CI e documentazione

| # | Requisito | Test |
|---|---|---|
| R24 | In CI il job `test` di `build-deploy.yml` esegue `npm run test:api` con `TEST_IMMAGINE_BACKEND` e `TEST_IMMAGINE_AUTHORIZER` impostate alle immagini della run (o all'ultima deployata, come oggi, se uno scope non è stato ribuildato): con queste variabili la suite avvia i servizi di ogni file come container da quelle immagini invece che dai sorgenti, con le stesse variabili di R3 | verifica manuale: run della Pipeline su `feature/spec-014`, job `test` verde, nel log l'avvio dei container da quelle immagini |
| R25 | Il job `test` non ha più il service `postgres`, la creazione dei database con `psql`, i `docker run` dei servizi e i `.env` scritti a mano; continua a bloccare i deploy, non le build | verifica in revisione del diff di `build-deploy.yml`; run della Pipeline: con un test rosso i job di deploy restano saltati |
| R26 | Spariscono `npm run dev:backend:test`, `npm run test:api:pulizia`, `backend/.env.test`, `backend/.env.test-varianti`, gli script `dev:test` e `dev:test:varianti` del backend, `tests/api/pulizia.ts`, la pulizia per marcatori e la regola "finite le prove, liberare la 3002" | verifica in revisione: `git grep -n "dev:backend:test\|test:api:pulizia\|env.test\|pulisciDatiTest"` trova solo questa spec e le spec chiuse che ne parlano come storia |
| R27 | AGENTS.md (Commands, Test, Chiudere quello che si è aperto, Verifica prima di consegnare), `docs/developer/sviluppo-locale.md`, `.github/README.md`, `docs/readme/pipeline-ci-cd.md` e `specs/README.md` descrivono il modo nuovo | verifica in revisione: ognuno nomina `npm run test:api` come unico comando e Docker come prerequisito; nessuno cita più l'avvio a mano dei servizi per i test |

Coinvolti: chi sviluppa (in locale) e la Pipeline (job `test`). Nessun ruolo
dell'applicazione, nessuna pagina.

### Casi rinominati

Nessuno (R22). Confronto degli elenchi completi `file › describe › it` prima e
dopo, ricavati dal runner: tutti i 201 casi di prima ci sono ancora, nello
stesso file e con lo stesso titolo. Si aggiungono gli 11 casi nuovi di R16 e
R17 (`ricariche-percentuale` 4, `ricariche-modalita-sconosciuta` 1,
`moduli-solo-tesseramento` 3, `moduli-solo-ricevute` 3): 212 in tutto.

## Modello dati

Nessuna variazione di schema. I database dei test nascono dagli stessi file di
quello di sviluppo: `backend/src/db/schema.sql`, `authorizer/src/db/schema.sql`,
`scripts/init-auth-db.sh` e le migrazioni applicate da `scripts/migra.sh`.

## API

Nessun endpoint nuovo o modificato.

## Interfaccia

Nessuna modifica all'interfaccia né al manuale d'uso.

## Come funziona

```
npm run test:api [-- file...]
└─ node tests/api/avvia.ts                          (una volta per esecuzione)
     1. Docker raggiungibile? altrimenti esce con il messaggio             (R7)
     2. loghi: BRANDING_DIR punta a branding/ alla radice (i PDF usano il logo)
     3. container postgres:18.3-alpine (Testcontainers)
          init:  schema dell'app, init-auth-db.sh  → clubby_modello, clubby_auth_modello
          poi:   migra.sh sui due modelli (in CI: dall'immagine del backend) (R1)
     4. node --test --test-concurrency=$TEST_PARALLELISMO (4; 1 con TEST_DEBUG) <file>
     5. spegne postgres, anche su Ctrl+C                                   (R6)

   ogni file di test, nel proprio processo (tests/api/ambiente.ts):
     before:      CREATE DATABASE clubby_t<pid> TEMPLATE clubby_modello (e auth)  (R12)
                  authorizer e backend su porte libere, con la configurazione
                  del file (R14) e tutte le variabili esplicite (R3):
                    locale: node --import tsx <modulo>/src/server.ts
                            (+ --inspect 9229/9230 con TEST_DEBUG)       (R11)
                    CI:     container da TEST_IMMAGINE_*                  (R24)
     beforeEach:  azzeramento dei due database                            (R18)
     after:       log dei servizi se un test è fallito (R9), poi li spegne
                  e cancella i due database
```

Un file, a cose fatte, ha questa forma:

```ts
usaAmbiente({ RECHARGE_MODE: 'percentage' }); // before/beforeEach/after

it('a percentuale 0 accredita il pagato (importo_pagato null)', async () => {
  const admin = await creaAdmin();
  const socio = await creaSocio(admin, 'socio1', { ricarica: 50 });
  // ...solo quello che serve a questo caso
});
```

File coinvolti:

| File | Cosa fa |
|---|---|
| `tests/package.json` | dipendenze proprie della suite: `testcontainers`, `@testcontainers/postgresql`, `pg`. `npm run install:all` le installa insieme ai moduli |
| `tests/api/avvia.ts` | il punto d'ingresso: Postgres con i database modello, `node --test`, spegnimento |
| `tests/api/ambiente.ts` | `usaAmbiente(config)`: database e servizi del file, azzeramento, log, spegnimento. Senza le variabili di `avvia.ts` si ferma (R4) |
| `tests/api/fabbrica.ts` | le funzioni di costruzione dei dati (R19), dalle API |
| `tests/api/helpers.ts` | come oggi (chiamate HTTP, `atteso`, `saldo`…), con l'indirizzo dei servizi preso dall'ambiente del file (`servizi`) |
| `tests/api/moduli.ts` | le rotte di ciascun modulo e il controllo che rispondano tutte 404 (R17-bis) |
| `.vscode/launch.json` | configurazione "Test API (debug)" (R10) accanto a quelle che ci sono |

L'azzeramento fa `TRUNCATE ... RESTART IDENTITY CASCADE` di tutte le tabelle
dei due database tranne `migrazione` e `impostazione`, e rimette
`impostazione` com'era nel modello. L'elenco delle tabelle lo legge dal
catalogo: una tabella nuova è azzerata senza che nessuno debba ricordarsene,
che è il difetto della pulizia di oggi.

I servizi si avviano con `node --import tsx` e non con `npx tsx`: un processo
solo per servizio, che su Windows si spegne davvero, e a cui il debugger si
collega senza passare da un processo intermedio.

## Decisioni

| Tema | Scelta | Motivo |
|---|---|---|
| Isolamento (D1) | Database del file azzerato prima di ogni test | Ogni test indipendente dagli altri dello stesso file; `TRUNCATE` di una ventina di tabelle costa millisecondi |
| Da cosa girano i servizi in locale (D2) | Dai sorgenti, avviati dalla suite | Richiesta di Luca: si può fare debug di backend e authorizer mentre la suite gira, e non serve una build prima di ogni giro |
| Solo Testcontainers per il database (D3) | Nessun modo di puntare la suite altrove: niente indirizzi di ripiego, niente `TEST_*_DB_URL`, variabili dei servizi tutte esplicite | Richiesta di Luca. Un secondo modo che scrive sul database di sviluppo è proprio ciò che questa spec toglie |
| Origine dei dati (D4) | Dalle API; dal database solo primo admin e azzeramento | Un insert diretto salta validazioni e permessi e può costruire stati impossibili |
| CI (D5) | Stesso `avvia.ts` e stesso database su Testcontainers; servizi dalle immagini della run | In CI non si fa debug, e lì conta provare l'artefatto che verrà deployato, come oggi. La differenza sta in un solo punto di `ambiente.ts`: come si avvia un servizio, con le stesse variabili |
| Parallelismo (D6) | Un processo per file, un database per processo clonato dal modello, 4 file in parallelo per default | Richiesta di Luca. Il clone da template evita di rifare baseline e migrazioni per ogni file |
| Postgres | Uno solo per esecuzione, con un database per processo | Un Postgres per processo aggiungerebbe qualche secondo e un container in più a ogni file, per un isolamento che i database separati danno già |
| Configurazioni (D7) | Una configurazione del backend per file, dichiarata in testa | Si leggono all'avvio del backend: un backend per file le rende semplici da provare tutte, e sostituisce la seconda istanza |
| Debug | Configurazione VS Code con aggancio ai processi figli; `TEST_DEBUG=1` per tutto il resto | Un file alla volta e porte d'ispezione fisse rendono prevedibile dove si ferma un breakpoint; senza timeout una pausa non diventa un fallimento |
| Bump di versione | Nessuno | Backend, authorizer e frontend non cambiano comportamento né immagine: un tag nuovo riferirebbe un'immagine identica alla precedente (regola 5 di AGENTS.md) |
| Dipendenze della suite | `tests/package.json` con dipendenze proprie | Testcontainers non ha motivo di stare fra le dipendenze del backend; oggi la suite prende in prestito `pg` dal backend |
| Marcatori `_test` e `clubby.test` | Restano nei nomi creati dalla fabbrica, ma nessuno li usa più per cancellare | Rendono leggibile un log o un dump del database dei test |

## Alternative scartate

| Alternativa | Perché no |
|---|---|
| Backend e authorizer **sempre in container**, anche in locale, buildati dalla copia di lavoro | Proposta del secondo Draft (2026-11-19), su un'idea di Luca. Scartata da Luca lo stesso giorno: in container non si può seguire il backend con il debugger, e ogni giro costerebbe una build delle immagini |
| Servizi dai sorgenti anche in CI | In CI non serve il debug, e si smetterebbe di provare l'artefatto che va in cluster; servirebbe in più installare le dipendenze di sviluppo dei due moduli nel job |
| Suite contro i servizi accesi a mano, come oggi, o contro i container di `docker-compose.yml` | Scartata da Luca il 2026-11-19: il database dei test è solo su Testcontainers |
| Un secondo database di test in `docker-compose.yml` (es. `clubby_test` sulla porta 5433) | Uno stato che sopravvive fra un'esecuzione e l'altra, da accendere e spegnere a mano. Luca ha chiesto Testcontainers |
| Tutti i file in serie, come oggi | Scartata da Luca il 2026-11-19: con la preparazione dei dati per ogni test la suite si allungherebbe. Resta solo in debug (R11) |
| Un Postgres in container per ogni processo | Qualche secondo e un container in più per file, senza un isolamento migliore dei database separati |
| Un container nuovo per ogni test | Quasi duecento avvii: minuti di attesa per nessun vantaggio sull'azzeramento |
| Dati con un identificativo univoco, senza azzeramento | Non risolve i totali, il contatore delle ricevute e la riga unica delle impostazioni, che sono proprio i casi che oggi costringono a `>=` e ai ripristini a mano |
| Tenere la seconda istanza del backend (3002) accanto alla principale | Con un backend per file nella configurazione dichiarata non serve più: ogni configurazione è un file |
| `--test-global-setup` di `node --test` al posto di `avvia.ts` | Sperimentale in Node 24, e passa ai processi dei test le informazioni solo attraverso l'ambiente ereditato: uno script che le passa esplicitamente è più semplice da leggere e da correggere |

## Rischi e impatti

- **Docker diventa un prerequisito dei test.** Lo è già per `docker compose`.
  Su Windows con Docker dentro WSL la suite si lancia da WSL, come
  `npm run dev` (Luca, 2026-11-19): lì Testcontainers trova Docker senza
  configurazione. Senza Docker, la suite fallisce subito (R7).
- **In locale e in CI i servizi partono in due modi** (sorgenti e immagini). Il
  rischio è che divergano; lo limita che la differenza sia in un solo punto e
  che le variabili passate siano le stesse (R3). Un difetto che c'è solo
  nell'immagine (un file non copiato dal Dockerfile) lo trova la CI, come oggi.
- **Dipendenze installate**: in locale servono quelle di backend e authorizer
  (`npm run install:all`), perché i servizi girano da `tsx`.
- **Primo avvio più lento**: Testcontainers scarica `testcontainers/ryuk` (il
  processo che rimuove i container se la suite muore) e, se manca,
  `postgres:18.3-alpine`.
- **Durata della suite**: ogni file paga l'avvio dei due servizi (un paio di
  secondi) e ogni test registra i propri account (scrypt nell'authorizer); il
  parallelismo lo compensa. Si misura prima e dopo e si riporta in Verifica.
- **Processi rimasti accesi**: se la suite muore male, i processi dei servizi
  potrebbero sopravvivere al processo del file. Li spegne `after` e, su Ctrl+C,
  il gestore del segnale; R6 lo verifica.
- **Riscrittura estesa**: i 18 file cambiano quasi tutti nella preparazione. Il
  rischio è perdere un caso o indebolirne un'asserzione; lo coprono R22 (stessi
  titoli, differenze elencate) e R21 (attese esatte).
- **Workflow**: `.github/` sul PC di Luca non si scrive da remoto. La modifica a
  `build-deploy.yml` e `.github/README.md` si consegna come patch da applicare
  con `git apply`.
- **CI**: Testcontainers sui runner `ubuntu-24.04` usa il Docker del runner; le
  immagini stanno su ghcr.io, già autenticato dal job.
- **Spec chiuse che citano il modo di oggi** (007, 013 nominano la 3002 e
  `dev:backend:test`): restano come sono, sono la storia delle decisioni.

## Documentazione da allineare

| File | Cosa cambia |
|---|---|
| `AGENTS.md` | Commands (via `dev:backend:test` e `test:api:pulizia`), sezione Test riscritta, "Chiudere quello che si è aperto" senza 3002 né pulizia dei dati di prova, Verifica prima di consegnare |
| `docs/developer/sviluppo-locale.md` | sezione "Test delle API": prerequisiti (Docker), un comando solo, un file solo, `TEST_PARALLELISMO`, debug (`TEST_DEBUG`, configurazione VS Code), cosa succede a database e porte |
| `.github/README.md` | il job `test` (patch) |
| `docs/readme/pipeline-ci-cd.md` | il job `test` |
| `specs/README.md` | riga della 014 |
| `package.json` (radice) | script `test:api`, `install:all`; via `dev:backend:test` e `test:api:pulizia` |
| `backend/package.json` | via `dev:test` e `dev:test:varianti` |
| `.vscode/launch.json` | configurazione "Test API (debug)" |

## Test dell'utente

1. Da WSL, come `npm run dev`: `npm run install:all` (installa anche
   `tests/`), Docker acceso.
2. `npm run test:api`: 212 casi verdi. Prima e dopo, sul database di sviluppo,
   `SELECT anno, ultimo FROM documento_numerazione` e `SELECT * FROM impostazione`
   danno lo stesso risultato (R5). Lo stesso con `npm run dev` acceso (R2).
3. Finita la suite, e dopo una interrotta con Ctrl+C a metà, `docker ps -a` non
   elenca container della suite (R6).
4. `node --test tests/api/ruoli.test.ts` si ferma con il messaggio che rimanda a
   `npm run test:api` (R4).
5. In VS Code, "Test API (debug)" su `tests/api/attivita-soci.test.ts` con un
   breakpoint nell'handler dei soci del backend: si ferma lì (R10).
6. `git apply spec-014-github.patch` (porta le modifiche a `.github` e a
   `.vscode/launch.json`, due cartelle non scrivibili da qui), push del branch: il job `test` della Pipeline è verde e nel log
   avvia i container dalle immagini della run (R24, R25).

## Verifica

### Implementazione (Claude, 2026-11-19)

Eseguite su una copia del branch in una sandbox Linux con Docker e Node 24,
mai sul database di sviluppo.

| Cosa | Esito |
|---|---|
| Suite completa, dai sorgenti, 4 file in parallelo | 212 casi verdi, 44 s |
| Suite completa, `TEST_PARALLELISMO=1` | 212 verdi, 115 s (R12) |
| Suite completa, 8 in parallelo, 5 esecuzioni di fila | 5 su 5 verdi, 35 s l'una. Una prima prova con 6-8 in parallelo aveva fatto fallire un file a fine esecuzione: il `DROP DATABASE ... WITH (FORCE)` raggiungeva una connessione del pool appena chiusa. Corretto in `ambiente.ts`, che ora ignora gli errori delle connessioni inattive; nello stesso punto l'azzeramento usa una connessione sola per la sua transazione |
| Modalità CI: `TEST_IMMAGINE_BACKEND` e `TEST_IMMAGINE_AUTHORIZER` su immagini costruite in locale dai Dockerfile | 212 verdi, 51 s; migrazioni dell'app dall'immagine del backend. L'immagine del backend è stata costruita da una variante del Dockerfile con `bash` e `psql` presi dall'immagine di Postgres, perché la sandbox non raggiunge i mirror di Alpine: il resto è identico |
| Dopo ogni esecuzione | `docker ps -a` e `docker network ls` senza niente della suite (R6) |
| `node --test tests/api/ruoli.test.ts` | si ferma con il messaggio che rimanda a `npm run test:api` (R4) |
| Confronto dei titoli prima e dopo | nessun caso perso o rinominato (R22) |
| R15, R19, R20, R26 (ricerche nel codice) | nessuna occorrenza. Unica eccezione di R26: `.env.test.local` in `backend/.gitignore`, che è l'elenco standard dei file di dotenv e non riguarda la suite |

Non verificati qui: R2, R3, R5 e R7 sul PC di Luca (WSL), R10 e R11 (debugger), R24 e
R25 (run vera della Pipeline). Sono nel test dell'utente.

### Test dell'utente (Luca, 2026-11-19)

Luca ha eseguito le prove di "Test dell'utente" sul suo PC, lanciando la suite
da WSL come `npm run dev`, con la patch di `.github` applicata, e ha chiuso la
spec. Durante le prove:

- `npm run test:api` si fermava con `Cannot find package 'testcontainers'`:
  mancava `npm install --prefix tests` (lo fa anche `npm run install:all`).
- `npm audit` in `tests/` segnalava 7 vulnerabilità moderate, tutte da `glob`
  e `minimatch` vecchi, portati da `archiver` dentro Testcontainers. Risolte
  con un `overrides` di `glob` alla 14 in `tests/package.json`; la suite resta
  verde (212 su 212). Backend, frontend e authorizer: 0 vulnerabilità.
- La documentazione diceva di lanciare Node da Windows: corretta, su Windows si
  lavora da WSL (R7, `docs/developer/sviluppo-locale.md`, seed).
- R4 è stato riscritto per chiarire che vieta di lanciare un file con
  `node --test`, non di eseguire un file solo con `npm run test:api` (R8).
