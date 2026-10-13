# Dati di esempio (`scripts/seed-demo-data.sh`)

**ATTENZIONE: non è una "pulizia dei propri dati".** Lo script svuota OGNI
tabella dei due database — soci, incontri, voucher, ricevute, impostazioni e
account — e ricostruisce tutto da zero. Chiede conferma esplicita, a meno di
`SEED_FORZA=1`. Non va mai puntato a un ambiente che contiene dati veri.

Ogni esecuzione riparte da un database vuoto, quindi il risultato non dipende da
cosa c'era prima.

Lo script sta **fuori** dall'immagine Docker del backend, di proposito: azzera
due database interi, e una cosa del genere non deve trovarsi a portata di
`kubectl exec` su un pod di staging. Si esegue dalla propria macchina, puntando
esplicitamente al database che si vuole distruggere.

## Com'è organizzato

`scripts/seed-demo-data.sh` è il punto d'ingresso e non contiene logica: carica
con `source` i file di questa cartella, nell'ordine in cui vanno eseguiti.

| File | Contenuto |
|---|---|
| `configurazione.sh` | variabili d'ambiente, credenziali, nomi ed email dei dati di esempio |
| `lib-psql.sh` | esecuzione delle query sui due database |
| `lib-dominio.sh` | creazione delle entità: account, soci, voucher, ricariche, incontri, tesseramenti |
| `01-verifiche.sh` | i due database sono quelli attesi, l'authorizer risponde |
| `02-azzeramento.sh` | conferma e `TRUNCATE` dei due database |
| `03-anagrafiche.sh` | listino, account, schede socio, abilitazioni |
| `04-voucher-e-incontri.sh` | voucher, ricariche e incontri |
| `05-tesseramenti.sh` | quota e rinnovi |
| `06-chiusure.sh` | ciò che risulta già rendicontato |
| `07-ricevuta-dimostrativa.sh` | le tre ricevute vere, con il PDF: le uniche voci già documentate |
| `08-riepilogo.sh` | riepilogo finale, letto dal database |

## Prerequisiti

`bash`, `psql`, `curl`, `jq`, e `node` per la sola ricevuta dimostrativa — in
WSL, dove `node` non c'è, viene usato `node.exe` se disponibile. L'authorizer
deve essere avviato: gli account nascono dalla sua API di registrazione.

## Variabili

I default valgono per l'ambiente locale via `docker-compose`.

| Variabile | Effetto |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | database applicativo |
| `AUTH_DB_NAME`, `AUTH_DB_USER`, `AUTH_DB_PASSWORD` | database degli account |
| `AUTH_INTERNAL_URL` | URL dell'authorizer (default `http://localhost:3001`) |
| `DEMO_PASSWORD` | password degli account non admin (default `clubby2026`) |
| `SEED_ADMIN_PASSWORD` | password dell'admin; se assente si usa `INITIAL_ADMIN_PASSWORD` dall'ambiente o da `authorizer/.env` |
| `INITIAL_ADMIN_EMAIL` | email dell'admin; se assente si legge da `authorizer/.env`, altrimenti `admin@clubby.local` |
| `LOGO_FILE` | logo stampato sulla ricevuta (default `clubby_local.png`) |
| `SEED_FORZA=1` | salta la conferma interattiva dell'azzeramento |

Da WSL, dove `localhost` non è l'host Windows:

```bash
AUTH_INTERNAL_URL=http://$(ip route show default | cut -d" " -f3):3001 ./scripts/seed-demo-data.sh
```

Per eseguirlo contro un ambiente in cluster vedi
[docs/developer/operazioni-cluster.md](../../docs/developer/operazioni-cluster.md).

## Quali dati crea, e perché quelli

### Account

Ruolo nel club e privilegio admin sono **indipendenti**, e la demo lo mostra
tenendoli su account diversi: chi amministra non insegna, chi insegna non
amministra.

| Account | Ruolo | Password |
|---|---|---|
| `admin@clubby.local` | admin, **senza scheda socio** | `INITIAL_ADMIN_PASSWORD` |
| `marco.bianchi@clubby.dev` | istruttore | `DEMO_PASSWORD` |
| `elena.ferrari@clubby.dev` | istruttore | `DEMO_PASSWORD` |
| `luca.moretti@clubby.dev` | socio | `DEMO_PASSWORD` |
| `giulia.rinaldi@clubby.dev` | socio | `DEMO_PASSWORD` |
| `davide.costa@clubby.dev` | socio | `DEMO_PASSWORD` |
| `sara.vitali@clubby.dev` | socio, **senza voucher** | `DEMO_PASSWORD` |

