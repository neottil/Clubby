# 013 — Importo libero fra i tagli di ricarica, ricevute che non nascono da voci

## Stato

- [x] Draft
- [x] Approvata (Luca, 2026-11-15)
- [x] In test (utente)
- [ ] Completata

**Versioni**: `backend 3.1.0`, `frontend 2.14.0`. L'authorizer non si tocca.

## Domande chiuse

Poste con il Draft, risposte da Luca il 2026-11-15. Il resto della spec è scritto
su queste risposte.

| # | Domanda | Risposta |
|---|---|---|
| D1 | Una ricarica a importo libero, in modalità `map`, accredita quanto pagato (1:1) o l'admin scrive anche quanto accreditare? | **L'admin indica quanto accreditare.** Con "Altro importo…" si scrivono sia l'importo pagato sia il valore che va sul voucher |
| D2 | Una ricevuta libera si intesta solo a un nominativo scritto a mano, o anche a un socio che poi la vede nella propria area? | **Solo a un intestatario scritto a mano**, che non va registrato come socio. La emette solo l'admin e la riapre solo l'admin. Le righe non vengono dal database: esistono solo dentro quella ricevuta. Il caso tipico è una gara aperta ad altri club, con la ricevuta d'iscrizione intestata a un tesserato di un altro club |
| D3 | Quali dati dell'intestatario? | **Un campo unico, "Intestatario"**, testo libero: vale per una persona come per un ente o un club |

## Problema

**Ricarica a tagli.** In modalità `RECHARGE_MODE=map` una ricarica si registra
solo scegliendo uno dei tagli configurati: un importo che non corrisponde a
nessun taglio viene rifiutato dal backend, e il form non offre nemmeno un campo
dove scriverlo. Ma al banco capita di incassare cifre fuori listino — un
conguaglio per riportare in positivo un voucher, un taglio dismesso, un accordo
particolare — e oggi l'admin non ha modo di registrarle se non creando un taglio
apposta e cancellandolo subito dopo. Senza tagli configurati, poi, le ricariche
sono del tutto bloccate.

**Ricevute.** Una ricevuta nasce soltanto dalle voci di **un socio**: ricariche,
quote di tesseramento, incontri pagati a parte. Il club però incassa anche da chi
socio non è — l'iscrizione a un evento, a uno stage, a una gara organizzata — e a
queste persone deve consegnare una ricevuta. Oggi l'unica via è registrarle come
soci, con tutto ciò che ne segue (compaiono fra i soci, possono essere tesserate,
entrano negli elenchi), oppure scrivere la ricevuta fuori da Clubby, con un numero
che la numerazione dell'applicazione non conosce e che finirà doppio.

## Obiettivo

1. In modalità `map` l'admin sceglie un taglio **oppure**, come ultima voce
   dell'elenco, "Altro importo…": scrive quanto il socio paga e quanto
   accreditare sul voucher.
2. L'admin emette dalla pagina Ricevute una **ricevuta libera**: intestatario
   scritto a mano, causale, una o più righe con data, descrizione e importo. Ha lo
   stesso aspetto, la stessa numerazione e le stesse garanzie di una ricevuta di
   un socio — anteprima, conferma, PDF conservato, nessun annullamento.

## Fuori perimetro

- **Modalità `free` e `percentage`**: hanno già l'importo libero.
- **Un interruttore per tenere i tagli vincolanti.** La richiesta è che la scelta
  libera ci sia *sempre*; vedi Alternative scartate.
