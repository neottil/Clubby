# 012 — Clubby installabile come app (PWA)

## Stato

- [x] Draft
- [x] Approvata (Luca, 2026-11-03)
- [x] In test (utente)
- [x] Completata (Luca, 2026-11-13)

**Versioni**: `frontend 2.13.0`; `frontend 2.13.1` per la voce "Installa l'app" su iPhone (R5-bis). Backend e authorizer non toccati.

## Introduzione: perché una PWA e non un'app sugli store

Il 2026-10-30 Luca ha chiesto di valutare un frontend "app" per Android e iOS,
possibilmente con un solo codice da mantenere insieme al sito. L'analisi
completa è nel documento
[Clubby: app Android e iOS, analisi delle opzioni](https://claude.ai/artifact/AvucXCTNXAnxrjLmMGxBTo).

Le strade valutate sono state tre: PWA, Capacitor (lo stesso frontend React
impacchettato in un'app per gli store) e React Native/Expo (app nativa
riscritta). React Native è stato scartato subito: vorrebbe dire riscrivere da
zero tutta l'interfaccia (circa 8.800 righe, tabelle, form, editor Markdown) e
il sito con lei.

Capacitor era la strada consigliata per arrivare sugli store, con un'app unica
per tutti i club e la scelta del club tramite link. **Il 2026-11-03 Luca ha
deciso di partire dalla PWA e di non fare, per ora, l'app Capacitor**: la PWA
dà lo stesso risultato pratico (icona sulla schermata Home, app a tutto
schermo) senza store, senza costi (25 USD Google Play, 99 USD l'anno Apple),
senza build e firme per due piattaforme e senza una versione dell'app che
resta indietro rispetto ai backend dei club. Le decisioni prese per Capacitor
sono in [Alternative scartate](#alternative-scartate), così chi la riprenderà
in mano parte da lì.

## Problema

Clubby oggi si usa solo da browser. Da telefono — dove soci e istruttori lo
usano di più: il saldo del voucher, l'incontro da registrare a fine lezione —
bisogna aprire il browser, cercare l'indirizzo o un segnalibro, e dopo aver
chiuso la scheda rifare l'accesso, perché la sessione sta in `sessionStorage`
e muore con la scheda.

## Obiettivo

Ogni club si può installare sul telefono (Android e iPhone) e sul computer
come un'app: icona e nome del club sulla schermata Home, apertura a tutto
schermo senza barra del browser, e accesso che resta valido fra un'apertura e
l'altra per chi lo sceglie. Il codice resta uno solo, quello del sito.

## Fuori perimetro

- **Pubblicazione sugli store** (Google Play, App Store) e app Capacitor: vedi
  l'introduzione.
- **Notifiche push.** Una PWA le supporta (Android sempre, iPhone da iOS 16.4
  se l'app è installata sulla Home), ma servono lavoro sul backend (chiavi
  VAPID, iscrizioni salvate, invio) e la scelta di quali eventi notificare.
  Eventuale spec a parte.
- **Uso offline dei dati.** Senza rete l'app mostra un avviso, non dati in
  cache: saldi e incontri vecchi mostrati come attuali sarebbero peggio di
  niente.
- **Funzioni nuove**: l'app installata fa esattamente quello che fa il sito.

## Requisiti

| # | Requisito | Test |
|---|---|---|
| R1 | Ogni ambiente serve su `/manifest.webmanifest` un manifest del **proprio** club: `name` = `TENANT_NAME`, `short_name` = Variable `TENANT_SHORT_NAME` se impostata altrimenti `TENANT_NAME`, `display: standalone`, `start_url` e `scope` `/`, `theme_color` e `background_color` dal tema del club, icone dal logo del club | Controllo manuale: `curl https://<APP_DOMAIN>/manifest.webmanifest` su `development` e su un club, i valori corrispondono alle Variables dell'Environment |
| R2 | Il manifest è generato al deploy nel ConfigMap del frontend, come `config.json`, e servito da nginx con `Cache-Control: no-store`; l'immagine resta una sola per tutti i club | Controllo manuale: cambiare `TENANT_SHORT_NAME`, rifare il deploy senza rebuild, il manifest servito cambia |
| R3 | Dal logo di ogni club (`branding/`) la build genera le icone PNG richieste: 192×192 e 512×512 (anche in versione *maskable*, con margine) per il manifest, 180×180 per iOS (`apple-touch-icon`). Senza `LOGO_FILE` si usano le icone generate da `frontend/public/logo.svg` | Controllo manuale: in `dist/branding/icone/` ci sono le icone di ogni logo; DevTools › Application › Manifest non segnala errori sulle icone |
| R4 | Su Android (Chrome) l'app risulta installabile: il browser propone l'installazione, e il menu dell'utente mostra la voce **"Installa l'app"** quando il browser lo permette e l'app non è già installata | Controllo manuale su un telefono Android: compare la proposta del browser e la voce di menu; dopo l'installazione la voce sparisce |
| R5 | Su iPhone e iPad (Safari), dove l'installazione è solo manuale, un avviso richiudibile spiega come fare (Condividi › Aggiungi alla schermata Home). Compare solo in Safari su iOS, solo se l'app non è già installata, e non ricompare da solo dopo essere stato chiuso | Controllo manuale su iPhone: l'avviso compare in Safari, non compare nell'app installata, non ricompare da solo dopo la chiusura |
| R5-bis | Su iPhone e iPad (Safari), se l'app non è già installata, il menu ha la stessa voce **"Installa l'app"** di Android: riapre l'avviso di R5 con le stesse istruzioni, anche dopo che l'avviso è stato chiuso. Richiudere l'avviso non cambia niente: la voce resta (aggiunto durante il test, Luca 2026-11-13) | Controllo manuale su iPhone: chiudere l'avviso, aprire il menu, "Installa l'app" lo riapre; nell'app installata la voce non c'è |
| R6 | L'app installata si apre a tutto schermo, con icona e nome del club, e su iOS con la barra di stato nel colore del club | Controllo manuale su Android e iPhone dopo l'installazione |
| R7 | Un service worker mette in cache **solo** i file statici dell'app (JS, CSS, font, icone, logo). Non mette mai in cache le chiamate a backend e authorizer, `config.json`, `version.json` e `manifest.webmanifest` | Controllo manuale: DevTools › Application › Cache Storage contiene solo asset statici; DevTools › Network: le chiamate `/api/...` e `/config.json` non arrivano dal service worker |
| R8 | Dopo un deploy (anche un Promote o un rollback) l'app usa la nuova versione: il service worker nuovo prende il posto del vecchio e l'utente vede un avviso **"È disponibile una nuova versione — Aggiorna"**; la pagina Info mostra la versione nuova dopo l'aggiornamento | Controllo manuale: app aperta su `development`, nuovo deploy, compare l'avviso, dopo "Aggiorna" la pagina Info mostra il nuovo tag |
| R9 | Senza rete l'app installata si apre e mostra un avviso "Sei offline" invece della pagina di errore del browser; le azioni che chiamano le API danno il messaggio di errore già previsto | Controllo manuale in modalità aereo, con l'app installata |
| R10 | La pagina di accesso ha la casella **"Resta collegato su questo dispositivo"**, non spuntata per default. Se spuntata la sessione si conserva in `localStorage` e sopravvive alla chiusura dell'app e del browser fino alla scadenza del refresh token (oggi 30 giorni, `DURATA_REFRESH_TOKEN_SECONDI` nell'authorizer); se non spuntata il comportamento resta quello di oggi (`sessionStorage`) | Controllo manuale: con la casella spuntata, chiudere e riaprire l'app senza dover rientrare; senza, chiudere la scheda chiede di nuovo l'accesso |
| R11 | "Esci" cancella la sessione sia da `sessionStorage` sia da `localStorage`, e revoca il refresh token come oggi | Controllo manuale: dopo "Esci" con "Resta collegato" attivo, la riapertura dell'app chiede l'accesso |
| R12 | Le ricevute PDF si aprono o si scaricano anche dall'app installata, su Android e su iPhone, e dopo la lettura si torna all'app | Controllo manuale: aprire una ricevuta da Voucher › movimenti nell'app installata su entrambi i telefoni |
| R13 | nginx serve `index.html` e il service worker con `Cache-Control: no-cache`, così un deploy non resta nascosto dietro la cache del browser; gli asset con hash nel nome restano in cache a lungo | Controllo manuale: `curl -I` su `/`, `/sw.js` e un file in `/assets/` |
| R14 | Il manuale d'uso (`frontend/src/manuale/sezioni.tsx`) ha una sezione "Installare Clubby sul telefono" per Android e iPhone, visibile a tutti i ruoli, e spiega "Resta collegato" | Rilettura della sezione nella pagina Manuale |
| R15 | In locale (`npm run dev`) l'app continua a funzionare come oggi; il service worker si prova con `npm run build && npm run preview` | Controllo manuale dei due comandi |

Ruoli coinvolti: tutti (socio, istruttore, admin) per installazione, "Resta
collegato" e aggiornamento; nessuna differenza di permessi.

## Modello dati

Nessuna variazione di schema.

## API

Nessun endpoint nuovo o modificato. Backend e authorizer non cambiano: l'app
installata è lo stesso sito sullo stesso dominio, quindi CORS e indirizzi
restano quelli di oggi.

## Interfaccia

- **Pagina di accesso**: casella "Resta collegato su questo dispositivo" sotto
  la password (R10).
- **Menu utente** (`Layout.tsx`): voce "Installa l'app" sui browser che lo
  permettono (R4) e su Safari per iPhone, dove riapre l'avviso iOS (R5-bis).
- **Avviso iOS** (R5): riquadro in basso, richiudibile, con l'icona di
  Condividi e i due passaggi. Lo stato "chiuso" sta in `localStorage`.
- **Avviso di aggiornamento** (R8): barra in alto con il pulsante "Aggiorna".
- **Avviso offline** (R9).
- **`index.html`**: `<link rel="manifest">`, `meta theme-color` e i meta per
  iOS (`apple-mobile-web-app-capable`, stile della barra di stato). Titolo,
  favicon e `apple-touch-icon` del club li imposta `main.tsx` dopo aver letto
  `config.json`, come fa già oggi per titolo e favicon.

Schermo stretto: tutti gli avvisi nuovi si adattano alla larghezza del
telefono; le pagine esistenti non cambiano.

## Configurazione e pipeline

- **Nuova Variable facoltativa** `TENANT_SHORT_NAME`: il nome sotto l'icona,
  che sulla Home si vede intero fino a circa 12 caratteri. Senza, si usa
  `TENANT_NAME`.
- **`deploy-frontend.yml`**: genera `manifest.webmanifest` con `jq` accanto a
  `FRONTEND_CONFIG_JSON` e lo aggiunge al ConfigMap. È un file sotto
  `.github/`: si consegna come patch da applicare con `git apply`.
- **`frontend/k8s/configmap.yaml`**: nuova chiave `manifest.webmanifest`. Il
  Deployment monta già il ConfigMap come cartella, quindi non cambia.
- **`frontend/nginx.conf`**: `location = /manifest.webmanifest` dal ConfigMap,
  `no-cache` su `index.html` e `sw.js`, cache lunga su `/assets/`.
- **`scripts/copia-branding.mjs`** (o uno script accanto): genera le icone PNG
  da ogni logo in `branding/` (R3).
- **Nuova dipendenza** del frontend: `vite-plugin-pwa` (service worker con
  Workbox), più la libreria per generare le PNG (es. `sharp`) fra le
  devDependencies.
- Nessun nuovo Secret, nessun nuovo job, nessun gate nuovo nella Pipeline.

Documentazione da allineare nello stesso passaggio: `docs/readme/funzionalita.md`
e `docs/readme/account-e-accessi.md` (installazione, "Resta collegato"),
`docs/readme/variabili-e-secret.md` e `.github/README.md` (`TENANT_SHORT_NAME`),
`docs/readme/manifest-k8s.md` (nuova chiave del ConfigMap),
`branding/README.md` (icone generate), `docs/developer/sviluppo-locale.md`
(provare il service worker con `preview`), `specs/README.md`.

## Decisioni

| Tema | Scelta | Motivo |
|---|---|---|
| PWA o app sugli store | PWA ora, Capacitor eventualmente dopo | Stesso risultato pratico senza store, costi e build native (Luca, 2026-11-03) |
| Un'app per club o una per tutti | Una PWA per club: ogni dominio è un'app a sé, con il proprio nome e la propria icona | Con la PWA viene gratis: è il multi-club di oggi, un dominio per club. Chi è socio di due club installa due icone |
| Manifest statico o per club | Per club, generato al deploy nel ConfigMap | Stesso schema di `config.json`: un'immagine per tutti i club, la personalizzazione arriva al deploy |
| Icone | Generate in build da `branding/` | Chi aggiunge un club mette solo il logo, come oggi; niente PNG da preparare a mano in quattro misure |
| Cosa mette in cache il service worker | Solo gli asset statici | Dati vecchi mostrati come attuali sarebbero un errore, non una comodità (vedi Fuori perimetro) |
| Aggiornamento | Avviso con pulsante "Aggiorna", non ricarica forzata (confermato da Luca il 2026-11-03) | Il service worker scarica da solo la versione nuova, ma la attiverebbe solo alla chiusura completa dell'app, che su telefono resta in background anche per giorni; l'avviso la rende attivabile subito, e una ricarica automatica a metà della compilazione di un incontro farebbe perdere il form |
| Sessione persistente | Solo su scelta esplicita ("Resta collegato"), non spuntata per default | Un PC condiviso in segreteria non deve restare collegato da solo; sul proprio telefono basta spuntarla una volta |
| Dove salvare la sessione persistente | `localStorage` | Unico salvataggio persistente disponibile a una PWA; il refresh token è già a rotazione e vale una volta sola |
| Più schede con "Resta collegato" | Una sola sessione per il dispositivo: il rinnovo avviene in esclusiva fra le schede (Web Locks), chi arriva per secondo adotta il token già rinnovato, e le altre schede si allineano con l'evento `storage`; "Esci" in una le chiude tutte | Il refresh token vale una volta sola: due schede che lo rinnovassero insieme si respingerebbero a vicenda, e l'utente verrebbe disconnesso proprio per aver scelto di restare collegato |
| Service worker al primo avvio | Prende subito il controllo della pagina (`clientsClaim`) | Senza, una versione nuova uscita durante la prima apertura si attiverebbe da sola invece di aspettare "Aggiorna" |
| Ricarica dopo "Aggiorna" | La fa la pagina, quando il nuovo service worker ne prende il controllo (`controllerchange`) | La ricarica di `vite-plugin-pwa` scatta solo per gli aggiornamenti visti nascere da `workbox-window`; quelli trovati dal controllo orario li considera esterni, e il tocco su "Aggiorna" non avrebbe ricaricato |
| Avvio senza rete | `/config.json` irraggiungibile mostra "Sei offline" con "Riprova", non "Applicazione non configurata" | La configurazione arriva solo dal server; un errore di configurazione davanti a una rete assente manderebbe a cercare un guasto che non c'è |
| Barra di stato su iPhone | `viewport-fit=cover` e barra `black-translucent`, con i margini di sicurezza in `index.css` e lo sfondo di `<html>` del colore della barra di navigazione | È l'unico modo di avere il colore del club dietro la barra di stato (R6); gli altri stili la fanno bianca o nera |
| "Installa l'app" su iPhone | Stessa voce e stesso nome di Android; riapre l'avviso iOS invece di avere una pagina o un testo suoi. Solo in Safari, come l'avviso | Un'istruzione scritta in un posto solo non può divergere; su Chrome o Firefox per iOS il pulsante Condividi sta altrove e il testo sarebbe sbagliato (Luca, 2026-11-13) |
| Notifiche push | Rimandate | Possibili anche con la PWA, ma richiedono lavoro sul backend: spec a parte se serviranno |

## Alternative scartate

| Alternativa | Perché no |
|---|---|
| **App Capacitor sugli store** (stesso codice React impacchettato) | Scelta di Luca il 2026-11-03 di partire dalla PWA. Costi (Google Play 25 USD una tantum, Apple 99 USD l'anno; Apple esonera gli enti non profit italiani con sole app gratuite, non i privati), build e firme per due piattaforme, runner macOS, revisioni degli store, versione dell'app installata che resta indietro rispetto ai backend. Se verrà ripresa, le decisioni già prese sono: **un'app unica per tutti i club**; **il club si sceglie solo tramite link** (anche QR code), un dominio unico per i link verificato come Universal Link e App Link, che porta all'app il dominio del club; l'app legge `config.json` del club e parla direttamente con il suo backend, che resta separato e sul suo server; conferma del dominio prima del login; più club ricordati con sessioni separate. Da fare in quel caso: CORS dell'authorizer come elenco (oggi accetta solo `https://${APP_DOMAIN}`), salvataggio sicuro dei token, PDF con il plugin di condivisione, versione minima dell'app, eliminazione dell'account dall'app (richiesta da Apple) |
| **Registro dei club** (`clubs.json` con l'elenco dei club per l'app unica) | Scartato da Luca il 2026-10-30 a favore del solo link; con la PWA non serve comunque, ogni club ha il suo indirizzo |
| **React Native / Expo** (con react-native-web per il sito) | Riscrittura di tutta l'interfaccia e del sito, editor Markdown da sostituire: mesi di lavoro per un gestionale a tabelle e form che in una webview funziona già bene |
| **Un'app per club sugli store** (white label) | Una scheda, una firma e una revisione per ogni club; Apple rifiuta app uguali pubblicate dallo stesso account (linea guida 4.3) |
| **TWA (Trusted Web Activity) per pubblicare la PWA su Google Play** | Solo Android e un pacchetto per club: riapre i problemi degli store senza risolvere iOS. Resta un'opzione a basso costo se un giorno servisse la presenza su Google Play |
| **Aggiornamento silenzioso** (la pagina si ricarica da sola appena trova la versione nuova) | Può ricaricare mentre si compila un incontro o una ricarica, e il form va perso (Luca, 2026-11-03) |
| **Nessun service worker** (sempre l'ultima versione, come il sito) | Apertura più lenta e niente avviso offline; l'avviso "Aggiorna" risolve già il problema della versione vecchia (Luca, 2026-11-03) |
| **Dati in cache per l'uso offline** | Vedi Fuori perimetro |
| **Sessione sempre persistente, senza casella** | Vedi Decisioni: i PC condivisi |

## Rischi e impatti

- **Service worker che serve una versione vecchia.** È il rischio principale
  di ogni PWA: un errore di configurazione può lasciare gli utenti su una
  build vecchia anche dopo un deploy o un rollback. Mitigazione: `no-cache` su
  `index.html` e `sw.js` (R13), avviso di aggiornamento (R8), e un service
  worker che non tocca mai API e configurazione (R7). Se servisse, si può
  pubblicare un service worker che si disinstalla da solo.
- **Sessione persistente e sicurezza.** Un token in `localStorage` è
  leggibile da uno script iniettato nella pagina (XSS). Il rischio esiste già
  oggi con `sessionStorage`; la persistenza ne allunga la finestra. Mitigazione:
  la scelta è esplicita, il refresh token è a rotazione, "Esci" lo revoca.
- **Ricevute PDF su iPhone.** Nell'app installata su iOS il download di un
  blob con `<a download>` può aprire il PDF a tutto schermo senza un modo
  evidente di tornare indietro. Se la prova di R12 lo conferma, su iOS si usa
  la condivisione nativa (Web Share API con il file), con il download di oggi
  come ripiego.
- **iOS tiene separati i dati del sito e dell'app installata**: chi installa
  l'app su iPhone deve rifare l'accesso una volta dentro l'app.
- **Ambiente `development`**: diventa installabile anche lui, con il suo nome
  (`TENANT_NAME`), quindi non si confonde con i club reali.
- **Promote e rollback**: nessun cambiamento nel flusso; il manifest si
  rigenera a ogni deploy come `config.json`.

## Note di implementazione

- Nuove dipendenze di sviluppo del frontend: `vite-plugin-pwa` 1.3 (service worker con Workbox),
  `workbox-window`, `sharp` (icone). Nessuna dipendenza nuova a runtime oltre al codice generato.
  `npm audit --omit=dev` resta a 0.
- Segnalazioni di `npm audit` (2026-11-04, su richiesta di Luca, per tutti i moduli e non solo per la
  PWA). Nessuna riguarda il codice in produzione: `npm audit --omit=dev` era e resta a 0 ovunque.
  - Root: `npm audit fix` aggiorna `shell-quote` (critica, sotto `concurrently`).
  - Backend: `npm audit fix` aggiorna `handlebars` (critica, sotto jest). `eslint` passa alla 10 e
    `overrides` forza `minimatch` 11 e `glob` 14 (moderate, sotto eslint e jest).
  - Frontend: `npm audit fix` aggiorna `vite` 7.3.7 e `source-map-js` 1.2.2 (high, già su main).
    `eslint` e `@eslint/js` passano alla 10, `eslint-plugin-react-hooks` alla 7 e
    `eslint-plugin-react-refresh` alla 0.5. `overrides` forza `ejs` 7, `minimatch` 11 e `glob` 14. Il
    service worker generato non cambia. In `eslint.config.js` restano le due regole di prima
    (`rules-of-hooks`, `exhaustive-deps`): il preset di react-hooks 7 aggiunge le regole del React
    Compiler, che su pagine esistenti danno 10 errori e vanno affrontate a parte.
  - Authorizer: già a 0.
  - Restano solo segnalazioni *low* su `deepmerge` 4.3.1 (sotto `jest-config` nel backend e sotto
    `workbox-build` nel frontend). Una versione corretta non esiste, e la 4.1 che `npm audit fix --force`
    proporrebbe (insieme a retrocessioni di jest e vite-plugin-pwa) toglierebbe proprio le protezioni
    contro il prototype poisoning aggiunte nella 4.2. Si usa solo in build e nei test, su
    configurazioni nostre.
- File nuovi: `frontend/scripts/genera-icone.mjs`, `frontend/public/manifest.webmanifest` (solo per il
  locale), `frontend/src/components/AvvisiApp.tsx` (avvisi di aggiornamento, offline e iOS; registra il
  service worker), `frontend/src/utils/installazione.ts`.
- Le modifiche sotto `.github/` (`deploy-frontend.yml`, `infra.yml`, `.github/README.md`) sono consegnate
  come patch, `spec-012-pwa.patch`.
- Provato in locale con Chromium (Playwright) contro un server che imita nginx, authorizer e backend:
  accesso con e senza "Resta collegato", riapertura del browser, tre schede con rinnovi ravvicinati
  (nessuna disconnessione, un solo refresh token valido alla fine), "Esci" in una scheda che chiude le
  altre, avvio con il server irraggiungibile e "Riprova", avviso "Aggiorna" dopo un nuovo deploy e
  ricarica sulla versione nuova, voce "Installa l'app" con l'evento simulato, avviso iOS con lo user
  agent di iPhone (e assente su Chrome per iOS), manifest e icone. Non provati, perché servono
  telefoni veri: installazione reale su Android e iPhone, barra di stato su iPhone, PDF dall'app
  installata su iPhone (R6, R12).

## Test dell'utente

L'utente ha provato l'app sull'ambiente `development`, dopo aver applicato la
patch di `.github/` e fatto il deploy della `frontend 2.13.0`, installandola sui
propri telefoni. Corretto durante il test, senza aprire una spec nuova:

- **R5-bis, "Installa l'app" anche su iPhone** (2026-11-13): l'avviso iOS,
  chiuso una volta, non tornava più, e su iPhone non c'era altro modo di
  rileggere le istruzioni. Aggiunta la stessa voce di menu di Android, che
  riapre l'avviso. `frontend 2.13.1`.

Confermato dall'utente: su Android, una volta installata l'app, la voce
"Installa l'app" sparisce dal menu (R4). Accettato così com'è tutto il resto;
la spec è stata dichiarata conclusa dall'utente il 2026-11-13.

## Verifica

| Requisiti | Come |
|---|---|
| R1, R3, R7, R8, R9, R10, R11, R13 | Prova in locale con Chromium (Playwright) contro un server che imita nginx, authorizer e backend (vedi [Note di implementazione](#note-di-implementazione)): manifest e icone, cache del service worker con soli asset statici, avviso "Aggiorna" e ricarica sulla versione nuova, avvio senza server con "Sei offline" e "Riprova", accesso con e senza "Resta collegato", tre schede con rinnovi ravvicinati, "Esci" che chiude le altre schede, intestazioni di cache |
| R2 | Revisione di `deploy-frontend.yml`, `frontend/k8s/configmap.yaml` e `frontend/nginx.conf`: il manifest è generato con `jq` al deploy, passa da `envsubst` nel ConfigMap e nginx lo serve con `no-store`; deploy su `development` riuscito dopo l'applicazione della patch |
| R4, R6, R12 | Prova dell'utente sui telefoni, su `development` (vedi [Test dell'utente](#test-dellutente)); in locale la voce "Installa l'app" era stata provata con l'evento `beforeinstallprompt` simulato |
| R5 | In locale con lo user agent di iPhone: l'avviso compare in Safari, non compare con Chrome per iOS, non torna da solo dopo la chiusura; prova dell'utente su iPhone |
| R5-bis | In locale (build di produzione servita da un server statico, user agent di iPhone): chiuso l'avviso, "Installa l'app" nel menu lo riapre; richiuso e ricaricata la pagina, l'avviso non torna da solo e la voce resta. Non provata su un iPhone vero con la `frontend 2.13.1` |
| R14 | Rilettura della sezione "Installare l'app sul telefono" del manuale, aggiornata anche per R5-bis |
| R15 | `npm run build` e `vite preview` in locale; `npm run dev` invariato |
| Build e lint | `npx eslint src` del frontend: 0 errori; `npm run build` del frontend riuscito (in un container `node:24-slim`, perché i `node_modules` locali hanno solo i binari Linux) |
