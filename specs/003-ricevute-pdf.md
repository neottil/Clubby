# 003 — Ricevute PDF

## Stato

- [ ] Draft
- [x] Approvata
- [x] Completata

**Versioni**: `backend 2.9.3`, `frontend 2.8.3` — minor per la funzionalità, poi un patch
per la rinomina della pagina in "Ricevute", il nome del file scaricato e la
risoluzione del logo in sviluppo, e un secondo per la testata del PDF
(intestazione a sinistra, logo a destra) e la voce di menù spenta senza
intestazione, e un terzo per il codice ricevuta cliccabile nelle tabelle.
Authorizer non toccato.

## Problema

Oggi l'admin apre la pagina delle voci incassate, le seleziona e preme un
pulsante che le **marca** come emesse. Non produce niente: il documento da consegnare
al socio viene scritto a mano fuori dall'applicazione, e Clubby si limita a
ricordare che è stato fatto.

Il risultato è che la numerazione, l'intestazione e l'importo in lettere vivono
in un file Word sulla macchina di qualcuno. Non c'è una copia del documento
consegnato, non c'è garanzia che due ricevute non prendano lo stesso numero, e
un refuso battuto a mano (il modello di riferimento dice *centosesanta* con una
"s" sola) non lo intercetta nessuno.

E il socio non ha modo di rivedere la ricevuta di una ricarica: gliel'hanno
consegnata una volta, su carta o via chat, e se la perde va richiesta.

## Obiettivo

Dalla selezione delle voci di un socio, l'admin ottiene una **ricevuta in PDF**
numerata progressivamente per anno, la vede prima di confermarla, e una volta
confermata la scarica — mentre Clubby ne conserva i byte esatti e li rende
riapribili sia all'admin sia al socio intestatario.

## Fuori perimetro

- **Fattura elettronica.** Questi documenti sono ricevute, non fatture: non c'è
  XML, non c'è SdI. Il PDF *è* il documento.
- **Annullamento e nota di credito.** Una ricevuta emessa non si annulla e non
  si elimina. L'anteprima esiste per non doverlo fare.
- **Numero di partenza configurabile.** L'applicazione entra in servizio a
  gennaio, quindi parte da 1. Se un giorno servisse partire da un altro numero,
  è una `UPDATE` su una riga: nessuna interfaccia.
- **Caricamento del logo dall'interfaccia.** Il logo è quello del branding, già
  versionato nel repository e già scelto per ambiente da `LOGO_FILE`.
- **Più soci in un documento.** Una ricevuta è intestata a una persona.
- **Invio per email.** Il documento si scarica, non si spedisce.
- **Le voci già marcate come emesse** restano com'erano, senza documento
  collegato. Sono lo storico di prima di questa feature, e nella colonna nuova
  non mostrano niente.
- **Imposta di bollo.** L'associazione è esente ex art. 27-bis: è una frase
  fissa nel piè di pagina, non un calcolo.

## Requisiti

| # | Requisito | Test |
|---|---|---|
| R1 | L'anteprima restituisce un PDF valido e **non scrive niente** nel database | `ricevute.test.ts` — due anteprime consecutive, poi verifica che non esista alcun documento |
| R2 | La conferma crea il documento, ne conserva i byte e li restituisce | `ricevute.test.ts` — il PDF risposto inizia con `%PDF` |
| R3 | La numerazione parte da 1 e cresce di 1 per ogni documento dello stesso anno | `ricevute.test.ts` — tre emissioni consecutive |
| R4 | Due documenti non possono avere lo stesso `(anno, numero)` | vincolo `UNIQUE` + test di emissione ripetuta |
| R5 | La conferma fallisce con **409** se una delle voci è stata documentata nel frattempo | `ricevute.test.ts` — emissione doppia sulla stessa voce |
| R6 | Le voci del documento risultano documentate e legate ad esso | `ricevute.test.ts` — la voce sparisce dall'elenco e `documento_id` è valorizzato |
| R7 | L'importo è ricalcolato dal database, mai preso dal client | `ricevute.test.ts` — conferma con un totale falsificato nel corpo |
| R8 | L'importo in lettere è corretto sui casi critici dell'italiano | `ricevute.test.ts` — l'anteprima espone `importo_lettere` |
| R9 | Emettere una ricevuta è **solo dell'admin** | `ricevute.test.ts` — istruttore e socio ricevono 403 su anteprima ed emissione |
| R10 | **Riaprire** una ricevuta è concesso all'admin e al **socio intestatario**; un altro socio riceve 403 | `ricevute.test.ts` — tre chiamate a `GET /documenti/:id` |
| R11 | L'admin ha l'elenco delle ricevute emesse, paginato, con filtri per socio e periodo | `ricevute.test.ts` — elenco dopo tre emissioni |
| R12 | Un movimento compreso in una ricevuta espone id, anno e numero del documento; gli altri no | `documenti-lettura.test.ts` — movimenti di un voucher prima e dopo l'emissione |
| R13 | A modulo spento tutte le rotte dei documenti rispondono **404** e i movimenti non espongono il campo | `moduli.test.ts` |
| R14 | Senza un logo utilizzabile la ricevuta si emette lo stesso, senza logo | `ricevute.test.ts` — emissione con `LOGO_FILE` vuoto |
| R15 | La pipeline si ferma se, **a modulo attivo**, un logo SVG non ha il gemello raster | job `valida-branding`, verificato a mano su un commit di prova |
| R16 | La pipeline si ferma se un raster supera 1000 px di lato o 200 KB | idem, con un PNG sovradimensionato di prova |
| R17 | Il logo è disegnato entro 90 × 90 pt qualunque sia la risoluzione del file | `ricevute.test.ts` — due loghi di risoluzione diversa producono un PDF di pari ingombro |
| R18 | Il nome del file scaricato è `ricevuta_<anno>_<numero>.pdf`, **uguale da ogni tabella** | `documenti-emissione.test.ts` — confronto col numero e l'anno della risposta; `documenti-lettura.test.ts` — il codice della voce ricostruisce lo stesso nome |
| R19 | Senza intestazione configurata la voce di menù **Ricevute** è spenta, con un "?" che dice dove configurarla | verifica manuale (vedi **Verifica**) |