- **Ricevute miste**, con voci di un socio e righe libere nello stesso documento.
  Il caso (un socio che paga anche l'iscrizione a un evento) si copre con due
  ricevute, o con una ricevuta libera intestata al suo nome.
- **Ricevute libere visibili a un socio** (D2): le vede e le riapre solo l'admin.
- **Campi anagrafici strutturati** dell'intestatario (codice fiscale, indirizzo):
  l'intestatario è un testo libero (D3), e ciò che serve si scrive lì.
- **Rubrica dei non soci.** Ogni ricevuta libera si compila da zero: nessuna
  anagrafica dei paganti esterni, nessun suggerimento dai nomi già usati. Se
  servirà, sarà la spec di un'anagrafica, non un effetto collaterale di questa.
- **Eventi come entità** (iscritti, quote, incassi per evento). Qui si emette un
  documento, non si gestisce un evento.
- **Righe a importo negativo** (sconti, abbuoni): una ricevuta attesta un
  incasso, e lo sconto si esprime scrivendo la riga per quanto è stato pagato.
- **Annullamento** di una ricevuta libera: come tutte le altre, non si annulla
  (spec 003).

## Requisiti

### Ricarica libera in modalità `map`

| # | Requisito | Test |
|---|---|---|
| R1 | In modalità `map` la select della ricarica elenca i tagli e, **per ultima**, la voce "Altro importo…", che mostra due campi: **Importo pagato** e **Valore accreditato** | verifica manuale (interfaccia, la suite non ha test del frontend) con `RECHARGE_MODE=map` e due tagli configurati: Voucher → Ricarica, la select termina con "Altro importo…" e sceglierla fa comparire i due campi |
| R2 | Con "Altro importo…" il movimento si registra con l'importo pagato e il valore indicati: il voucher sale del valore, in Ricevute compare il pagato | `ricariche-map.test.ts` › "importo e valore: il saldo sale del valore, la voce in Ricevute vale il pagato" (pagato 40, valore 45: movimento con `importo` 45 e `importo_pagato` 40; in `GET /api/documenti/voci` la voce vale 40) |
| R3 | Il valore accreditato si **precompila con l'importo pagato** mentre lo si scrive, finché l'admin non lo modifica | verifica manuale (interfaccia) con `RECHARGE_MODE=map`: scrivendo 40 nel pagato il valore diventa 40; cambiato il valore in 45, una nuova modifica del pagato non lo sovrascrive |
| R4 | Il valore indicato vale **anche se il pagato coincide con un taglio**: è una scelta esplicita dell'admin | `ricariche-map.test.ts` › "con un valore esplicito il taglio non si applica" (taglio di prova 73,21 → 80; pagato 73,21 e valore 73,21, movimento da 73,21 con `importo_pagato` NULL) |
| R5 | Il valore accreditato dev'essere positivo, al centesimo, e **non inferiore** all'importo pagato; altrimenti 400 con il motivo | `ricariche-map.test.ts` › "rifiuta un valore inferiore al pagato o non positivo (400)" (pagato 40 con valore 30, 0 e -5) |
| R6 | In modalità `map`, un importo che non coincide con alcun taglio e arriva **senza valore** è rifiutato con 400, come oggi | `ricariche-map.test.ts` › "fuori taglio senza valore: 400" |
| R7 | In modalità `map` **senza tagli** configurati la ricarica si registra con "Altro importo…", senza errore | `ricariche-map.test.ts` › "con un valore esplicito la ricarica passa a prescindere dai tagli" (lato API: il valore esplicito non legge i tagli, quindi vale anche a tabella vuota, che la suite non può imporre su un database condiviso); verifica manuale (interfaccia) con nessun taglio: il form mostra direttamente i due campi |
| R7-bis | In modalità `map` un importo che coincide con un taglio, **senza** valore, prende ancora il valore del taglio | `ricariche-map.test.ts` › "senza valore il taglio si applica come prima" (taglio di prova 73,21 → 80: movimento da 80 con `importo_pagato` 73,21) |
| R8 | In modalità `free` e `percentage` un `valore` nel corpo è rifiutato con 400: lì il valore lo decide sempre la configurazione | `ricariche.test.ts` › "in modalità free un valore esplicito è rifiutato (400)" |
| R9 | L'importo pagato resta soggetto alle regole di ogni ricarica: positivo, al centesimo | `documenti-tesseramenti.test.ts` › "una ricarica deve avere un importo positivo (400)" (il controllo precede la modalità; la suite gira in `free`) |
| R10 | Modalità `free` e `percentage` invariate per chi non manda `valore` | suite esistente verde, in particolare `ricariche.test.ts` e `documenti-tesseramenti.test.ts` |

Coinvolti: solo l'**admin**, nella pagina Voucher (pannello Ricarica) e nel
manuale d'uso.

### Ricevute libere

| # | Requisito | Test |
|---|---|---|
| R11 | L'admin ottiene l'**anteprima** di una ricevuta libera da intestatario, causale e righe; l'anteprima **non scrive niente** | `documenti-libere.test.ts` › "l'anteprima di una ricevuta libera non crea documenti" |
| R12 | La **conferma** emette la ricevuta libera, ne conserva i byte e le righe, e la restituisce come ogni altra (`id`, `anno`, `numero`, `nome_file`, `pdf_base64`) | `documenti-libere.test.ts` › "la conferma emette una ricevuta libera con il PDF" |
| R13 | Le ricevute libere prendono il numero **dalla stessa numerazione per anno** delle ricevute dei soci, senza buchi né duplicati | `documenti-libere.test.ts` › "una ricevuta libera e una di socio emesse di seguito hanno numeri consecutivi" |
| R14 | L'importo della ricevuta è la **somma delle righe**, ricalcolata dal backend; un totale mandato dal client è ignorato | `documenti-libere.test.ts` › "il totale è la somma delle righe, non quello inviato" |
| R15 | Intestatario e causale sono obbligatori (testo non vuoto); servono da 1 a 50 righe, ciascuna con descrizione non vuota, importo positivo al centesimo e data valida non futura; altrimenti **400** con il motivo | `documenti-libere.test.ts` › "rifiuta intestatario, causale o righe non valide" (un caso per ogni campo) |
| R16 | Il corpo è **o** di un socio (`socio_id` + `voci`) **o** libero (`intestatario` + `righe`): mescolarli, o non mandare né l'uno né l'altro, è un **400** | `documenti-libere.test.ts` › "rifiuta un corpo con voci e righe insieme" |
| R17 | Nel PDF la ricevuta libera ha la stessa forma di quella di un socio: **intestazione, logo e piè di pagina** configurati per le ricevute (Impostazioni, card Ricevute), "Ricevuto da: <intestatario>", importo in cifre e in lettere, causale, e nel **Dettaglio** una riga per ciascuna riga libera con data, descrizione e importo | `documenti-libere.test.ts` › "il PDF ha intestazione, piè di pagina, intestatario e righe" (impostati intestazione e piè di pagina di prova, il testo estratto dal PDF dell'anteprima li contiene insieme a intestatario, causale e descrizione di ogni riga; impostazioni rimesse com'erano alla fine); verifica manuale per l'impaginazione: anteprima a tre righe confrontata a occhio con una ricevuta di socio |
| R17-bis | Come per le altre ricevute, **senza intestazione configurata** la ricevuta libera non si emette: il pulsante **Ricevuta libera** sta nella pagina Ricevute, che in quel caso è spenta | verifica manuale (interfaccia: il blocco sta nel menù, come per le ricevute dei soci, spec 003 R19): con l'intestazione vuota la voce di menù Ricevute è spenta e la ricevuta libera non è raggiungibile |
| R18 | Emettere una ricevuta libera è **solo dell'admin**: istruttore e socio ricevono 403 su anteprima ed emissione | `documenti-libere.test.ts` › "istruttore e socio non emettono ricevute libere" |
| R19 | Una ricevuta libera la **riapre solo l'admin**: nessun socio la può scaricare, nemmeno uno con lo stesso nome dell'intestatario | `documenti-libere.test.ts` › "una ricevuta libera la scarica solo l'admin" |
| R20 | L'elenco delle ricevute emesse comprende le libere, con l'intestatario, e le distingue da quelle dei soci (`socio_id` null); filtrando per socio non compaiono | `documenti-libere.test.ts` › "l'elenco comprende le ricevute libere e il filtro per socio le esclude" |
| R21 | Il filtro per periodo vale anche per le libere | `documenti-libere.test.ts` › "il filtro per periodo comprende le ricevute libere" |
| R22 | A modulo Ricevute spento anteprima ed emissione libere rispondono **404** come le altre rotte | `moduli-spenti.test.ts` › "a modulo Ricevute spento le rotte dei documenti rispondono 404", sull'istanza con i moduli spenti: anteprima ed emissione con corpo libero, e con l'occasione le altre rotte di `/api/documenti` (spec 003 R13, finora verificata a mano) |
| R23 | In Ricevute, scheda **Crea ricevuta**, il pulsante **Ricevuta libera** apre un form con intestatario, causale e le righe (data, descrizione, importo), che si aggiungono e si tolgono; il totale si aggiorna mentre si scrive | verifica manuale (interfaccia): form con tre righe, una tolta, totale ricalcolato |
| R24 | Dal form si passa all'anteprima e alla conferma con lo stesso modale delle ricevute dei soci | verifica manuale (interfaccia): anteprima, poi conferma, il PDF si scarica e la ricevuta compare in **Ricevute emesse** |
| R25 | Il pulsante **Ricevuta libera** è attivo indipendentemente dal socio scelto nei filtri e dalle voci selezionate | verifica manuale (interfaccia): con un socio filtrato e voci spuntate il pulsante resta attivo e la selezione non si perde |
| R26 | Le righe di una ricevuta libera emessa sono conservate nell'ordine inviato, con data, descrizione e importo | `documenti-libere.test.ts` › "le righe sono conservate nell'ordine inviato" (emessa una ricevuta a tre righe, il PDF riscaricato da `GET /api/documenti/:id` riporta le tre descrizioni in quell'ordine; dalle API, senza leggere il database) |
| R27 | Una riga senza data prende la data del documento (oggi); una data futura è rifiutata con 400 | `documenti-libere.test.ts` › "una riga senza data vale oggi, una data futura è rifiutata" |

Coinvolti: l'**admin** nella pagina Ricevute (entrambe le schede) e nel manuale
d'uso. Socio e istruttore non vedono niente di nuovo.

## Test automatici

Richiesta di Luca (2026-11-15): coprire con la suite delle API tutto ciò che
non è interfaccia. Restano manuali solo R1, R3, R7 (parte interfaccia),
R17-bis, R23, R24 e R25, perché il progetto non ha test del frontend, e
l'impaginazione del PDF in R17.

**Due istanze del backend.** Oggi la suite parla con un solo backend, avviato con
`RECHARGE_MODE=free` e i moduli accesi. La modalità a tagli e i moduli spenti si
leggono dall'ambiente all'avvio, quindi non si provano su quell'istanza. Se ne
aggiunge una seconda, **sullo stesso database**:

| Istanza | Porta | Ambiente | Usata da |
|---|---|---|---|
| principale | 3000 | `backend/.env.test`, invariato | tutta la suite di oggi, `documenti-libere.test.ts` |
| varianti | 3002 | `backend/.env.test-varianti` (nuovo): `RECHARGE_MODE=map`, `ENABLE_MODULE_RICEVUTE=false`, `ENABLE_MODULE_TESSERAMENTO=false`, `PORT=3002` | `ricariche-map.test.ts`, `moduli-spenti.test.ts` |

- **In locale** `npm run dev:backend:test` avvia **entrambe** con `concurrently`,
  già fra le dipendenze della radice: il comando per preparare la suite resta
  uno solo. Anche la seconda gira senza `--watch`, per lo stesso motivo della
  prima.
- **In CI**, nel job `test` di `build-deploy.yml`, un secondo container dalla
  **stessa immagine** del backend, con lo stesso `--env-file` e le tre variabili
  sovrascritte con `-e`; l'attesa su `/health` comprende anche la porta 3002.
- **Nei test** `helpers.ts` espone `API_URL_VARIANTI` (default
  `http://localhost:3002`) accanto a `API_URL`. Se l'istanza non risponde i test
  falliscono con "avvia i servizi con npm run dev:backend:test", come oggi: un
  test saltato in silenzio lascerebbe verde una suite che non ha provato niente.
- **I dati di prova** si creano dall'istanza principale, come sempre (in `map`
  la creazione delle ricariche dei dati comuni sarebbe rifiutata), e si usano
  dall'altra: stesso database, stessi token. I tagli di prova hanno importi
  improbabili (73,21) per non scontrarsi con quelli dell'utente, e si eliminano
  alla fine anche se un test fallisce.

