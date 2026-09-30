# 001 — Rendicontazione degli incontri e voci fatturate

## Stato

- [ ] Draft
- [x] Approvata
- [x] Completata

**Versioni**: `backend 2.7.0`, `frontend 2.7.0`. L'authorizer non è stato
toccato e resta a `1.0.0`.

> Questa spec è stata scritta a posteriori, riordinando il piano di lavoro
> concordato in chat durante l'implementazione. È la prima del progetto: le
> successive nascono in stato Draft **prima** del codice.

## Problema

Il club riconosce agli istruttori una percentuale sugli incontri che tengono in
un periodo, e ai soci emette fatture o ricevute per ricariche, tesseramenti e
incontri non coperti da voucher. Nessuna delle due cose lasciava traccia: a ogni
giro l'admin doveva ricostruire a mano dove si era fermato il conteggio
precedente, incrociando date e importi, e nulla impediva di rendicontare o
fatturare due volte la stessa riga.

In più, la pagina Incontri e la scheda "Per socio" di Resoconti mostravano gli
stessi identici dati con due strade diverse.

## Obiettivo

L'admin può segnare quali incontri ha già rendicontato e quali voci ha già
fatturato; ciò che è chiuso sparisce dall'elenco salvo richiesta esplicita, non
si può più modificare né eliminare, e non può essere conteggiato una seconda
volta nemmeno da due amministratori che lavorano insieme.

## Fuori perimetro

- **Composizione del documento** di fatturazione (numero, data, intestazione,
  PDF): non esiste ancora come funzionalità. La relazione viene però predisposta
  ora, così quando ci sarà non servirà riscrivere le righe già create.
- **Registrazione del compenso** dell'istruttore (percentuale applicata, importo
  riconosciuto): si registra solo *quando* un incontro è stato rendicontato, non
  quanto è stato pagato.
- **Annullamento**: né la rendicontazione né l'emissione si disfano.
- **Anticipo nel frontend dello stato "fatturato"** sull'elenco degli incontri:
  quello stato vive nella tabella dei documenti emessi, e portarlo su ogni riga
  costerebbe una giuntura in più con il modulo Fatturazione potenzialmente
  spento. Il rifiuto arriva dal backend con il suo messaggio.

## Requisiti

| # | Requisito | Test |
|---|---|---|
| R1 | Un incontro nasce non rendicontato | `rendicontazione.test.ts` — "un incontro nasce non rendicontato" |
| R2 | Solo l'admin può rendicontare; istruttore e socio ricevono 403 | idem — "solo l'admin rendiconta (403...)" |
| R3 | Una richiesta senza incontri, o con id non validi, è rifiutata con 400 | idem — "rifiuta una richiesta senza incontri (400)" |
| R4 | Rendicontare risponde con quanti incontri lo sono diventati davvero; ripetere la stessa richiesta ne conta zero | idem — "rendiconta gli incontri scelti, e la seconda volta non li conta più" |
| R5 | L'elenco degli incontri li contiene tutti; `solo_da_rendicontare=1` restringe a quelli aperti, totali compresi | idem — "l'elenco li contiene ancora, salvo chiederli espressamente esclusi" |
| R6 | Un incontro rendicontato non si elimina, e il messaggio dice perché | idem — "un incontro rendicontato non si elimina..." |
| R7 | Un incontro rendicontato non si modifica, in nessun campo | idem — "un incontro rendicontato non si modifica, nemmeno nelle note" |
| R8 | Un incontro aperto si modifica ed elimina normalmente | idem — "un incontro non rendicontato si modifica e si elimina normalmente" |
| R9 | Le voci di Fatturazione nascono da fatturare | `fatturazione-emissione.test.ts` — "le voci nascono da fatturare" |
| R10 | L'emissione è riservata all'admin | idem — "l'emissione è riservata all'admin (403)" |
| R11 | Voci assenti o di tipo sconosciuto sono rifiutate con 400 | idem — "rifiuta voci assenti o di tipo sconosciuto (400)" |
| R12 | Una voce emessa sparisce dall'elenco a prescindere dai filtri, e torna con `includi_emesse=1` valorizzata di `emessa_il` | idem — "una voce emessa sparisce dall'elenco e torna solo se richiesta" |
| R13 | Riemettere la stessa voce non la conta due volte | idem — "riemettere la stessa voce non la conta due volte" |
| R14 | L'emissione funziona su tutti e tre i tipi di voce | idem — "funziona anche su un tipo diverso (tesseramento)" |
| R15 | Un incontro fatturato non si elimina né si modifica | idem — "un incontro fatturato non si elimina" |
| R16 | Un socio con incontri rendicontati o voci fatturate non si elimina | idem — "un socio con voci fatturate non si elimina" |
| R17 | A modulo `ENABLE_MODULE_FATTURAZIONE` spento le route rispondono 404 | verifica manuale (vedi **Verifica**) |