Coinvolti: l'**admin** in Ricevute e Impostazioni; il **socio** nella sola
colonna nuova dei propri movimenti. L'istruttore non vede niente di nuovo.

## Modello dati

Migrazione `003_ricevute.sql`, sole aggiunte.

```sql
-- Contatore per anno. Una riga per anno, creata al primo documento.
-- Non è una SEQUENCE di proposito: vedi Decisioni.
CREATE TABLE IF NOT EXISTS documento_numerazione (
  anno       INTEGER PRIMARY KEY,
  ultimo     INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documento (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anno            INTEGER NOT NULL,
  numero          INTEGER NOT NULL,
  data_documento  DATE NOT NULL,
  socio_id        UUID NOT NULL REFERENCES socio(id),
  -- Denormalizzati apposta: il documento deve restare leggibile com'era il
  -- giorno in cui è stato consegnato, anche se il socio cambia cognome o
  -- l'intestazione dell'associazione cambia indirizzo.
  intestatario    TEXT NOT NULL,
  causale         TEXT NOT NULL,
  importo         NUMERIC(10,2) NOT NULL,
  importo_lettere TEXT NOT NULL,
  nome_file       TEXT NOT NULL,
  contenuto       BYTEA NOT NULL,
  -- `sub` dell'admin che ha confermato: serve a rispondere a "chi l'ha emessa".
  emesso_da       VARCHAR(255),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_documento_anno_numero UNIQUE (anno, numero)
);

CREATE INDEX IF NOT EXISTS idx_documento_socio ON documento(socio_id, data_documento DESC);

-- La colonna esisteva già nullable dalla 002, in attesa di questa tabella.
-- Le righe storiche restano a NULL e il vincolo le accetta.
ALTER TABLE documento_emesso_voce
  ADD CONSTRAINT fk_documento_emesso_voce_documento
  FOREIGN KEY (documento_id) REFERENCES documento(id);
```

Chiavi nuove in `impostazione` (nessuna variazione di schema, la tabella è
chiave/valore): `ricevuta_intestazione` e `ricevuta_pie_pagina`, entrambe
multiriga. Il logo **non** sta nel database: viene dall'immagine.

## API

Dietro `ENABLE_MODULE_RICEVUTE`; a modulo spento **404 e non 403**.

**Il prefisso `/api/fatturazione` sparisce**: tutte le rotte di quest'area
passano sotto `/api/documenti`, compresa quella che esiste già.

| Metodo | Percorso | Permessi | Corpo / Risposta |
|---|---|---|---|
| GET | `/api/documenti/voci` | admin | **era `GET /api/fatturazione`**: le voci ancora da documentare. Filtri e risposta invariati |
| POST | `/api/documenti/anteprima` | admin | `{ socio_id, causale, voci: [{tipo,id}] }` → `{ pdf_base64, numero_provvisorio, anno, importo, importo_lettere }`. **Non scrive** |
| GET | `/api/documenti` | admin | elenco paginato dei documenti emessi `{ data, total, limit, offset }`, filtri `socio_id`, `da`, `a`. **Senza i byte** |
| POST | `/api/documenti` | admin | come l'anteprima → `201` + `{ id, anno, numero, nome_file, pdf_base64 }` |
| GET | `/api/documenti/:id` | admin **o il socio intestatario** | il PDF, `Content-Type: application/pdf` |

`voci` e `anteprima` vanno registrate in `ROUTES` **prima** del ramo con
l'id, o il pattern `/^\/api\/documenti\/([^/]+)$/` le tratterebbe come un
identificativo. È lo stesso inciampo già risolto nella 001 con
`POST /api/incontri/rendiconta`.

Il permesso di `GET /documenti/:id` è l'unico punto in cui questa feature esce
dal perimetro dell'admin, e serve alla colonna nei movimenti del socio. Il
controllo non è "sei un socio": è **`documento.socio_id` uguale alla scheda
socio di chi chiama**, risolta come già fa `/api/auth/socio`. Un socio che prova
l'id della ricevuta di un altro riceve 403.

`GET /api/voucher/:id/movimenti` guadagna `documento_id: string | null` su ogni
riga, da `LEFT JOIN documento_emesso_voce d ON d.tipo = 'ricarica' AND
d.riferimento_id = m.id`. È valorizzato solo per le ricariche comprese in una
ricevuta emessa da questa feature in poi: addebiti e rettifiche non sono voci
documentabili e restano a `null`, come le voci marcate prima della 003. A modulo
spento il campo non compare affatto.

Lo stesso campo si aggiunge alle righe di `GET /api/documenti/voci`, per la
colonna nell'elenco delle voci già emesse.

**Rimosso**: `POST /api/fatturazione/emetti`. Era il segnaposto lasciato dalla
spec 001 per marcare le voci senza produrre documenti; il nuovo percorso lo
sostituisce integralmente. Nessun client esterno lo usa.

`GET/PUT /api/impostazioni` guadagnano `ricevuta_intestazione` e
`ricevuta_pie_pagina`. Nessuna rotta nuova per il logo.

### Il percorso binario

Oggi `ResponseResult.body` è tipizzato `string` e `server.ts:200` fa
`res.end(result.body)`: un `Buffer` PDF convertito in stringa UTF-8 **arriva
corrotto**. Si aggiunge `isBase64Encoded?: boolean` al risultato, e `server.ts`
decodifica in `Buffer` prima di `res.end`. È additivo: chi non lo passa si
comporta esattamente come prima.

Non serve niente in ingresso — senza upload del logo, nessuna richiesta porta
dati binari.

## Il logo e la cartella branding

### Spostamento

`frontend/public/branding/` → **`branding/`** alla radice. Non è più un
dettaglio del frontend: le stesse immagini servono al backend per disegnare le
ricevute.

Lo spostamento ha una conseguenza che va gestita nello stesso passaggio, o i
loghi spariscono dal frontend senza un errore: la build del frontend è
`npm run build` dentro `frontend/`, e **Vite copia in `dist/` il solo contenuto
di `frontend/public/`**. Fuori di lì, i file non finiscono da nessuna parte.

Rimedio: uno script `scripts/copia-branding.mjs` (`fs.cpSync`, nessuna
dipendenza, funziona su Windows e in CI) agganciato a `prebuild` e `predev` di
**entrambi** i moduli, che ricopia `branding/` in `frontend/public/branding/` e
in `backend/branding/`. Tutti e due i percorsi vanno in `.gitignore`: sono
generati.