**Il testo del PDF.** R17 e R26 leggono il testo dentro il PDF: un piccolo helper
in `tests/api/pdf.ts`, senza dipendenze nuove, decomprime gli stream con `zlib`
di Node e ricompone le stringhe dei comandi di testo. È stato provato sui PDF di
`pdfkit` prima di scriverlo qui. Verifica che i testi *ci siano*, non dove
stanno: l'impaginazione resta un controllo a occhio.

## Modello dati

Migrazione `005_ricevute_libere.sql`.

```sql
-- Una ricevuta libera non ha un socio: la colonna diventa facoltativa.
-- Rilassare un vincolo è compatibile con la release precedente, che scrive
-- sempre socio_id e legge i documenti con una JOIN su socio: le libere, per
-- lei, semplicemente non esistono (vedi Rischi).
ALTER TABLE documento ALTER COLUMN socio_id DROP NOT NULL;

-- Le righe di una ricevuta libera: una quarta fonte di voci, accanto a
-- movimenti, tesseramenti e incontri. Il legame con la ricevuta passa da
-- documento_emesso_voce, con tipo 'libera', come per le altre tre.
CREATE TABLE IF NOT EXISTS ricevuta_voce_libera (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  posizione    INTEGER NOT NULL CHECK (posizione > 0),
  data         DATE NOT NULL,
  descrizione  TEXT NOT NULL,
  importo      NUMERIC(10,2) NOT NULL CHECK (importo > 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Il quarto tipo. Il vincolo della 002 è anonimo: si cerca per definizione e
-- si sostituisce con uno con nome, che accetta anche 'libera'. Allargare un
-- CHECK è compatibile con la release precedente, che 'libera' non lo scrive.
-- (blocco DO con la guardia, vedi la migrazione)
ALTER TABLE documento_emesso_voce
  ADD CONSTRAINT ck_documento_emesso_voce_tipo
  CHECK (tipo IN ('ricarica', 'tesseramento', 'incontro', 'libera'));
```