Tranne l'admin, ogni account è collegato alla propria scheda socio. C'è inoltre
un socio "solo gestionale" **senza account** (Paolo Greco), per provare dalle
Impostazioni il collegamento manuale di un account registrato dopo.

Vitali ha un account ma nessun voucher, e paga gli incontri a parte: è il caso
della [spec 004](../../specs/004-ricevute-lato-socio.md), in cui il socio arriva
alle proprie ricevute solo dalla riga dell'incontro. Senza un account con cui
entrare non si potrebbe provare.

### Incontri

Una decina a testa: con due o tre, la pagina Incontri e i filtri per data si
guardano senza capire se funzionano.

| Socio | Incontri |
|---|---|
| Moretti | 11, tenuti da Bianchi |
| Rinaldi | 11, tenuti da Ferrari (saldo finale **negativo**) |
| Costa | 22, tenuti da Bianchi, su sette mesi |
| Ferrari | 11 come socia, tenuti da Bianchi |
| Vitali | 11 senza voucher, pagati a parte (compaiono in Ricevute) |
| Greco | nessuno: socio appena iscritto, ancora senza dati |

Costa è il caso "tanti dati", e serve a provare ciò che con pochi record non si
vede: 40 ricariche e 22 addebiti gli danno 62 movimenti (paginati a 25), e i
suoi incontri portano il Resoconto di Bianchi a 29 righe. È lì che si verifica
la cosa più delicata della selezione multipla: spuntare le prime venticinque,
premere "Carica altri" e ritrovarle ancora scelte.

### Voucher

Moretti e Rinaldi: acquistati con una ricarica e poi ricaricati durante l'anno
(tutte voci in Ricevute). Ferrari: il **solo** saldo importato da prima di
Clubby, che muove il saldo ma non è un incasso, quindi non compare fra le voci
documentabili. Costa: aperto sette mesi fa, con una ricarica promozionale che
accredita 30 a fronte di 25 pagati — in Ricevute devono comparire i 25.

### Rendicontazione e ricevute

Gli incontri anteriori a 40 giorni risultano già rendicontati, così la pagina
Resoconti ha da subito i due stati. Ogni istruttore conserva comunque incontri
ancora da rendicontare, che è il caso di partenza della pagina.

**Attenzione**: un incontro rendicontato o documentato non si può più modificare
né eliminare — è voluto, ed è il comportamento da provare.

Le ricevute dimostrative sono **tre vere**, una per tipo di voce, con il PDF
prodotto dallo stesso codice dell'applicazione, l'intestazione e il piè di pagina
scritti nelle impostazioni e il logo indicato da `LOGO_FILE`:

- su una **ricarica**: il socio la ritrova fra i movimenti del voucher;
- su un **incontro** di Vitali, che un voucher non ce l'ha: per lei quella riga è
  l'unico modo di arrivare alla propria ricevuta;
- sul **tesseramento** più vecchio: il socio la ritrova nello storico dei rinnovi.

Sono anche le **uniche voci già documentate**. Il seed non segna mai una voce
come emessa senza la sua ricevuta: l'applicazione non può produrre quello stato
(la riga in `documento_emesso_voce` nasce insieme al documento, nella stessa
transazione), e nella pagina Ricevute una voce bloccata con la colonna Ricevuta
vuota sembrerebbe un errore.

### Tesseramenti

Quota a 20 €: due soci attivi, uno in scadenza, uno scaduto, uno con due rinnovi
nello storico e due mai tesserati (Vitali e Greco). I rinnovi più vecchi restano
a 15 €, così lo storico mostra un importo diverso da quello in vigore.

Ogni tesseramento ha un numero di tessera (da `CL-0001` a `CL-0005`), tranne il
primo rinnovo di Rinaldi: un rinnovo registrato prima che il numero si
chiedesse, che nello storico compare con il trattino. I mai tesserati non hanno
numero, e nella card La tua tessera della pagina Voucher compaiono come "Mai
tesserato".

### Abilitazioni e listino

Bianchi a tutte le attività attive; Ferrari solo a Educazione, Dog Dance e
Mantrailing — per verificare che un istruttore non possa registrare un incontro
di un'attività non sua. Il listino ha cinque attività attive e una disattivata
(Agility), per provare la gestione del listino.