Lo script riceve **il nome del modulo** come argomento e tocca solo la copia di
quello. `npm run dev` avvia i moduli in parallelo: senza l'argomento i due
`predev` girerebbero insieme sulle stesse cartelle, uno cancellando mentre
l'altro copia, e su Windows quella collisione è un `EPERM` che fa fallire
l'avvio. La rimozione usa inoltre `maxRetries`, perché su Windows un handle
ancora aperto (antivirus, indicizzatore, dev server) può farla fallire per
qualche decina di millisecondi.

La copia nel backend esiste per lo stesso motivo di quella nel frontend —
ognuno cerca i loghi accanto a sé. Nell'immagine il Dockerfile copia
`branding/` in `/app/branding`, cioè accanto al processo, e `logo.ts` la cerca
lì; in sviluppo il backend gira da `backend/`, e senza la copia dovrebbe
risalire di un livello. Sarebbero due modi diversi di trovare la stessa
cartella a seconda di dove gira: la copia ne lascia uno solo, e lo sviluppo
esercita lo stesso percorso della produzione.

`frontend/public/logo.svg` **resta dov'è** — è il logo predefinito
dell'applicazione, non di un club.

### Perché il backend li vede

1. `backend/Dockerfile` copia la cartella: `COPY branding /app/branding`.
   Funziona perché il contesto di build del backend è **la radice del
   repository** — scelta già fatta per `scripts/seed-demo-data.sh`.
2. Il Deployment del backend riceve `LOGO_FILE`, la **stessa Variable** che
   legge il deploy del frontend. Un valore per ambiente, letto da due posti.
3. Il backend risolve il raster: `pdfkit` incorpora **solo PNG e JPEG**. Se
   `LOGO_FILE` è già un raster lo usa; se è un `.svg` cerca l'omonimo `.png`,
   poi `.jpg`/`.jpeg`.

**Se non trova niente, la ricevuta si emette lo stesso, senza logo**, con un
avviso nei log. Rifiutare di emettere un documento fiscale per un elemento
decorativo sarebbe sproporzionato; a impedire che accada ci pensa la pipeline.

### Dimensioni, e perché il backend non ridimensiona

`pdfkit` disegna il logo in un riquadro di **90 × 90 pt** (≈ 3,2 cm),
rispettando le proporzioni:

```js
doc.image(logo, doc.page.width - MARGINE - 90, yTestata, { fit: [90, 90], align: 'right' })
```

Sta **a filo del margine destro e sulla stessa riga dell'intestazione**, che
resta allineata a sinistra e si restringe per non finirgli sotto: è la testata
di una carta intestata. Chi ricomincia sotto è il più alto dei due, logo o
indirizzo.

Quindi **a schermo e in stampa l'immagine è sempre della misura giusta**,
qualunque sia la sua risoluzione: `fit` scala il disegno.

Ciò che `fit` **non** fa è ricampionare i pixel. `pdfkit` incorpora i byte
originali dell'immagine e si limita a rimpicciolire il riquadro in cui li
mostra. Un logo da 4000 × 4000 px viene disegnato a 3,2 cm ma **pesa dentro
ogni singola ricevuta**, e quelle ricevute restano nel database per cinque
anni: un logo da 3 MB costerebbe 1,5 GB su cinquecento documenti, per
un'immagine che si vede grande come un francobollo.

Il backend **non ridimensiona**. Ricampionare richiederebbe `sharp` (binario
nativo, ~10 MB, dipendente dalla piattaforma) o `jimp` in un backend che oggi
ha tre dipendenze — sproporzionato per un problema che non si pone a runtime:
il logo non è un caricamento dell'utente, è **un file committato nel
repository**, scelto una volta e passato da una revisione. Il posto giusto
dove metterci un limite è il commit, non l'emissione.

Misure da documentare e far rispettare:

| | |
|---|---|
| Riquadro nel PDF | 90 × 90 pt (≈ 3,2 cm) |
| Lato lungo consigliato | **400 px** (≈ 300 dpi alla misura di stampa) |
| Intervallo accettabile | 300 – 800 px |
| Limite imposto dalla pipeline | lato lungo ≤ 1000 px, file ≤ 200 KB |

Oltre gli 800 px non si guadagna niente di visibile: il PDF rimpicciolisce
comunque. Entrambi i loghi presenti oggi sono **quadrati** (`viewBox`
320 × 320 e 240 × 240), quindi 400 × 400 px è la misura di riferimento.

### Far scattare le build

Il job `versions` decide cosa ricostruire con `git diff` **sulla cartella dello
scope** (`backend/`, `frontend/`, `authorizer/`) rispetto all'ultimo tag. Una
cartella `branding/` alla radice è fuori da tutte e tre: **cambiare un logo non
farebbe partire nessuna build**, né del frontend né del backend.

Esiste già l'eccezione che serve, scritta per lo stesso motivo:

```bash
if [ "$SCOPE" = "backend" ]; then
  EXTRA_CHANGED=$(git diff --name-only "$PREV_TAG" HEAD -- "scripts/seed-demo-data.sh")
  ...
fi
```

Si generalizza: una lista di percorsi extra per scope, con `branding/` fra
quelli di **backend e frontend**, e `scripts/seed-demo-data.sh` fra quelli del
solo backend.

### Validazione in pipeline

Job nuovo in `build-deploy.yml`, con `environment: development` come gli altri
(serve a leggere le Variables):