- **Nessuna colonna `tipo`** su `documento`: una ricevuta è libera esattamente
  quando `socio_id` è NULL. Un secondo campo che dica la stessa cosa potrebbe
  contraddirlo.
- **`intestatario`** resta la colonna di sempre. Per i soci il backend la
  compone da nome e cognome; per le libere è il testo scritto dall'admin, senza
  spazi in testa e in coda (D3).
- **Le righe si conservano** anche se il PDF le contiene già: senza, una ricevuta
  libera sarebbe l'unico documento il cui contenuto si ricostruisce solo
  rileggendo il PDF. Costano poco, e permettono un domani di sommarle o
  cercarle.
- **Un solo percorso per ogni ricevuta**: documento → `documento_emesso_voce` →
  origine, qualunque sia il tipo. `ricevuta_voce_libera` non ha `documento_id`:
  sarebbe la stessa informazione in due posti.
- **Nessuna foreign key verso la ricevuta**, come per le altre tre fonti:
  `riferimento_id` è polimorfico. Che ogni riga libera abbia la sua riga in
  `documento_emesso_voce` lo garantisce l'emissione, che le scrive nella stessa
  transazione del documento; nessuna rotta le cancella.
- **Le voci libere non sono "da documentare"**: nascono già emesse e senza socio,
  quindi restano fuori dalla `UNION` di `listVoci`.

Nessuna variazione per la ricarica libera: `movimento_voucher.importo_pagato` e
`ricarica_taglio` restano come sono.

## API

### Ricarica

`POST /api/voucher/:id/movimenti` — risposta invariata; il corpo prende un campo
facoltativo in più, **`valore`**: quanto accreditare sul voucher. `importo`
resta quanto il socio paga.

| Modalità | Corpo | Esito |
|---|---|---|
| `map` | `importo` che coincide con un taglio, senza `valore` | valore del taglio (invariato) |
| `map` | `importo` fuori taglio, senza `valore` | **400** "Importo non previsto: scegli un taglio o indica il valore da accreditare" (oggi lo stesso 400, con un messaggio diverso) |
| `map` | `importo` **e** `valore`, con o senza tagli configurati | accreditato `valore`; `importo_pagato` = `importo` se diverso dal valore, altrimenti NULL |
| `map` | `valore` < `importo`, o non positivo | **400** "Il valore accreditato non può essere inferiore all'importo pagato" / "valore deve essere un importo positivo" |
| `free`, `percentage` | con `valore` | **400** "Il valore accreditato si indica solo nella modalità a tagli" |
| `free`, `percentage` | senza `valore` | invariato |

Senza tagli configurati, oggi un 400 "Nessun taglio configurato": con `valore`
la ricarica passa, senza resta il 400 dell'importo fuori taglio.

### Ricevute

Sotto `ENABLE_MODULE_RICEVUTE`, a modulo spento **404**. Le rotte sono quelle
esistenti, con un secondo formato del corpo.

