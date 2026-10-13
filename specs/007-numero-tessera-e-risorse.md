# 007 — Numero di tessera, primo tesseramento, risorse dei Deployment

> Quattro richieste raccolte insieme: tre riguardano il tesseramento (crearlo,
> dargli un numero, mostrarlo), la quarta è infrastruttura e non tocca il
> comportamento dell'applicazione. Stanno nella stessa spec perché escono
> nella stessa release.

## Stato

- [x] Draft
- [x] Approvata
- [x] In test (utente)
- [x] Completata

**Versioni**: `backend 2.12.0`, `frontend 2.11.0`. `authorizer` **non** si alza
(vedi R14).

## Problema

1. **Il primo tesseramento non si trova.** La funzione c'è già: nella pagina
   Tesseramenti ogni socio, anche chi non è mai stato tesserato, ha il pulsante
   **Rinnova**, e la modale dice "Primo tesseramento del socio". Ma il pulsante
   si chiama *Rinnova* anche per lo stato "Mai tesserato", e chi cerca "aggiungi
   un tesseramento" non pensa di dover rinnovare qualcosa che non esiste.
2. **La tessera fisica non ha corrispondenza in Clubby.** Chi si tessera riceve
   una tessera con un numero identificativo; oggi il numero non si registra da
   nessuna parte, e l'admin che deve ritrovarlo lo cerca fuori dall'applicazione.
3. **Nessuno vede il numero.** Né l'admin nell'elenco soci, né il socio nella
   propria area.
4. **Backend e frontend girano senza `resources`.** Hanno requests e limits il
   PostgreSQL e OpenWA (`k8s/templates/`) e l'authorizer
   (`authorizer/k8s/deployment.yaml`); **backend e frontend no**, e nemmeno il
   Job delle migrazioni. Senza requests lo scheduler non riserva niente per
   loro; senza limits un picco di memoria del backend (generazione di un PDF)
   può togliere memoria al database sulla stessa VPS.

## Obiettivo

L'admin registra un tesseramento — primo o rinnovo — insieme al numero della
tessera; il numero corrente di ogni socio compare nell'elenco soci per l'admin e
sopra al proprio voucher per il socio. Tutti i Deployment e il Job delle
migrazioni dichiarano requests e limits.

## Fuori perimetro