```yaml
valida-branding:
  runs-on: ubuntu-24.04
  environment: development
  steps:
    - uses: actions/checkout@v7
    - name: Ogni logo SVG ha un gemello raster
      # Solo a modulo ricevute attivo: senza, il PNG non serve a nessuno e
      # pretenderlo bloccherebbe la pipeline per un requisito inesistente.
      if: vars.ENABLE_MODULE_RICEVUTE == 'true'
      run: |
        # pdfkit non incorpora SVG: il backend cerca l'omonimo PNG o JPEG.
        # Senza, la ricevuta uscirebbe senza logo e nessuno se ne accorgerebbe
        # fino alla prima consegnata.
        mancanti=0
        for svg in branding/*.svg; do
          [ -e "$svg" ] || continue
          base="${svg%.svg}"
          if [ ! -f "$base.png" ] && [ ! -f "$base.jpg" ] && [ ! -f "$base.jpeg" ]; then
            echo "::error file=$svg::manca $(basename "$base").png (o .jpg)"
            mancanti=1
          fi
        done
        exit $mancanti

    - name: I raster non sono sovradimensionati
      if: vars.ENABLE_MODULE_RICEVUTE == 'true'
      # Il PDF disegna il logo a 3,2 cm ma incorpora i byte originali: un
      # raster enorme non si vede, si paga — su ogni ricevuta, per cinque anni.
      # Le dimensioni in pixel si leggono dall'header IHDR del PNG; per il
      # JPEG basta il peso del file, che è il vincolo che conta davvero.
      run: |
        node -e '
          const fs = require("fs"), path = require("path");
          const MAX_LATO = 1000, MAX_BYTE = 200 * 1024;
          let ko = 0;
          for (const f of fs.readdirSync("branding")) {
            if (!/\.(png|jpe?g)$/i.test(f)) continue;
            const p = path.join("branding", f);
            const buf = fs.readFileSync(p);
            if (buf.length > MAX_BYTE) {
              console.log(`::error file=${p}::${(buf.length/1024|0)} KB, oltre il limite di ${MAX_BYTE/1024} KB`);
              ko = 1;
            }
            if (buf.subarray(1, 4).toString() === "PNG") {
              const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
              if (Math.max(w, h) > MAX_LATO) {
                console.log(`::error file=${p}::${w}x${h} px, lato lungo oltre ${MAX_LATO} px (consigliati 400)`);
                ko = 1;
              }
            }
          }
          process.exit(ko);
        '
```

Il job gira **sempre**; è lo *step* a essere condizionato dal flag. Così il job
riporta comunque `success` e i `needs` a valle non incontrano uno *skipped* —
la trappola già vista con `migrate-db`. `deploy-backend` e `deploy-frontend`
aggiungono `needs.valida-branding.result == 'success'`, nella forma con
`!cancelled()` ora usata da tutto il workflow.

Con il modulo attivo il job **fallirà al primo giro**: oggi in `branding/` ci
sono solo SVG.

## Interfaccia

### La voce di menù senza intestazione (R19)

Il modulo acceso non basta ad aprire la pagina: senza `ricevuta_intestazione`
ogni ricevuta uscirebbe monca, e **una ricevuta emessa non si annulla**. La
voce di menù resta quindi visibile ma **spenta**, con accanto un "?" che apre
la spiegazione e indirizza a Impostazioni.

Spenta e non nascosta, perché una voce che sparisce non insegna niente: chi ha
acceso il modulo si chiederebbe perché non lo vede.

Lo stato si rilegge **a ogni apertura del menù**, non una volta al caricamento:
l'admin che configura l'intestazione deve ritrovare la voce attiva subito dopo,
senza ricaricare la pagina. Finché la risposta non è arrivata la voce resta
attiva — spegnerla e riaccenderla sarebbe un lampeggio a ogni apertura.

È una difesa d'interfaccia, non un controllo: la rotta `/ricevute` risponde
ancora a chi ci arriva da un segnalibro. Il vincolo vero, se un domani servirà,
va nel backend.

### Ricevute — due schede

La pagina si divide in **due schede**, non più in sezioni impilate:

```
Ricevute
┌─────────────────┬──────────────────┐
│ Crea ricevuta   │ Ricevute emesse  │
└─────────────────┴──────────────────┘
```

I **filtri per socio e periodo restano sopra le schede** e valgono per
entrambe. Sono le due facce della stessa domanda — cosa resta da documentare a
Rossi, cosa gli ho già consegnato — e farli ridigitare a ogni cambio di scheda
sarebbe un attrito senza motivo. Il resto dello stato è per scheda:
"mostra voci già documentate" e la selezione vivono solo nella prima.

Cambiare scheda **non azzera la selezione** della prima: chi va a controllare
una ricevuta vecchia e torna indietro ritrova le voci che aveva spuntato.

Serve un componente nuovo, `components/Tabs.tsx`: nel progetto non esiste
niente del genere (il solo `aria-selected` è dentro `SearchSelect`). Va scritto
con `role="tablist"` / `role="tab"` / `role="tabpanel"` e spostamento con le
frecce, come i componenti esistenti, e resta riutilizzabile altrove.

#### Scheda "Crea ricevuta"

È la pagina di oggi: l'elenco paginato delle voci, i totali dei filtri,
"mostra voci già documentate", la selezione con le caselle.

Il pulsante **"Emetti ricevuta"** è abilitato solo quando è selezionato **un
socio** nel filtro. Altrimenti resta disabilitato con un `title` che spiega il
perché — "Scegli un socio: una ricevuta è intestata a una persona sola" — come
già fa il pulsante del privilegio admin.

Al click si apre una `Modal` (il componente esiste) con il campo **causale**
(libero, obbligatorio), il riepilogo di socio, numero di voci e importo, e il
pulsante **Genera anteprima**.

L'anteprima mostra il PDF e due pulsanti: **Conferma ed emetti** e **Annulla**.
Annullare non lascia traccia. Confermare scarica il file e ricarica l'elenco,
da cui le voci sono sparite.

Il file si chiama **`ricevuta_<anno>_<numero>.pdf`**. L'anno prima del numero
perché una cartella ordinata per nome esca nell'ordine di emissione, e nessun
dato della persona nel nome: quel nome finisce sul disco di chi scarica, spesso
in una cartella condivisa, e il contenuto del documento è già dentro il PDF.

Il **409** ha un messaggio dedicato: le voci sono cambiate, l'anteprima non vale
più, si riparte dalla selezione.

#### Scheda "Ricevute emesse" (R11)

Una tabella paginata come le altre, sui filtri condivisi:

| Numero | Data | Socio | Causale | Importo | |
|---|---|---|---|---|---|
| 1 / 2027 | 15/01/2027 | Rossi Mario | educazione cinofila | € 160,00 | 📄 |

L'ultima colonna apre il PDF conservato. Senza ricevute nel periodo filtrato,
il messaggio vuoto distingue i due casi: "Nessuna ricevuta emessa" e "Nessuna
ricevuta nel periodo selezionato" non vogliono dire la stessa cosa.