| Metodo | Percorso | Permessi | Corpo / Risposta |
|---|---|---|---|
| POST | `/api/documenti/anteprima` | admin | **di socio** (invariato) `{ socio_id, causale, voci: [{tipo,id}] }`, **oppure libero** `{ intestatario, causale, righe: [{ data, descrizione, importo }] }`, con `intestatario` testo → `{ pdf_base64, numero_provvisorio, anno, importo, importo_lettere }`. Non scrive |
| POST | `/api/documenti` | admin | come l'anteprima → `201` + `{ id, anno, numero, nome_file, pdf_base64 }` |
| GET | `/api/documenti` | admin | invariato, ma comprende le ricevute libere: `socio_id`, `nome` e `cognome` **null**, `intestatario` valorizzato. Con il filtro `socio_id` le libere non compaiono |
| GET | `/api/documenti/:id` | admin **o il socio intestatario** | invariato: per una ricevuta libera non c'è socio intestatario, quindi solo l'admin |

Dettagli del corpo libero:

- `righe[].data`: `YYYY-MM-DD`, facoltativa; omessa vale la data del documento
  (oggi). È la data dell'evento o dell'incasso, quindi può essere passata, ma
  non futura.
- `righe[].importo`: numero positivo, arrotondato al centesimo come le ricariche.
- Ordine delle righe: quello dell'array, conservato in `posizione` e ripetuto nel
  PDF.
- Nessun campo `importo` totale: se arriva, si ignora.

`backend/docs/openapi.yaml` e `bruno/` si aggiornano nello stesso passaggio: lo
schema del corpo diventa un `oneOf` dei due formati, e in Bruno si aggiungono
"Anteprima ricevuta libera" ed "Emetti ricevuta libera".

## Interfaccia

### Voucher → Ricarica (modalità `map`)

- Select: i tagli dal più economico, poi **"Altro importo…"** come ultima voce.
- Scelta "Altro importo…": sotto la select compaiono due campi affiancati,
  **Importo pagato (€)** e **Valore accreditato (€)**. Il secondo copia il primo
  mentre lo si scrive, finché l'admin non lo modifica a mano: il caso più comune
  (nessun extra) resta di un campo solo.
- Sotto i campi, prima di salvare: "Il socio paga **40 €**, sul voucher vanno
  **45 €**." Se il pagato coincide con un taglio si aggiunge "Il taglio da 50 €
  accrediterebbe 55 €", perché chi ha scelto "Altro importo…" per sbaglio se ne
  accorga.
- Con un valore inferiore al pagato **Salva** resta spento, con il motivo sotto
  il campo.
- Senza tagli configurati: niente select, direttamente i due campi, con la nota
  "Nessun taglio configurato: indica tu quanto accreditare. I tagli si impostano
  nelle Impostazioni, card Ricariche." Non è più un errore, ma resta scritto
  perché chi ha attivato `map` si aspetta dei tagli.

### Ricevute → Crea ricevuta

- Accanto a **Emetti ricevuta (N)** un secondo pulsante, **Ricevuta libera**,
  sempre attivo. Non usa né il socio filtrato né le voci selezionate, e non le
  azzera: chiudendo il form si ritrova la pagina com'era.
- Il form, in un modale come quello della causale:
  - **Intestatario**: un campo di testo, per una persona come per un club o un
    ente (es. "Mario Rossi — ASD Cinofila Lago").
  - **Causale**: testo, obbligatoria. Si precompila con la descrizione della
    prima riga finché l'admin non la modifica, per non scrivere due volte la
    stessa frase quando la riga è una sola.
  - **Righe**: una tabella con Data (oggi di default), Descrizione, Importo, e un
    pulsante per togliere la riga; sotto, **+ Aggiungi riga**. Si parte con una
    riga vuota. L'ultima riga rimasta non si toglie.
  - **Totale**, ricalcolato a ogni modifica, e **Genera anteprima**, spento
    finché un campo obbligatorio è vuoto o un importo non è positivo.
- Da **Genera anteprima** in poi il percorso è quello di oggi: numero
  provvisorio, importo in lettere, "Apri l'anteprima in PDF", conferma.
- Su schermo stretto le righe vanno a capo: data e importo su una riga,
  descrizione sotto, come le altre tabelle del form.

### Ricevute → Ricevute emesse

- La colonna **Socio** mostra già `intestatario` e diventa **Intestatario**:
  con le libere non tutti gli intestatari sono soci. Per le libere accanto al
  nome compare l'etichetta **non socio**, perché chi scorre l'elenco sappia che
  quella persona non la troverà fra i soci.
- Scegliendo un socio nei filtri le libere spariscono, come ogni ricevuta di un
  altro intestatario.

### Manuale d'uso

`frontend/src/manuale/sezioni.tsx` e `ModalitaRicariche.tsx`: la modalità a tagli
dice che resta sempre possibile un importo libero, con il valore da accreditare
indicato dall'admin; la sezione Ricevute spiega la ricevuta libera e per chi è.

## Decisioni