- **Stampa o generazione della tessera.** Il numero arriva da fuori (la tessera
  fisica, l'ente di affiliazione): Clubby lo registra, non lo assegna.
- **Numerazione automatica.** Stesso motivo: un numero proposto da Clubby
  sarebbe diverso da quello stampato, ed è quello stampato che conta.
- **Correzione di date e quota di un tesseramento già registrato.** Solo il
  numero di tessera diventa modificabile, e solo su quello in corso (R6): la quota può essere già finita in
  una ricevuta, e lo storico non si riscrive.
- **Il numero di tessera sulle ricevute PDF.** Non richiesto; se servirà, è una
  modifica a `service/documenti/` da specificare a parte.
- **Autoscaling, più repliche, PodDisruptionBudget.** R13 imposta solo le
  risorse del singolo pod.

## Requisiti

Tutti i requisiti R1–R12 stanno dietro `ENABLE_MODULE_TESSERAMENTO`: a modulo
spento non compare nessun numero di tessera, né nelle API né nell'interfaccia.

Il **tesseramento in corso** di un socio è il suo tesseramento più recente (per
scadenza), se la scadenza non è ancora passata: stato "Attivo" o "In scadenza".
Un socio scaduto o mai tesserato non ne ha uno.

| # | Requisito | Test |
|---|---|---|
| R1 | Pagina Tesseramenti (admin): per un socio in stato "Mai tesserato" il pulsante si chiama **Tessera** e la modale **Nuovo tesseramento - Nome Cognome**; per gli altri resta **Rinnova** | manuale: in Tesseramenti, filtro "Mai tesserato" → pulsante Tessera e titolo della modale; un socio attivo → pulsante Rinnova |
| R2 | `POST /api/tesseramenti` accetta `numero_tessera` e lo **richiede**: assente, vuoto o di soli spazi → 400. Gli spazi iniziali e finali vengono tolti | `tesseramenti-numero.test.ts` › "rinnovo senza numero di tessera → 400", "numero di soli spazi → 400", "il numero viene salvato senza spazi ai lati" |
| R3 | `numero_tessera` è testo libero di **al massimo 30 caratteri**; più lungo → 400 | `tesseramenti-numero.test.ts` › "numero di 30 caratteri accettato, di 31 → 400" |
| R4 | Un numero di tessera appartiene a **un solo socio**: registrarlo per un socio quando un tesseramento di un altro socio lo ha già → 409, con il nome del socio che lo usa. Lo stesso socio può riusarlo nei rinnovi | `tesseramenti-numero.test.ts` › "numero già di un altro socio → 409 con il nome", "lo stesso socio riusa il numero nel rinnovo → 201" |
| R5 | Nella modale di R1 il campo **Numero di tessera** è obbligatorio e parte **vuoto**, anche su un socio che ha già un numero. Finché il numero manca il pulsante Conferma è **disabilitato e si vede che lo è** (opaco, cursore di divieto), e la nota sotto il campo dice "Obbligatorio per confermare." | manuale: Rinnova su un socio con numero → campo vuoto, Conferma opaco e non cliccabile, nota "Obbligatorio per confermare."; digitando il numero Conferma si attiva e la nota torna quella normale |
| R6 | L'admin può correggere o aggiungere il numero di tessera **solo del tesseramento in corso**, dalla modale **Storico**: `PATCH /api/tesseramenti/rinnovi/:id` con `{ numero_tessera }`, stesse regole di R2–R4. Su un tesseramento che non è quello in corso → 409; id inesistente → 404; non admin → 403 | `tesseramenti-numero.test.ts` › "correzione del numero del tesseramento in corso → 200", "correzione di un tesseramento superato da un rinnovo → 409", "correzione di un tesseramento scaduto → 409", "id inesistente → 404", "socio che corregge → 403", "correzione con numero di un altro socio → 409"; manuale: in Storico il pulsante di correzione c'è solo sulla riga in corso |
| R7 | Il **numero di tessera corrente** di un socio è quello del suo tesseramento più recente (per scadenza); se quello non ne ha uno, o il socio non è mai stato tesserato → `null` | `tesseramenti-numero.test.ts` › "il numero corrente è quello dell'ultimo rinnovo", "socio mai tesserato → null" |
| R8 | `GET /api/soci` (admin) restituisce per ogni socio `numero_tessera` (R7); la pagina Soci lo mostra in una colonna **N° tessera**, ordinabile, solo all'admin. La ricerca `q` trova un socio anche per numero di tessera | `tesseramenti-numero.test.ts` › "elenco soci con numero_tessera", "ricerca per numero di tessera"; `elenchi-paginati.test.ts` › "ordinamento per numero_tessera"; manuale: colonna in Soci da admin, assente da istruttore |
| R9 | `GET /api/tesseramenti/:socioId` (storico, admin o il socio stesso) restituisce `numero_tessera` su ogni riga; la modale Storico e la vista del socio in Tesseramenti mostrano la colonna **Tessera** | `tesseramenti-numero.test.ts` › "lo storico riporta numero_tessera", "il socio legge il proprio numero nello storico"; manuale: colonna Tessera in Storico (admin) e in Il mio tesseramento (socio) |
| R10 | Pagina Voucher, vista del socio: card **La tua tessera** con il numero corrente (R7) e lo **stato** come lo vede l'admin in Tesseramenti — stessa etichetta e stessi colori: Attivo, In scadenza, Scaduto, Mai tesserato — e, se ci sono, la scadenza e la data dell'ultimo rinnovo. Solo i dati di chi guarda. Compare anche se il socio non ha un voucher, e anche se non è mai stato tesserato (stato "Mai tesserato", senza numero né date) | manuale: socio attivo, in scadenza, scaduto e mai tesserato del seed; socio senza voucher (`sara.vitali@clubby.dev`) |
| R11 | Disposizione: sopra `MOBILE_BREAKPOINT` la pagina si divide in **due colonne di uguale larghezza**, Il tuo voucher a sinistra e La tua tessera a destra; sotto, le due card vanno su **due righe**, La tua tessera sopra | manuale: finestra larga (le due card hanno la stessa larghezza) e preset mobile del browser |
| R12 | Ogni riga dello storico (`GET /api/tesseramenti/:socioId`) riporta `stato`, calcolato dal database con la stessa regola e lo stesso preavviso della pagina Tesseramenti; lo stato del socio è quello della prima riga, "mai" se lo storico è vuoto | `tesseramenti-numero.test.ts` › "stato attivo, in_scadenza e scaduto nello storico", "lo stato della prima riga coincide con quello in GET /api/tesseramenti" |
| R13 | `backend/k8s/deployment.yaml`, `frontend/k8s/deployment.yaml` e `k8s/templates/migrazioni/job.yaml` dichiarano `resources.requests` e `resources.limits` di CPU e memoria, con i valori della sezione [Risorse](#risorse) | revisione dei tre manifest; `kubectl apply --dry-run=server` sul cluster; dopo il deploy `kubectl describe pod` mostra requests e limits |
| R14 | `authorizer/k8s/deployment.yaml` **non cambia**: ha già le sue risorse | revisione: il diff non tocca il file |

Ruoli: R1–R6, R8 admin (pagine Tesseramenti e Soci); R9 e R12 admin e socio;
R10–R11 il socio, nella pagina Voucher; R13–R14 nessuno, sono manifest.

## Modello dati

Migrazione `backend/src/db/migrations/004_numero_tessera.sql`, solo aggiunte:

```sql
ALTER TABLE tesseramento ADD COLUMN IF NOT EXISTS numero_tessera VARCHAR(30);
-- R4 (un numero, un socio) e la ricerca per numero di R8.
CREATE INDEX IF NOT EXISTS idx_tesseramento_numero ON tesseramento(numero_tessera);
```

- **Nullable** nel database: i tesseramenti già registrati non hanno un numero,
  e una colonna `NOT NULL` richiederebbe di inventarlo. L'obbligo di R2 lo
  applica il backend sui tesseramenti nuovi.
- R4 è un controllo del service dentro la transazione del rinnovo, non un
  vincolo: un indice unico impedirebbe proprio il caso normale, lo stesso
  numero sullo stesso socio in anni diversi.

## API

| Endpoint | Variazione |
|---|---|
| `POST /api/tesseramenti` | corpo con `numero_tessera` obbligatorio (R2–R4); risposta con `numero_tessera` |
| `PATCH /api/tesseramenti/rinnovi/:id` | **nuovo**, admin. Corpo `{ numero_tessera }`, risposta il tesseramento aggiornato. 409 se non è il tesseramento in corso del suo socio, 404 se l'id non esiste (R6) |
| `GET /api/tesseramenti/:socioId` | `numero_tessera` e `stato` su ogni riga (R9, R12). Solo campi in più: la risposta resta un array |
| `GET /api/tesseramenti` | `numero_tessera` corrente per socio, nella situazione (serve a R5) |
| `GET /api/soci` | `numero_tessera` corrente, sort `numero_tessera`, ricerca anche sul numero (R8) |

A modulo tesseramento spento: le route `/api/tesseramenti*` rispondono già 404
(`server.ts`); `GET /api/soci` **non** include il campo `numero_tessera`, come
lo storico non include i campi della ricevuta a modulo ricevute spento.

Il percorso `rinnovi/:id` e non `/:id`: `/api/tesseramenti/:id` è già lo storico
di un **socio**, e lo stesso segmento con due significati secondo il metodo è un
errore che aspetta di succedere.

Si aggiornano `backend/docs/openapi.yaml` e `bruno/` (cartella tesseramenti,
con la nuova richiesta PATCH).

## Interfaccia

- **Tesseramenti (admin)**: R1, R5; nella modale Storico la colonna Tessera
  e il pulsante per correggere il numero **solo sulla riga del tesseramento in
  corso** (R6); le altre righe sono in sola lettura.
- **Tesseramenti (socio)**: colonna Tessera nello storico in sola lettura (R9).
- **Soci (admin)**: colonna N° tessera dopo Nome; "—" se il socio non ha un
  numero. Su schermo stretto vale lo scorrimento orizzontale di `TableScroll`,
  come per le altre colonne.
- **Voucher (socio)**: card **La tua tessera** (R10) accanto a Il tuo voucher,
  a destra, in due colonne uguali sopra `MOBILE_BREAKPOINT`; sotto, su due righe con la tessera sopra
  (R11). I dati arrivano da `GET /api/tesseramenti/:socioId`, già permesso al
  socio: nessun endpoint nuovo. Lo stato si mostra con la stessa `Etichetta` e
  la stessa tabella `STATI` (etichetta e colori) della pagina Tesseramenti, che
  esce da `TesseramentiPage.tsx` in un modulo condiviso: una seconda copia
  sarebbe un difetto (AGENTS.md, convenzioni sugli stili). La card compare
  a chiunque veda la card Il tuo voucher con una scheda socio collegata, **admin
  compresi**: un admin socio è un socio, e il suo voucher è già in quella card.
- **Manuale** (`frontend/src/manuale/sezioni.tsx`): pulsante Tessera, numero
  obbligatorio, correzione dallo Storico, colonna in Soci, card La tua tessera nel Voucher.

## Risorse

Valori di partenza, pensati per una VPS singola condivisa con PostgreSQL;
l'authorizer (già presente) è riportato per confronto.

| Workload | CPU req | Mem req | CPU limit | Mem limit | Motivo |
|---|---|---|---|---|---|
| backend | 50m | 128Mi | 500m | 384Mi | Node + generazione PDF delle ricevute, il picco di memoria è lì |
| frontend | 10m | 16Mi | 100m | 64Mi | nginx che serve file statici |
| migrazioni (Job) | 10m | 32Mi | 200m | 128Mi | `sh` + `psql`, vive pochi secondi |
| authorizer | 50m | 96Mi | 500m | 256Mi | invariato |

Il limit di memoria del backend è il valore da guardare dopo il deploy: un
`OOMKilled` durante l'emissione di molte ricevute insieme vuol dire che è basso.

## Decisioni

| Tema | Scelta | Motivo |
|---|---|---|
| Dove sta il numero | Colonna di `tesseramento`, non di `socio` | Il numero è della tessera, e la tessera è dell'anno: un rinnovo può portare un numero nuovo, e lo storico deve dire quale numero aveva il socio in quell'anno |
| Tipo | Testo, max 30 caratteri | I numeri degli enti hanno prefissi, lettere, zeri iniziali: un intero li perderebbe |
| Obbligatorietà | Obbligatorio sui tesseramenti nuovi, nullable sui vecchi | È lo scopo della feature; i vecchi non hanno un numero da mettere, e R6 permette di aggiungerlo a quello in corso |
| Unicità | Un numero, un solo socio; riusabile dallo stesso socio | Due soci con la stessa tessera sono un errore di battitura; lo stesso socio che tiene la tessera da un anno all'altro è il caso normale |
| Numero corrente | Del tesseramento più recente, anche se senza numero | Con R6 limitato al tesseramento in corso, l'ultimo è l'unico in cui il numero si può mettere: risalire a un rinnovo precedente mostrerebbe un numero che l'admin non può più correggere |
| Correzione del numero | Solo sul tesseramento in corso | I tesseramenti chiusi sono storia: la tessera di un anno passato non si corregge a posteriori. Un socio scaduto prende un numero nuovo rinnovando |
| Stato nella card del socio | Calcolato dal database nello storico, riga per riga | Una regola sola e un preavviso solo (`GIORNI_PREAVVISO`): ricalcolarlo nel browser darebbe al socio uno stato diverso da quello che vede l'admin il giorno in cui le due regole divergono |
| Soglia della disposizione su una riga | `MOBILE_BREAKPOINT` (640px) | È l'unica soglia del frontend, condivisa da CSS e JavaScript (`hooks/useIsMobile.ts`); il "md" della richiesta è reso con questa |
| Numero nella modale del rinnovo | Vuoto, non proposto dal tesseramento precedente | A ogni rinnovo il socio riceve una tessera nuova con un numero nuovo: proporre il vecchio invita a confermarlo senza guardare. Deciso dall'utente durante il test |
| Campo obbligatorio vuoto | Conferma disabilitato finché il numero manca, con stile visibile e nota sotto il campo | Scelta dell'utente durante il test. Il primo riscontro mancato non era il pulsante spento in sé, ma che `ui.btn` non ha uno stile per lo stato disabilitato e lo mostrava uguale a uno attivo: aggiunto `btnDisabilitato` a `styles/ui.ts` |
| Larghezza delle due card nel Voucher | Due colonne uguali | Richiesto dall'utente durante il test; la prima versione aveva la tessera stretta (280px) a destra |
| Primo tesseramento | Stesso flusso del rinnovo, cambia solo l'etichetta | Il backend fa già la cosa giusta: il problema era trovarlo, non farlo |
| Dati del socio nel Voucher | Dallo storico esistente | Il socio ha già il permesso di leggerlo; un endpoint in più duplicherebbe il controllo "sei quel socio" |
| Metodo della correzione | `PATCH` | È una modifica parziale (un campo solo), non la sostituzione del tesseramento: `PUT` sostituisce l'intera risorsa. È l'unico `PATCH` del progetto — gli altri endpoint di modifica usano `PUT` anche per corpi parziali — e per questo `PATCH` è stato aggiunto ai metodi ammessi dal CORS del backend. Deciso dall'utente durante il test, dopo un passaggio a `PUT` in implementazione |
| Card La tua tessera per l'admin socio | Sì, come la card Il tuo voucher | La spec diceva il contrario sulla base di un'ipotesi sbagliata: la pagina Voucher mostra già il proprio voucher all'admin con scheda socio. Corretto in implementazione |
| Versione dell'authorizer | Non si alza | Il suo manifest ha già le risorse e non cambia (regola 5) |

## Alternative scartate

| Alternativa | Perché no |
|---|---|
| Numero di tessera nella tabella `socio` | Si perderebbe il numero degli anni precedenti al primo cambio di tessera: lo storico mostrerebbe a ogni rinnovo il numero di oggi |
| Indice unico su `numero_tessera` | Vieterebbe lo stesso numero allo stesso socio in due rinnovi, che è il caso più comune |
| `numero_tessera` facoltativo anche sui tesseramenti nuovi | La colonna resterebbe vuota proprio quando l'admin ha la tessera in mano: obbligatorio è l'unico modo che il dato ci sia |
| Endpoint dedicato per il numero del socio (es. in `/api/auth/socio`) | Duplica un'informazione già leggibile dal socio nello storico, e lega `/api/auth/socio` al modulo tesseramento |
| Correzione del numero su qualunque tesseramento dello storico | Scartata dall'utente: si corregge solo il tesseramento in corso (R6) |
| Stato calcolato nel browser dalla scadenza | Duplica la regola e il preavviso del backend (vedi Decisioni) |
| Numero di tessera proposto dal tesseramento precedente | Era nella prima versione di R5; scartato dall'utente durante il test: il numero cambia a ogni rinnovo |
| Conferma sempre attivo, con campo evidenziato in rosso e messaggio al click | Seconda versione di R5, provata durante il test e scartata dall'utente: preferisce che non si possa proprio confermare senza numero |
| Card La tua tessera stretta, a larghezza fissa | Prima versione di R11; scartata dall'utente durante il test a favore di due colonne uguali |
| Seconda soglia "md" a 768px per la sola card | Il frontend ha una soglia sola, `MOBILE_BREAKPOINT`, tenuta unica di proposito: due soglie fanno cambiare disposizione a pezzi diversi della stessa pagina a larghezze diverse |
| `PUT /api/tesseramenti/rinnovi/:id`, per coerenza con gli altri endpoint di modifica | Provato in implementazione e scartato dall'utente: `PUT` vuol dire sostituire la risorsa, e qui se ne cambia un campo. La coerenza giusta è riportare gli altri endpoint a `PATCH`, in una spec a sé perché cambia il metodo a client esistenti |
| Pulsante "Nuovo tesseramento" separato in cima alla pagina, con scelta del socio | Ogni socio è già una riga della tabella, anche chi non è mai stato tesserato: un secondo punto d'ingresso farebbe la stessa cosa da due posti |

## Domande chiuse

Chiuse all'approvazione ("confermo così com'è la spec"), con le scelte proposte:

1. **Primo tesseramento**: basta l'etichetta Tessera in Tesseramenti (R1); nessuna
   azione dalla pagina Soci.
2. **Unicità (R4)**: un numero appartiene a un solo socio, per sempre.
3. **Risorse (R13)**: i valori della sezione [Risorse](#risorse).

## Rischi e impatti

- **Client di `POST /api/tesseramenti`**: il campo diventa obbligatorio. I
  client sono il frontend (aggiornato nella stessa release), la suite
  (`documenti-tesseramenti.test.ts` e gli helper che creano tesseramenti) e
  `bruno/`: vanno aggiornati tutti. Il seed scrive in SQL e non è toccato
  dall'obbligo, ma riceverà comunque dei numeri di esempio per mostrare R8 e R10
  (`scripts/seed/lib-dominio.sh`, `05-tesseramenti.sh`, `scripts/seed/README.md`).
- **`GET /api/soci`** guadagna una giuntura laterale sui tesseramenti: va
  aggiunta solo a modulo attivo, e la ricerca per numero va scritta in modo che
  il conteggio totale resti calcolato dal database sull'intero filtro.
- **Limits troppo bassi**: un backend `OOMKilled` riparte e interrompe le
  richieste in corso. Mitigazione: valori larghi rispetto all'uso a riposo, e
  il controllo di `kubectl top pod` dopo il primo deploy
  (`docs/developer/operazioni-cluster.md`).
- **Requests**: sommate a quelle esistenti devono stare nella CPU/memoria
  allocabile del nodo, o i pod restano `Pending`. Totale richiesto con questa
  spec (backend, frontend, authorizer, PostgreSQL): 210m CPU e 368Mi di
  memoria, più OpenWA dove attivo e il Job delle migrazioni finché gira.
- **Documentazione**: `docs/readme/voucher-tesseramento-ricevute.md`,
  `docs/readme/funzionalita.md`, `docs/readme/api.md`,
  `docs/readme/manifest-k8s.md`, il manuale d'uso, la tabella endpoint di
  `AGENTS.md`.

## Test dell'utente

L'utente ha provato la feature sui dati locali del seed, dalla pagina
Tesseramenti (admin) e dalla pagina Voucher (socio). Corretto durante il test,
senza aprire una spec nuova:

- **Metodo della correzione**: in implementazione era stato portato a `PUT`;
  l'utente ha chiesto `PATCH` (modifica parziale). Riportato a `PATCH`, con
  `PATCH` aggiunto ai metodi del CORS del backend. Da qui è nata la spec 008.
- **R5, numero nella modale**: non più proposto dal tesseramento precedente,
  perché la tessera cambia a ogni rinnovo; il campo parte vuoto.
- **R5, obbligatorietà**: con il pulsante Conferma disabilitato l'utente non aveva
  riscontro, perché `ui.btn` non mostrava lo stato disabilitato. Provata una
  versione con il pulsante sempre attivo e l'errore al click, scartata
  dall'utente; resta il pulsante disabilitato, reso visibile con
  `btnDisabilitato` e accompagnato dalla nota "Obbligatorio per confermare.".
- **R11, card nel Voucher**: da tessera stretta a destra a due colonne di uguale
  larghezza sopra `MOBILE_BREAKPOINT`.

Accettato così com'è: tutto il resto (R1–R4, R6–R10, R12–R14).

Notato e lasciato fuori: gli altri pulsanti disabilitati del frontend appaiono
ancora attivi, per la stessa mancanza di stile; è un fix a parte.

## Verifica

| Requisiti | Come |
|---|---|
| R2–R4, R6–R9, R12 | `tests/api/tesseramenti-numero.test.ts` (tutti i casi elencati nella colonna Test) e `elenchi-paginati.test.ts` › "ordinamento per numero_tessera"; suite completa `npm run test:api`: 162/162, con il backend avviato da `npm run dev:backend:test` |
| R6 (metodo) | dopo il passaggio a `PATCH`: suite di nuovo 162/162; il preflight `OPTIONS` con `Access-Control-Request-Method: PATCH` risponde 204 con `PATCH` fra i metodi ammessi |
| R1, R5, R6 (interfaccia), R8, R9 | anteprima nel browser come admin: pulsante Tessera sui mai tesserati e titolo "Nuovo tesseramento"; Conferma disabilitato e opaco con il numero vuoto, attivo dopo averlo scritto; Aggiungi/Correggi solo sulla riga in corso dello Storico, assente su un socio scaduto; colonna N° tessera e ricerca per numero in Soci |
| R10, R11 | anteprima come socio (Costa): card La tua tessera con stato, numero, scadenza e ultimo rinnovo; a 1024px due colonne da 472px; al preset mobile due righe con la tessera sopra |
| Modello dati | migrazione 004 applicata al database locale e, da zero, su un PostgreSQL 18 vuoto dopo `schema.sql` e le migrazioni 001–003: colonna `numero_tessera` `character varying(30)` |
| R13, R14 | revisione dei manifest: requests e limits su backend, frontend e Job delle migrazioni con i valori di [Risorse](#risorse); `authorizer/k8s/deployment.yaml` invariato. Non provato su cluster: si vedrà al primo deploy (`kubectl describe pod`, `kubectl top pod`) |
| Build e lint | `npm run build --prefix backend`, `npm run build --prefix frontend`, `npx eslint src` del frontend: 0 errori |
| Non verificato | `npx @redocly/cli lint` su `openapi.yaml` (avrebbe scaricato un pacchetto); il seed aggiornato non è stato eseguito per non azzerare i database locali (sintassi controllata con `bash -n`) |