La **stessa icona** compare anche nella scheda "Crea ricevuta", sulle voci, se
è attivo "mostra voci già documentate": una voce emessa dalla 003 in poi porta al
suo documento, una marcata prima no.

### Movimenti del socio

In `VouchersPage`, la tabella dei movimenti guadagna una colonna stretta, in
coda, con l'icona del documento sulle sole righe che ne hanno uno. Il socio apre
la **propria** ricevuta; l'admin, guardando lo stesso voucher, apre la stessa.

La colonna compare solo se `config.moduli.ricevute` è attivo, e resta vuota su
addebiti, rettifiche e ricariche marcate emesse prima della 003 — cioè, all'inizio,
su quasi tutte le righe. Su schermo stretto è la prima colonna a sparire, come
le altre non essenziali.

### Impostazioni

La pagina `/admin` diventa **`/impostazioni`**: `AdminPage.tsx` →
`ImpostazioniPage.tsx`, titolo "Impostazioni", voce di menù "Impostazioni",
rotta in `App.tsx`. **Nessun redirect** da `/admin`.

Si aggiunge una `CardCollassabile` **"Ricevute"**:

- **Intestazione** — `textarea` multiriga, stampata centrata in cima al
  documento (nel modello sono tre righe: denominazione, indirizzo e C.F.,
  numero RASD);
- **Piè di pagina** — `textarea` multiriga, per la clausola sul bollo;
- un **esempio del documento** generato con dati fittizi, così che l'admin veda
  l'effetto prima che tocchi una ricevuta vera. È anche il posto in cui si
  accorge che il logo dell'ambiente non è disegnabile.

### Il documento

Ricalca il modello fornito, con il dettaglio inserito **fra la causale e il piè
di pagina**:

```
«ricevuta_intestazione»                [logo]

        RICEVUTA N. 1 / 2027 DEL 15/01/2027

Ricevuto da: Mario Rossi
La somma di: centosessanta/00 (160,00)
Per la seguente causale: educazione cinofila.

Dettaglio:
  12/01/2027   Incontro: educazione di base
  05/01/2027   Ricarica voucher

«ricevuta_pie_pagina»
```

Solo data e descrizione, come stabilito. Se le righe eccedono la pagina, il
documento continua sulla seconda.

## Isolamento del codice

La logica sta in `backend/src/service/documenti/`, con un confine netto perché
un domani si possa estrarre senza rincorrere i riferimenti:

| File | Responsabilità |
|---|---|
| `numerazione.ts` | il contatore per anno, e nient'altro |
| `lettere.ts` | importo → parole (involucro su `n2words` + i centesimi) |
| `pdf.ts` | `DatiDocumento` → `Buffer`. **Non conosce il database**: riceve un DTO completo, logo compreso, e restituisce byte |
| `documenti.service.ts` | la transazione: numero, PDF, righe, legame con le voci |

Il vincolo che rende possibile l'estrazione è il terzo: `pdf.ts` non importa
`db/client.js`. Chi vuole generare un documento passa i dati, non un id.

## Rinomine e spostamenti

| Da | A | Dove |
|---|---|---|
| `ENABLE_MODULE_FATTURAZIONE` | `ENABLE_MODULE_RICEVUTE` | GitHub Environments (a mano), `deploy-backend.yml`, `deploy-frontend.yml`, `backend/k8s/deployment.yaml`, `docker-compose.yml`, `.env.example`, `backend/src/util/moduli.ts`, `frontend/src/config.ts` (`VITE_…`), `.github/README.md`, `AGENTS.md` |
| `config.moduli.fatturazione` | `config.moduli.ricevute` | `frontend/src/config.ts`, `App.tsx`, `Layout.tsx` |
| `/admin`, `AdminPage` | `/impostazioni`, `ImpostazioniPage` | `App.tsx`, `Layout.tsx`, il file |
| `/fatturazione`, `FatturazionePage`, voce di menù "Fatturazione" | `/ricevute`, `RicevutePage`, voce di menù "Ricevute" | `App.tsx`, `Layout.tsx`, il file |
| "fatturare"/"fatturata" nei testi e nei commenti | "documentare"/"documentata" | frontend, backend, `openapi.yaml`, `bruno/`, i README, il seed |
| `frontend/public/branding/` | `branding/` | `backend/Dockerfile`, `build-deploy.yml` (analisi del diff), `deploy-frontend.yml` (controllo `LOGO_FILE`), `.gitignore`, `.dockerignore`, `frontend/package.json`, `backend/package.json`, il README |
| `GET /api/fatturazione` | `GET /api/documenti/voci` | `server.ts` (`ROUTES`), `openapi.yaml`, `bruno/`, `client.ts`, i test |
| `backend/src/handlers/fatturazione.ts` | `handlers/documenti.ts` | l'import in `server.ts` |
| `backend/src/service/fatturazione.service.ts` | `service/documenti/voci.service.ts` | entra nella cartella nuova insieme a `numerazione.ts`, `lettere.ts`, `pdf.ts`, `documenti.service.ts` |
| `modulo: 'fatturazione'` in `ROUTES` | `modulo: 'ricevute'` | `server.ts`, `util/moduli.ts` |
| `VoceFatturazione`, `FatturazioneQuery`, `getFatturazione` | `VoceDocumento`, `VociDocumentoQuery`, `getVociDocumento` | `frontend/src/api/client.ts` e i suoi usi |
| `bruno/clubby/fatturazione/` | `bruno/clubby/documenti/` | la collezione |
| `tests/api/fatturazione-*.test.ts` | `tests/api/documenti-*.test.ts` | due file |

### Cosa **non** si rinomina

- **`002_rendicontazione_e_fatturazione.sql`**, **`001_ricariche.sql`**,
  **`schema.sql`** e **`specs/001`**: sono storia già applicata. Il nome di un
  file di migrazione è la sua identità nel registro, e la baseline non si
  tocca più.

Restano quindi **due nomi** su due livelli, e la scelta è consapevole:

| Livello | Nome | Perché |
|---|---|---|
| Interruttore del modulo, pagina e menù | `ENABLE_MODULE_RICEVUTE`, "Ricevute" | è ciò che il modulo consegna, ed è la parola che l'utente usa |
| Tabelle e API | `documento` / `documenti` | generico: regge un domani in cui il documento non è una ricevuta |