| Tema | Scelta | Motivo |
|---|---|---|
| Valore della ricarica libera | **lo indica l'admin** (D1) | scelta di Luca: fuori listino può servire anche un extra fuori listino. Il principio "il valore lo decide il backend" resta per i tagli, la percentuale e la modalità libera; nella sola voce "Altro importo…" il valore è una dichiarazione esplicita di chi ha già il privilegio di amministrazione, l'unico che registra ricariche |
| Un campo `valore` nel corpo, non un flag `libera: true` | `valore` facoltativo | la presenza del valore *è* la scelta libera: un flag in più sarebbe un secondo modo di dire la stessa cosa, che può contraddire il primo |
| Pagato uguale a un taglio, con `valore` | **vale il `valore`** | chi ha scelto "Altro importo…" ha scritto il valore di proprio pugno: sostituirlo con quello del taglio smentirebbe ciò che ha appena visto a schermo. Il form segnala la coincidenza con il taglio prima di salvare |
| Fuori taglio senza `valore` | **400**, come oggi | il valore va dichiarato: accreditare 1:1 in silenzio sarebbe una scelta che nessuno ha fatto. Tiene anche intatto il comportamento per chi chiama l'API senza conoscere il campo |
| Valore inferiore al pagato | rifiutato | è la stessa regola dei tagli (`creaTaglio`): quasi sempre sono i due campi invertiti |
| `valore` in modalità `free` e `percentage` | **400** | lì il valore lo decide la configurazione; ignorarlo in silenzio farebbe credere a chi lo manda di averlo impostato |
| `map` senza tagli | si registra con "Altro importo…", non errore | con la scelta libera sempre presente, "nessun taglio" non è più una configurazione rotta ma una configurazione vuota |
| Intestatario della ricevuta libera | testo libero, nessun socio (D2, D3) | il caso è una persona o un club esterno, che non va registrato come socio. Un campo unico regge una persona come un ente |
| Intestazione e piè di pagina delle libere | **gli stessi** delle ricevute dei soci, dalla card Ricevute delle Impostazioni (richiesta di Luca, 2026-11-15) | è lo stesso documento dell'associazione, con la stessa numerazione: una ricevuta libera senza carta intestata o senza la clausola sul bollo sarebbe incompleta. Nessun testo dedicato alle libere, e nessun campo nel form per cambiarli |
| Chi vede le ricevute libere | **solo l'admin** (D2) | emette e riapre solo l'admin. Il socio raggiunge le proprie ricevute dalle righe d'origine (spec 004), e una ricevuta libera non ne ha |
| Dove stanno le righe libere | tabella `ricevuta_voce_libera`, legata con `documento_emesso_voce` e `tipo = 'libera'` (proposta di Luca, 2026-11-15) | le righe libere diventano una fonte come movimenti, tesseramenti e incontri, e ogni ricevuta si legge per la stessa strada. Costa l'allargamento del `CHECK` su `tipo` e una foreign key diretta in meno, la stessa che le altre fonti non hanno |
| Riconoscere una ricevuta libera | `socio_id IS NULL` | un'informazione, un posto |
| Importi decisi dal client | **sì, per le sole libere** | la spec 003 (R7) ricalcola l'importo dal database perché le voci esistono già lì. Le righe libere non esistono da nessuna parte prima dell'emissione: è l'admin a dichiararle, e l'emissione le scrive. Il backend continua a decidere il **totale**, sommando le righe |
| Stesse rotte, due formati di corpo | `/api/documenti` e `/anteprima` | è la stessa risorsa, con la stessa numerazione, la stessa risposta e lo stesso modale a valle. Rotte nuove duplicherebbero transazione, numerazione e risposta per cambiare solo da dove arrivano le righe |
| Stessa numerazione | **unica** per anno | una seconda serie (es. "L-12/2026") introdurrebbe due ricevute con lo stesso numero nello stesso anno, che è ciò che la numerazione esiste per impedire |
| Data per riga | facoltativa, oggi di default, non futura | il dettaglio delle ricevute dei soci ha la data di ciascuna voce; per un evento la data utile è quella dell'evento, che può precedere il giorno in cui si scrive la ricevuta. La data del documento invece resta oggi, non modificabile (spec 003) |
| Causale precompilata dalla prima riga | sì, finché non la si tocca | con una riga sola, causale e descrizione sono quasi sempre la stessa frase |
| Massimo di righe | 50 | una ricevuta per un evento ha poche righe; il limite c'è per non accettare un corpo arbitrario, come `MAX_VOCI` per le voci |

## Alternative scartate