**Ruoli e pagine**: R1–R8 riguardano l'admin in **Resoconti** (dove sceglie e
marca) e l'istruttore in **Resoconto** (dove consulta lo stato dei propri
incontri senza poterlo cambiare). R9–R17 riguardano il solo admin, in
**Fatturazione**.

## Modello dati

Tutto in `backend/src/db/migrations/002_rendicontazione_e_fatturazione.sql`: le
due parti escono nella stessa versione, e due migrazioni che nessun ambiente
potrà mai applicare una senza l'altra sarebbero una separazione solo apparente.

```sql
ALTER TABLE incontro ADD COLUMN IF NOT EXISTS rendicontato_il TIMESTAMPTZ;
CREATE INDEX ... ON incontro(istruttore_id, data_incontro DESC)
  WHERE rendicontato_il IS NULL;          -- parziale: la parte chiusa cresce e non si interroga

CREATE TABLE IF NOT EXISTS documento_emesso_voce (
  id             UUID PRIMARY KEY,
  documento_id   UUID,                    -- nullable: il documento non esiste ancora
  tipo           VARCHAR(20) NOT NULL CHECK (tipo IN ('ricarica','tesseramento','incontro')),
  riferimento_id UUID NOT NULL,           -- niente FK: punta a tre tabelle diverse
  emessa_il      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX ... ON documento_emesso_voce(tipo, riferimento_id);
```

Entrambe additive, quindi dentro la regola delle due release.

L'indice unico non è solo un vincolo di correttezza: è ciò che rende sicuro
l'inserimento in blocco, perché `ON CONFLICT DO NOTHING` scarta i doppioni e il
numero di righe inserite è il numero di voci davvero fatturate ora.

## API

| Endpoint | Metodo | Note |
|---|---|---|
| `/api/incontri` | GET | nuovo parametro `solo_da_rendicontare=1` (solo il valore esatto) |
| `/api/incontri/rendiconta` | POST | `{ ids: string[] }` → `{ richiesti, rendicontati }`. Solo admin |
| `/api/incontri/:id` | PUT/DELETE | rifiutano con 400 se rendicontato o fatturato |
| `/api/soci/:id` | DELETE | rifiuta con 400 se il socio ha incontri rendicontati o voci fatturate |
| `/api/fatturazione` | GET | nuovo parametro `includi_emesse=1`; le righe portano `emessa_il` |
| `/api/fatturazione/emetti` | POST | `{ voci: [{tipo, id}] }` → `{ richieste, emesse }`. Solo admin |

Le due route di fatturazione stanno dietro `modulo: 'fatturazione'` e a modulo
spento rispondono **404, non 403**: un 403 direbbe a chi non ha quel modulo che
c'è qualcosa da comprare.

## Interfaccia

**Resoconti (admin)** — spariscono i tab: resta il solo resoconto per
istruttore. Sopra la tabella, uno switch "Mostra anche gli incontri già
rendicontati" e il pulsante "Rendiconta (n)". Prima colonna con le caselle;
quella in testata sceglie tutte le righe **caricate** e ha lo stato
indeterminato quando solo alcune lo sono. Le righe già rendicontate hanno la
casella spuntata e bloccata, e al posto dei pulsanti Modifica/Elimina la
dicitura "Rendicontato".

**Resoconto (istruttore)** — stesso switch, **acceso di default**: l'istruttore
apre la pagina per consultare il proprio lavoro, e nascondergli metà dello
storico sarebbe incomprensibile. Nessuna casella: vede, non decide.

**Incontri** — invariata, più i totali del periodo per il solo admin, che
compensano ciò che si perde togliendo la scheda "Per socio" da Resoconti.