Fuori dal codice storico **la parola "fattura" sparisce**. Vale anche per i
verbi: una voce non è "da fatturare" ma **da documentare**, e non è "già
fatturata" ma **già documentata**. Lasciarne metà avrebbe dato due vocabolari
per la stessa cosa, che è il modo più economico di confondere chi legge.

## Documentazione

I README si allineano **nello stesso passaggio** dell'implementazione (regola 6
di `AGENTS.md`). Questa feature ne tocca tre e ne lascia tre intatti:

| File | Cosa cambia |
|---|---|
| `README.md` | la funzione nuova (emissione delle ricevute), `/admin` che diventa `/impostazioni`, e il modulo che ora si accende con `ENABLE_MODULE_RICEVUTE` |
| `.github/README.md` | la Variable rinominata, `LOGO_FILE` che ora va letta **anche** dal deploy del backend, e il job `valida-branding` fra quelli che bloccano i deploy |
| `frontend/public/branding/README.md` → `branding/README.md` | la nuova posizione, la regola del gemello raster **con le misure in pixel**, il fatto che i file servono ora a due immagini, e che `frontend/public/branding/` diventa una copia **generata** e ignorata da git |
| `backend/src/db/migrations/README.md` | nessuna: la 003 è una migrazione ordinaria, il processo non cambia |
| `authorizer/src/db/migrations/README.md` | nessuna: l'authorizer non è toccato |
| `k8s/templates/openwa/README.md` | nessuna |

Fuori dai README, nello stesso passaggio vanno anche `backend/docs/openapi.yaml`
e la collezione `bruno/` (le rotte nuove e quella rimossa), e la tabella degli
endpoint in `AGENTS.md` — compresa la riga del modulo, che cambia nome, e la
riga di `frontend/public/branding/README.md` nella tabella dei README, che
cambia percorso.

## Decisioni

| Tema | Scelta | Motivo |
|---|---|---|
| Nome della tabella e delle rotte | `documento`, tutto sotto `/api/documenti` | persistenza e API restano generiche: "ricevuta" è ciò che il documento è oggi, non ciò che la tabella può contenere domani. Il prefisso `/api/fatturazione` sparisce anche dalla rotta che esisteva già, così l'area ha un nome solo invece di due annidati |
| `GET /api/fatturazione` → `/api/documenti/voci` | sotto-risorsa, non rotta a sé | quelle righe sono i **candidati** a finire in un documento: appese a `/api/documenti` si leggono per quello che sono, e non serve inventare un terzo sostantivo di primo livello |
| Nome dell'interruttore | `ENABLE_MODULE_RICEVUTE` | è il modulo che produce ricevute. Va impostato su ogni Environment **prima** del deploy che lo legge: un modulo si accende solo col valore esatto `true`, quindi fra la variabile vecchia e la nuova la pagina sparisce in silenzio |
| Chi può riaprire una ricevuta | admin **e** socio intestatario | la colonna nei movimenti è inutile se il socio non può aprire il documento. Il controllo confronta `documento.socio_id` con la scheda di chi chiama, non il ruolo: un socio non apre la ricevuta di un altro |
| Da dove il movimento conosce la ricevuta | `LEFT JOIN` su `documento_emesso_voce` | il legame esiste già, l'indice unico `(tipo, riferimento_id)` lo rende una ricerca puntuale. Nessuna colonna nuova su `movimento_voucher`, quindi nessun dato duplicato da tenere allineato |
| Due schede invece di sezioni impilate | schede | le due viste rispondono a domande diverse e non si guardano insieme: impilate, la seconda resterebbe sotto una tabella paginata che può essere lunga decine di righe. Costa un componente `Tabs` che nel progetto non esiste ancora, ed è riutilizzabile |
| Filtri sopra le schede | condivisi | "cosa resta da documentare a Rossi" e "cosa gli ho già consegnato" sono la stessa domanda da due lati: ridigitare socio e periodo a ogni cambio di scheda sarebbe attrito senza motivo. Selezione e "mostra emesse" restano invece per scheda, perché appartengono a una sola |
| Colonna quasi sempre vuota | accettata | solo le ricariche sono voci documentabili, e solo dalla 003 in poi hanno un documento. L'alternativa — mostrarla solo quando almeno una riga ce l'ha — farebbe ballare la larghezza della tabella fra un filtro e l'altro |
| Codice della ricevuta al posto dell'icona | **codice** | un'icona dice "c'è una ricevuta", il codice dice *quale*: con l'icona bisognava scaricarla per saperlo. Il codice è anche il nome del file, quindi chi lo vede a schermo sa già cosa troverà sul disco. Nella tabella delle ricevute emesse prende il posto della colonna "Numero", che ripeteva lo stesso dato |
| Nome del file ricalcolato invece di `nome_file` | **ricalcolato** | il campo resta la verità del backend, ma le ricevute emesse prima della convenzione ne portano uno vecchio: derivarlo da anno e numero rende uniformi anche quelle, senza toccare i byte conservati. Vive in `utils/ricevuta.ts`, un punto solo per codice, nome e download |
| Dove sta il PDF | `BYTEA` nel database | 500 documenti in 5 anni fanno ~10 MB. Entra nel `pg_dump` che già c'è, si ripristina insieme alla riga che lo referenzia, e non introduce un bucket condiviso fra club — l'unico posto dove una configurazione sbagliata mostrerebbe la ricevuta di un'altra persona |
| Rigenerare invece di conservare | **scartata** | un documento consegnato deve restare identico per sempre. Se cambia l'intestazione, una rigenerazione produrrebbe un foglio diverso da quello che il socio ha in mano |
| Modello PDF precompilato | **scartato** | il modello fornito non ha campi modulo, quindi andrebbe riempito a coordinate fisse: cambiarlo richiederebbe di correggere anche il codice. Non si allunga per il dettaglio, e i suoi 253 KB verrebbero replicati in ogni documento |
| Logo dal branding, non caricato | **dal branding** | è già nel repository, già scelto per ambiente da `LOGO_FILE` e già validato in pipeline. Una seconda copia nel database potrebbe divergere da quella mostrata in testa a ogni pagina. In cambio spariscono la tabella binaria, tre rotte, il caricamento in base64 e la validazione MIME a runtime |
| `branding/` alla radice | sì | serve a due immagini, non più al solo frontend. Il prezzo è la copia in `frontend/public/` a ogni build, che è uno script di tre righe |
| Trigger delle build | percorsi extra per scope nell'analisi del diff | `branding/` è fuori da `backend/` e `frontend/`, quindi non farebbe partire niente. Si generalizza l'eccezione che esiste già per `scripts/seed-demo-data.sh` |
| Validazione branding: job o step | **job separato, step condizionato** | l'analisi del diff non è legata alle versioni ma alle cartelle: un commit che tocca solo `branding/` non farebbe partire nessuna build, quindi un controllo *dentro* una build non girerebbe proprio nel caso per cui esiste. Il job sta sempre in piedi (i `needs` a valle non incontrano uno *skipped*) e il controllo si attiva col flag |
| Validazione legata al flag | sì, `vars.ENABLE_MODULE_RICEVUTE` | senza il modulo il PNG non serve a nessuno: pretenderlo bloccherebbe la pipeline per un requisito inesistente |
| Intestazione e piè di pagina | nelle impostazioni | il **testo** cambia più spesso del logo e non è un artefatto di build: lì si modifica dall'app, senza deploy. Il logo invece è un file versionato |
| Logo mancante | ricevuta senza logo, con avviso nei log | rifiutare l'emissione di un documento per un elemento decorativo sarebbe sproporzionato |
| Ridimensionamento del logo | **nessuno a runtime**; `fit: [90, 90]` scala il disegno | `pdfkit` incorpora i byte originali e rimpicciolisce solo il riquadro: l'aspetto è sempre corretto, il peso no. Ricampionare vorrebbe dire `sharp` (binario nativo da ~10 MB) in un backend con tre dipendenze, per un'immagine che non arriva da un utente ma da un commit. Il limite si mette dove il file entra — nella pipeline — non a ogni emissione |
| Generatore | `pdfkit` | nessun browser, nessun wasm. L'Helvetica standard del PDF è metricamente equivalente all'Arial del modello, quindi non serve incorporare font |
| Importo in lettere | `n2words` (MIT, zero dipendenze) | provata sui casi critici: ventuno, ventotto, ventitré, centosessanta, centosessantotto, milleduecento — tutti corretti. Un'API esterna è stata scartata: metterebbe un servizio di terzi sul percorso di un'operazione irreversibile e manderebbe fuori l'importo pagato da una persona con nome e cognome |
| Bozze in stato `draft` | **non esistono** | il numero si assegna alla conferma, non all'anteprima. L'anteprima non scrive niente, quindi non ci sono bozze abbandonate da raccogliere né uno stato intermedio da spiegare |
| Il PDF dell'anteprima | **rigenerato** alla conferma | in anteprima il numero è provvisorio; i byte conservati sono quelli definitivi |
| `SEQUENCE` per anno | **scartata** | `nextval` non fa rollback: una transazione fallita **brucia** il numero e lascia un buco nella numerazione, che è esattamente ciò che una numerazione di ricevute non può avere |
| Concorrenza | contatore su riga, `INSERT … ON CONFLICT DO UPDATE … RETURNING` | atomico. Due admin simultanei non ricevono entrambi max+1: il secondo attende il lock e riceve il numero successivo. **Nessuna delle due emissioni fallisce**, e un rollback restituisce il numero |
| PDF generato dentro la transazione | sì | il documento contiene il numero, quindi le emissioni simultanee si serializzano per qualche decina di millisecondi. Con qualche ricevuta al giorno non è misurabile |
| Data del documento | oggi, non modificabile | la numerazione deve seguire l'ordine cronologico: una data libera permetterebbe la ricevuta 87 datata prima della 86 |
| Redirect da `/admin` | **nessuno** | scelta esplicita: i segnalibri sulla vecchia rotta danno 404 |
| Modulo separato per le ricevute | **scartato**, ma il codice è isolato | numerazione, documento e legame con le voci stanno in **una transazione su un database solo**. Spezzarli su due servizi imporrebbe di ricostruire a mano quella garanzia, proprio sulla parte che non può sbagliare |