| Alternativa | Perché no |
|---|---|
| Un interruttore (variabile o impostazione) per scegliere fra tagli vincolanti e tagli con importo libero | la richiesta è che la scelta libera ci sia **sempre**. Un interruttore in più è una quarta combinazione di `RECHARGE_MODE` da documentare e da provare, per un caso — vietare l'importo libero — che nessuno ha chiesto |
| Ricarica libera accreditata 1:1, senza valore da indicare | proposta nel Draft per tenere il valore sempre deciso dalla configurazione; scartata da Luca (D1): fuori listino l'admin deve poter riconoscere anche un extra |
| Importo libero che, se coincide con un taglio, prende il valore del taglio | proposta nel Draft insieme all'1:1; con il valore indicato a mano (D1) smentirebbe ciò che l'admin ha scritto |
| Campo libero sempre visibile accanto alla select, invece della voce "Altro importo…" | due controlli per lo stesso dato, e la domanda "quale vale se li compilo tutti e due?". L'ultima voce della select è ciò che è stato chiesto e tiene un controllo solo |
| Ricevuta libera intestabile anche a un socio, visibile nella sua area | scartata da Luca (D2): la ricevuta libera è per chi non è socio, e la vede solo l'admin |
| Intestatario come nome e cognome separati, o con codice fiscale | proposta nel Draft; scartata da Luca (D3) per un campo unico, che vale anche per un club o un ente |
| Registrare il non socio come socio (scheda senza account) | è il ripiego di oggi: la persona entra nell'elenco Soci, nelle ricerche, nel tesseramento, e i suoi dati restano nell'anagrafica dei soci di un'associazione di cui non fa parte |
| Una tabella di "pagamenti esterni" come quarta fonte di voci, da cui poi emettere la ricevuta con il flusso di oggi | due passaggi (registra l'incasso, poi documentalo) per un incasso che esiste solo per essere documentato. E una voce esterna non ha un socio, che è proprio ciò su cui il flusso di oggi si regge (filtro, selezione, intestatario) |
| Righe libere in `documento_riga_libera` con `documento_id REFERENCES documento(id)` | proposta nel Draft per avere il legame controllato dal database; scartata a favore della variante di Luca, che riusa `documento_emesso_voce` e tiene un solo percorso fra ricevuta e righe. Il controllo in meno è lo stesso che manca già alle altre tre fonti |
| Ricevute libere in una tabella separata da `documento` | numerazione, conservazione del PDF, elenco e download andrebbero duplicati o uniti a mano, e due tabelle con lo stesso numero di ricevuta sarebbero l'errore che la numerazione unica previene |
| Una serie di numerazione separata per le libere | vedi la decisione "Stessa numerazione" |
| Rotte dedicate (`/api/documenti/libere`) | vedi la decisione "Stesse rotte, due formati di corpo" |
| Test della modalità a tagli lasciati manuali | proposta nel Draft perché la suite gira in `free`; scartata da Luca: quello che passa dalle API si prova dalla suite |
| La suite che avvia da sé la seconda istanza del backend | in CI il backend è un'immagine Docker, non il sorgente con le sue dipendenze: la suite dovrebbe sapere avviare due cose diverse a seconda di dove gira. Chi la avvia (comando locale, job di CI) sa già come farlo per la prima istanza |
| Test sulla seconda istanza saltati se non risponde | una suite verde che non ha provato la modalità a tagli direbbe il falso proprio su ciò che questi test esistono per provare |
| Cambiare `RECHARGE_MODE` a metà suite riavviando il backend | un riavvio a metà suite fa fallire ciò che segue (è il motivo per cui `dev:backend:test` è senza `--watch`), e serializzerebbe due configurazioni che possono convivere |
| Una libreria per leggere i PDF nei test | una dipendenza per estrarre poche stringhe, quando `zlib` di Node basta: provato sui PDF di `pdfkit` |
| Leggere `documento_riga_libera` dal database per R26 | i test creano e leggono dalle API; solo il primo admin e la pulizia passano dal database (AGENTS.md). L'ordine delle righe si legge dal PDF riscaricato |
| Colonna `tipo` su `documento` | duplicherebbe `socio_id IS NULL`, e due campi che dicono la stessa cosa prima o poi si contraddicono |

## Rischi e impatti

- **`socio_id` facoltativo e la release precedente.** La migrazione gira prima
  del deploy. Con il database già migrato e il backend ancora vecchio: le
  emissioni scrivono sempre `socio_id`; l'elenco usa `JOIN socio` e non vede le
  libere (che a quel punto non esistono ancora); il download confronta
  `socio_id` con la scheda di chi chiama, e un NULL non coincide con nessuno.
  Nessun percorso si rompe. Rilassare un `NOT NULL` non è fra le operazioni
  vietate dalla regola delle migrazioni (rinomine, `DROP` di oggetti, cambi di
  tipo), ma è una modifica, non un'aggiunta: lo si dichiara qui.
- **Tutto il codice che legge `documento.socio_id`** va riletto pensando al
  NULL: `listDocumenti` (passa a `LEFT JOIN socio`), il controllo dei permessi
  in `GET /api/documenti/:id`, `documenti-lettura` lato socio (le libere non
  hanno voci, quindi non compaiono da nessuna riga), la pulizia dei test.
- **Pulizia dei test** (`tests/api/dati.ts`): oggi cancella i documenti dei soci
  `_test` passando da `socio_id`. Le libere create dalla suite si riconoscono
  dall'intestatario con suffisso `_test`: si cancellano i legami in
  `documento_emesso_voce`, poi le righe in `ricevuta_voce_libera`, poi i
  documenti.
- **Il `CHECK` su `documento_emesso_voce.tipo`** era anonimo (migrazione 002): la
  005 lo cerca per tabella e colonna, lo toglie e lo ricrea con il nome
  `ck_documento_emesso_voce_tipo`, dentro un blocco con la guardia, quindi
  rieseguibile. Il percorso da database vuoto lo prova il job `test` della CI a
  ogni push.
- **Un admin che usa la ricevuta libera per un socio** (D2): la ricevuta esiste,
  ma il socio non la vede e la voce d'origine — se c'è — resta "da registrare".
  Il form lo dice in una riga: "Per gli incassi di un socio registrati in Clubby
  usa le voci: la ricevuta libera non compare nella sua area".
- **Il valore accreditato arriva dal client.** È un'eccezione dichiarata al
  principio di [Ricariche con valore extra](../docs/readme/voucher-tesseramento-ricevute.md#ricariche-con-valore-extra),
  limitata alla modalità `map` e a una rotta già riservata all'admin. Un admin
  può comunque già oggi creare un taglio qualsiasi: il campo non gli dà un potere
  che non avesse, gli toglie solo il giro per esercitarlo. La documentazione va
  corretta perché non affermi più il contrario.
- **Errori di battitura nel valore.** Un valore sbagliato finisce sul voucher. Il
  riepilogo "il socio paga X, sul voucher vanno Y" sta sotto i campi prima di
  salvare, e un valore inferiore al pagato non si salva.
- **Una seconda istanza del backend per la suite** (vedi Test automatici): chi
  lancia `npm run test:api` con un backend avviato a mano, senza
  `npm run dev:backend:test`, vede fallire i test in `map` e a moduli spenti con
  il messaggio che dice cosa avviare, come oggi per il backend principale.

## Documentazione da allineare

| File | Cosa cambia |
|---|---|
| `docs/readme/voucher-tesseramento-ricevute.md` | tabella delle modalità di ricarica, la frase "quanto accreditare lo calcola sempre il backend" e "in modalità `map` un importo che non corrisponde a nessun taglio viene rifiutato"; sezione Ricevute in PDF, che oggi dice "si selezionano le voci di un socio" come unico modo |
| `frontend/src/manuale/sezioni.tsx`, `ModalitaRicariche.tsx` | vedi Interfaccia |
| `backend/docs/openapi.yaml`, `bruno/` | vedi API: il campo `valore` della ricarica e il corpo libero delle ricevute |
| `AGENTS.md` | tabella degli endpoint: `/api/documenti` emette anche ricevute libere. Sezione Test e tabella dei comandi: `dev:backend:test` avvia due istanze, la seconda sulla 3002 in `map` e a moduli spenti. La nota sui test in `map` resta vera per l'istanza principale |
| `.github/README.md`, commenti del job `test` | il secondo container del backend |
| `docs/developer/` (sviluppo locale) | la porta 3002 occupata durante la suite, da liberare a fine prove |
| `specs/README.md` | riga della 013 |

## Implementazione

Fatta il 2026-11-15, sul branch `feature/spec-013`, senza commit.

- **Suite delle API**: 201 test verdi, di cui 23 nuovi (`documenti-libere.test.ts`
  14, `ricariche-map.test.ts` 6, `moduli-spenti.test.ts` 3) più uno in
  `ricariche.test.ts`. Eseguita con le due istanze del backend avviate.
- **Build e lint**: backend compilato; frontend con `npm run build` (in un
  container, come da toolchain locale) e `eslint` a zero errori.
- **Migrazione 005** applicata al database locale; il vincolo nuovo risulta
  `ck_documento_emesso_voce_tipo` con i quattro tipi.
- **Interfaccia provata nel browser**, come admin, contro il backend locale:
  - Ricevuta libera: tre righe, una tolta, totale ricalcolato a 27,50 €, causale
    precompilata dalla prima riga, anteprima con numero provvisorio e importo in
    lettere. **Nessuna emissione**: la conferma non è stata premuta.
  - Ricevute emesse: la colonna si chiama Intestatario.
  - Ricarica in modalità `map` (frontend avviato con `VITE_RECHARGE_MODE=map`):
    senza tagli compaiono direttamente i due campi con la nota; il valore copia
    il pagato finché non si modifica; con un valore inferiore Salva si spegne e
    compare il motivo; con un taglio di prova (poi eliminato) la select termina
    con "Altro importo…" e scrivendo l'importo del taglio compare l'avviso "Il
    taglio da … accrediterebbe …". Nessuna ricarica salvata.

## Test dell'utente

**Test manuali eseguiti su richiesta di Luca (2026-11-15)**, nel browser integrato
dell'app (Claude in Chrome bloccava `localhost`), con servizi e frontend in
container e un socio di prova `Manuale_test`, rimosso alla fine con
`npm run test:api:pulizia`.

| Req. | Esito |
|---|---|
| R1 | La select elenca il taglio di prova e, per ultima, "Altro importo…" |
| R2 | Pagato 40, valore 45: saldo +45, in Ricevute la voce vale 40 |
| R3 | Il valore copia il pagato; modificato a mano, non viene più sovrascritto |
| R4 | Con 73,21 (importo del taglio) compare "Il taglio da € 73,21 accrediterebbe € 80,00" |
| R5 | Valore 30 con pagato 40: messaggio sotto il campo e Salva spento |
| R7 | Senza tagli: nota e due campi subito; ricarica da 20 € salvata |
| R7-bis | Scelto il taglio dalla select: movimento da 73,21 con 80 accreditati |
| R17 | PDF della ricevuta libera 53/2026 reso in immagine: intestazione, logo, intestatario, causale, due righe con le loro date e piè di pagina come in una ricevuta di socio |
| R17-bis | Con l'intestazione vuota la voce di menu Ricevute è spenta con il "?"; intestazione poi ripristinata |
| R23 | Tre righe, una tolta, totale 27,50 €; causale precompilata dalla prima riga |
| R24 | Anteprima n. 53/2026, conferma, avviso di emissione; la ricevuta compare in Ricevute emesse con l'etichetta "non socio" |
| R25 | Con un socio filtrato e due voci spuntate il pulsante resta attivo, e dopo l'emissione libera la selezione è ancora lì |

Corretto durante la prova: senza tagli la nota sopra i campi della ricarica
toccava l'etichetta "Importo pagato"; ora ha uno spazio sotto.

Resta da fare la prova di Luca sui propri casi, prima di compilare la Verifica.

## Verifica

Da compilare dopo il test dell'utente.