**Fatturazione (admin)** — stessa interfaccia, con "Segna come fatturate (n)" e
lo switch "Mostra anche le voci già fatturate", **spento di default**.

La selezione vive in `frontend/src/hooks/useSelezione.ts`, condiviso dalle due
pagine: gli identificativi scelti sopravvivono a "Carica altri" e si azzerano a
ogni cambio di filtro.

Su schermo stretto le due tabelle guadagnano una colonna, su una densità già
alta: è il punto da guardare per primo in un'eventuale rifinitura.

## Decisioni

| Tema | Scelta | Motivo |
|---|---|---|
| Scheda "Per socio" di Resoconti | eliminata | mostrava gli stessi dati della pagina Incontri |
| Totali in Incontri | solo per l'admin | recuperano ciò che si perde con la scheda eliminata; a un socio direbbero poco |
| Incontri rendicontati | colonna `rendicontato_il` | serve solo il "quando"; il compenso è fuori perimetro |
| Voci fatturate | tabella dedicata, non colonne | le voci vengono da **tre** tabelle diverse: tre colonne e tre filtri sarebbero la stessa cosa scritta tre volte |
| `documento_emesso` | non creata | il documento non esiste ancora; `documento_id` nullable la aspetta |
| Selezione | tutte le **caricate**, non "tutte le filtrate" | "tutte le filtrate" avrebbe marcato righe mai viste, comprese quelle aggiunte fra il caricamento e il click |
| Default del filtro incontri | **non** attivo sulla lista | `GET /api/incontri` serve anche il socio e la vista di gestione, dove la rendicontazione non c'entra: come default avrebbe fatto sparire incontri a chi non c'entra nulla |
| Default del filtro fatturazione | attivo per tutti | quella pagina esiste per sapere che cosa resta da fatturare |
| Concorrenza | `WHERE ... IS NULL` e `ON CONFLICT DO NOTHING`, con il conteggio di ciò che è stato scritto | due admin sullo stesso periodo scelgono quasi certamente righe in comune |
| Modifica di ciò che è chiuso | bloccata sull'**intera riga** | bloccare il solo costo lasciava aperta la porta accanto: spostare la data fa uscire l'incontro dal periodo in cui è stato conteggiato |
| Eliminazione del socio | bloccata se ha righe chiuse | la cascata era la via di fuga da entrambi i divieti, e li avrebbe resi illusori |

## Rischi e impatti

- **Riferimento polimorfico senza foreign key**: `documento_emesso_voce` punta a
  tre tabelle, quindi il database non può garantire che l'origine esista. È il
  motivo per cui l'eliminazione va impedita a monte (R15, R16), e per cui la
  pulizia dei test e il seed rimuovono le righe rimaste a puntare nel vuoto.
- **Cambio di significato dei totali**: dove il filtro è attivo, i totali
  diventano "quanto resta da fare" invece di "totale del periodo". È voluto, ma
  va ricordato leggendo un numero.
- **Compatibilità**: entrambe le migrazioni sono additive e i due filtri sono
  opt-in, quindi un'applicazione ferma alla versione precedente continua a
  funzionare con il database migrato.

## Verifica

- **Suite API: 115/115**, di cui 15 casi nuovi (`rendicontazione.test.ts`,
  `fatturazione-emissione.test.ts`) che coprono R1–R16.
- **R17 a mano**: con `ENABLE_MODULE_FATTURAZIONE=false` entrambe le route
  rispondono 404. Non automatizzabile nella suite, perché il modulo è una
  variabile d'ambiente del server e i test girano contro un'istanza sola.
- **Migrazione da database vuoto**: baseline più migrazioni su un PostgreSQL
  usa-e-getta, e una seconda esecuzione che non riapplica nulla.
- **Frontend**: `npm run build` pulito, lint a 0 errori.
- **Dati di esempio**: `scripts/seed-demo-data.sh` crea da subito entrambi gli
  stati, con un socio da 62 movimenti e 29 incontri per un istruttore — sotto le
  25 righe la paginazione e la selezione fra pagine non si provano.
- **Non verificato a video**: colonna, switch e stato indeterminato della casella
  in testata non sono stati guardati in un browser, perché servirebbe un accesso
  con password.