## Rischi e impatti

**Lo spostamento di `branding/` può rompere il frontend in silenzio.** Vite
copia in `dist/` solo `frontend/public/`: senza lo script di copia i loghi
diventano immagini rotte in ogni pagina, e il controllo esistente in
`deploy-frontend.yml` — che verifica `LOGO_FILE` nel *repository*, non
nell'immagine — non se ne accorgerebbe. Da verificare guardando `dist/` dopo una
build, non solo il deploy.

**Il rename di `ENABLE_MODULE_FATTURAZIONE`** va sequenziato: prima si aggiunge
`ENABLE_MODULE_RICEVUTE` su tutti gli ambienti, poi si rilascia, poi si toglie
la vecchia. Al contrario, il modulo si spegne senza errori.

**La validazione riflette il flag di `development`**: `build-deploy.yml` è
tutto su quell'ambiente. Se un giorno la produzione avesse il modulo attivo e lo
sviluppo no, il controllo non girerebbe. È una divergenza da evitare a monte
più che da gestire qui.

**`valida-branding` fallirà al primo giro** a modulo attivo: oggi la cartella
contiene solo SVG.

**Il permesso di `GET /documenti/:id`** è l'unico punto in cui un socio tocca
questa feature, e l'unico in cui un errore esporrebbe il documento di un'altra
persona. Va testato in tutti e tre i casi: admin, intestatario, estraneo.

**L'immagine del backend cresce** della cartella branding (~200 KB oggi).

**La rimozione di `/api/fatturazione/emetti`** tocca la pagina delle ricevute, il
client, `openapi.yaml`, `bruno/` e i test della 001.

**Il percorso binario in `server.ts`** è l'unico punto in cui questa feature
modifica codice condiviso da tutte le rotte. Il cambiamento è additivo, ma va
verificato che le risposte JSON restino identiche.

**`/admin` senza redirect** restituisce 404 a chi ha il segnalibro. È voluto.

**`socio_id` con vincolo di integrità**: eliminare un socio con documenti
emessi diventa impossibile. È coerente con la 001, dove la cancellazione è già
bloccata per i soci con voci documentate.

**Il seed di esempio** produce voci già marcate come emesse senza documento. Con
la FK aggiunta restano valide, perché `documento_id` è NULL. Vale la pena
aggiungere al seed **una ricevuta vera**, o la colonna nuova non si vede mai in
demo.

**La prima ricevuta parte da 1**: se l'ingresso in servizio slittasse a dopo
l'inizio dell'anno e nel frattempo venissero emesse ricevute fuori da Clubby, la
numerazione si sovrapporrebbe. È una condizione operativa, non tecnica.

**Dipendenze nuove nel backend**: `pdfkit` e `n2words`. Entrambe MIT;
`n2words` non ha dipendenze proprie.

## Verifica

- **Suite API: 127/127** (era 126 prima della feature, con due file rinominati e
  riscritti sul nuovo processo). I casi nuovi stanno in
  `documenti-emissione.test.ts` (11) e `documenti-lettura.test.ts` (8).
- `npm run build --prefix backend` e `npm run build --prefix frontend` puliti;
  lint del frontend a **0 errori** (restano i 12 `exhaustive-deps` preesistenti).
- `openapi.yaml` riparsato dopo le modifiche: valido, 30 path, nessun `$ref` che
  punti a uno schema inesistente.
- Migrazione `003_ricevute.sql` applicata su un database che aveva già la 001 e
  la 002; `docker compose up migrazioni` la riconosce come applicata al secondo
  giro.
- `scripts/seed-demo-data.sh` eseguito per intero: nessun errore, e la pulizia
  rimuove i documenti dimostrativi prima dei soci (la FK verso `socio` non ha
  cascata e li bloccherebbe).

### Prova nel browser

Frontend e backend avviati su porte dedicate contro il database di sviluppo, con
le credenziali dimostrative del seed:

| Cosa | Esito |
|---|---|
| Pulsante "Emetti ricevuta" senza socio | spento, con il motivo nel tooltip |
| Con il socio scelto, senza voci | spento, tooltip "Seleziona almeno una voce" |
| Modale causale → anteprima | `Ricevuta n. 34/2026 — € 65,00`, `sessantacinque/00` |
| Conferma | emessa, avviso in pagina, file scaricato |
| Scheda "Ricevute emesse" | la ricevuta compare con l'icona del PDF |
| Filtri condivisi fra le schede | il socio scelto vale per entrambe |
| Movimenti del socio | 📄 sulla sola ricarica documentata; addebiti e ricariche libere senza |
| Impostazioni → card Ricevute | salva, e il riepilogo passa a "intestazione configurata" |

Il PDF prodotto dall'API è stato riestratto e contiene, nell'ordine:
intestazione dalle impostazioni, `RICEVUTA N. 41 / 2026 DEL 29/09/2026`,
`Ricevuto da:`, `La somma di: quaranta/00 (40,00)`, la causale, il dettaglio e
la clausola sul bollo. **1,9 KB** per una ricevuta con una riga di dettaglio —
il conto dei ~10 MB su cinque anni regge.

### Difetto trovato dalla prova nel browser

`handlers/impostazioni.ts` ha una **whitelist esplicita** dei campi scrivibili, e
le due chiavi nuove non erano state aggiunte: il salvataggio rispondeva `200` e
non scriveva niente. Nessun test lo copriva, perché la risposta era formalmente
un successo.

Corretto, e coperto da un caso nuovo che fa il **round-trip** PUT → GET invece
di fidarsi dello stato della risposta. Sopra la whitelist c'è ora un commento
che spiega il tranello a chi aggiungerà la prossima impostazione.

### Il logo non si trovava in sviluppo

Con un PNG in `branding/` e `LOGO_FILE` impostato, il backend continuava a
emettere ricevute senza logo:

```
[documenti] LOGO_FILE="clubby_local.png": nessun PNG/JPEG corrispondente
in …\Clubby\backend\branding
```

`logo.ts` risolve la cartella come `process.cwd()/branding`. Nell'immagine è
giusto — il backend gira da `/app` e il Dockerfile ci copia dentro `branding/`
— ma `npm run dev:backend` gira da `backend/`, e dopo lo spostamento della
cartella nella radice (questa stessa spec) lì non c'era più niente. Il difetto
esisteva solo in sviluppo, e si vedeva **solo aprendo il PDF**: il codice
tratta l'assenza del logo come esito normale, quindi niente errore, niente test
rosso, una riga di warning nel log.

Il rimedio **non** è insegnare a `logo.ts` a risalire di un livello: sarebbero
due modi diversi di trovare la stessa cartella, e lo sviluppo eserciterebbe un
percorso che in produzione non viene mai preso. `copia-branding.mjs` copia
invece `branding/` anche in `backend/branding/`, come già faceva per il
frontend, e la regola resta una sola — *`branding/` accanto al processo* —
identica in sviluppo e nell'immagine.

Verificato dalla cartella `backend/`: il logo risolve alla copia locale e il
PDF passa da 1,9 KB a 13,7 KB, con l'oggetto immagine dentro.

### Testata e voce di menù, verificate in browser

La **testata** è stata misurata intercettando le chiamate di `pdfkit`, non a
occhio: con il logo, immagine a `x = 449,3` (il bordo destro esatto: 449,3 + 90
= 539,3 = 595,3 − 56) e intestazione a `x = 56` allineata a sinistra su
`width = 377,3`, **entrambe a `y = 56`**. Senza logo l'intestazione usa tutti i
483,3 pt e il corpo risale da `y = 169,1` a `y = 116,5`.

La **voce di menù** è stata provata nei due stati su un'istanza vera: con
l'intestazione svuotata da Impostazioni la voce smette di essere un link e
compare il "?" che apre la spiegazione; riconfigurandola torna `/ricevute`
**senza ricaricare la pagina**, alla successiva apertura del menù.

Un'anteprima emessa dall'interfaccia sul backend reale risponde
`ricevuta_2026_60.pdf` e 13 775 byte: nome nuovo e logo davvero incorporato
(senza logo lo stesso documento sta in circa 1,9 KB).

### Non verificato

- Il job `valida-branding` non è mai girato: al primo push **fallirà**, a modulo
  attivo, finché i PNG non vengono aggiunti. È l'effetto voluto.
- La riga della demo nel seed si **salta in WSL**, che ha `psql` ma non `node`.
  Gira dentro l'immagine del backend e su una shell Windows con Node.
