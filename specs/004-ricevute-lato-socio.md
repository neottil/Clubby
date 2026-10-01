# 004 — Le ricevute dal lato del socio

## Stato

- [ ] Draft
- [ ] Approvata
- [ ] In test (utente)
- [x] Completata

**Versioni**: `backend 2.10.0`, `frontend 2.9.0` (minor entrambi: è una feature).
Authorizer non toccato.

## Problema

Dalla 003 il socio può riaprire una ricevuta intestata a lui, ma **solo se la
trova**. E la trova da un posto solo: la colonna nei movimenti del proprio
voucher.

Le voci che finiscono in una ricevuta sono tre. Il socio ne raggiunge una:

| Voce | Dove il socio la vede | Ricevuta raggiungibile |
|---|---|---|
| Ricarica del voucher | Voucher → movimenti | **sì** |
| Incontro non coperto da voucher | Incontri | no: la tabella non ha la colonna |
| Quota di tesseramento | da nessuna parte | no: la pagina è riservata all'admin |

Chi non ha comprato un voucher non ha nemmeno la prima: paga gli incontri a
parte, non ha movimenti, e la sua scheda voucher dice "Non hai un voucher
attivo". Per lui Clubby non mostra **nessuna** ricevuta, pur avendone di
intestate.

C'è poi una seconda cosa che oggi non si può chiedere all'applicazione, e che
vale anche per chi il voucher ce l'ha: *«l'incontro del 14 settembre è finito
su una ricevuta? quale?»*. È una domanda che si fa **guardando la riga**, e
nessuna riga risponde.

Infine, il tesseramento: un socio non vede né la propria scadenza né i propri
rinnovi, che sono dati suoi e che ha pagato.

## Obiettivo

Ogni riga che ha prodotto un incasso mostra al socio, accanto a sé, il codice
della ricevuta che la comprende — e il codice scarica il PDF. Vale per tutte e
tre le fonti, con lo stesso formato in tutte le tabelle.

## Fuori perimetro

- **Una pagina "Le mie ricevute"** (l'elenco dei documenti del socio). Era
  l'alternativa considerata e viene **scartata**: risponde a "dammi tutte le mie
  ricevute" ma non a "questo incontro su quale ricevuta sta?", che è la domanda
  che si fa dalla riga. Coprendo le tre fonti riga per riga, il socio arriva
  comunque a ogni ricevuta che lo riguarda. Resta una buona idea per dopo, come
  scorciatoia, non come rimedio.
- **Emettere, annullare o rinnovare dal lato socio.** Tutto ciò che il socio
  vede in questa spec è in sola lettura.
- **Paginare lo storico dei tesseramenti.** Sono pochi rinnovi per socio, uno
  all'anno: l'elenco completo è già la cosa giusta.
- **Rendere visibile al socio la quota degli altri**, o la situazione di
  tesseramento del club: è la vista dell'admin e resta sua.

## Requisiti

| # | Requisito | Test |
|---|---|---|
| R1 | Un incontro compreso in una ricevuta espone `documento_id`, `documento_anno` e `documento_numero`; gli altri li hanno a `null` | `documenti-lettura.test.ts` — elenco incontri prima e dopo l'emissione |
| R2 | Un socio vede il codice solo sui **propri** incontri: chiedendo `socio_id` altrui l'elenco resta il suo | `documenti-lettura.test.ts` — socio2 non trova l'incontro di socio1 |
| R3 | Lo storico dei tesseramenti di un socio espone gli stessi tre campi | `documenti-tesseramenti.test.ts` |
| R4 | `GET /api/tesseramenti/{socioId}` è concesso al **socio intestatario**; un altro socio riceve 403 | `documenti-tesseramenti.test.ts` — tre chiamate |
| R5 | `GET /api/tesseramenti` (l'elenco di tutti) resta riservato all'admin | idem — un socio riceve 403 |
| R6 | Il socio ha la pagina Tesseramenti con i propri rinnovi, la scadenza e le ricevute; non vede gli altri soci né il pulsante di rinnovo | verifica manuale |
| R7 | A modulo **ricevute** spento le colonne "Ricevuta" spariscono e i campi non compaiono nelle risposte | `moduli.test.ts` |
| R8 | A modulo **tesseramento** spento la pagina e le rotte restano 404 anche per il socio | `moduli.test.ts` |
| R9 | Il PDF scaricato dalle colonne nuove si chiama `ricevuta_<anno>_<numero>.pdf`, come da ogni altra tabella | `documenti-lettura.test.ts` |
| R10 | Un incontro compreso in una ricevuta **non** mostra "Modifica" ed "Elimina", che il backend rifiuterebbe | verifica manuale (vedi **Incongruenze**, punto 1) |
| R11 | Un istruttore **non** riceve i campi della ricevuta sugli incontri che ha tenuto per altri soci: né in elenco né sul singolo incontro | `documenti-lettura.test.ts` — `ambito=istruttore` e `GET /incontri/{id}` di un incontro altrui |

Coinvolti: il **socio** in Incontri e in Tesseramenti (le due viste nuove);
l'**admin** nelle stesse tabelle, dove la colonna compare per tutti. L'**istruttore**
vede la colonna sugli incontri che ha frequentato da socio, un istruttore è innanzitutto anche un socio,
quindi vede le sue ricevute. Vede già nella pagina Incontri gli incontri sostenuti come socio.

Da qui discende **R11**, che non è un dettaglio: nella pagina **Resoconto**
(`ambito=istruttore`) l'istruttore vede gli incontri che ha *tenuto*, e quelli
sono di **altri** soci. La ricevuta di quelle righe non è sua. Mostrargliela
significherebbe dirgli numero ed esistenza di un documento intestato a
qualcun altro — il PDF resterebbe protetto (`GET /api/documenti/{id}` risponde
403 a chi non è l'intestatario, dalla 003), ma il codice è già di per sé
un'informazione sul rapporto economico fra il club e quel socio.

La regola è quindi una sola, applicata dal **backend** e non dal frontend: i tre
campi della ricevuta compaiono solo dove chi chiama è l'intestatario — cioè per
l'admin sempre, e per gli altri solo sugli incontri in cui è lui il socio.

## Modello dati

**Nessuna variazione di schema.** Il legame voce → documento esiste dalla 002
(`documento_emesso_voce`, riferimento polimorfico `(tipo, riferimento_id)`) e la
003 vi ha agganciato `documento_id`. Qui si legge soltanto, con le stesse due
`LEFT JOIN` già usate da `listMovimenti` e da `listVoci`.

Il motivo per cui una `LEFT JOIN` su `documento_emesso_voce` è sicura dentro una
query paginata è l'indice unico `idx_documento_emesso_voce_riferimento` su
`(tipo, riferimento_id)`: garantisce **al più una riga** per incontro, quindi la
giuntura non moltiplica le righe. Se un giorno quell'indice sparisse, le
funzioni finestra `COUNT(*) OVER()` e `SUM(costo) OVER()` di `listIncontri`
comincerebbero a contare doppio **senza errori**, e il totale in fondo alla
pagina sarebbe sbagliato. Va scritto qui perché è invisibile leggendo la query.

## API

| Metodo | Percorso | Chi | Cosa cambia |
|---|---|---|---|
| GET | `/api/incontri` | invariato | ogni riga porta `documento_id`, `documento_anno`, `documento_numero` *(modulo ricevute)*, **tranne** con `ambito=istruttore` per chi non è admin |
| GET | `/api/incontri/{id}` | invariato | idem: i tre campi solo per l'admin o per il socio dell'incontro |
| GET | `/api/tesseramenti/{socioId}` | **admin o il socio stesso** | era solo admin; le righe portano i tre campi *(modulo ricevute)* |
| GET | `/api/tesseramenti` | admin | invariato |
| POST | `/api/tesseramenti` | admin | invariato |

Il controllo su `{socioId}` segue il modello già usato da incontri e voucher:
`getSocioByViewerId(auth.userId)` e confronto con il parametro. Non una rotta
`/me` a parte — sarebbe un secondo percorso per lo stesso dato, e il confronto
va fatto comunque.

**A modulo ricevute spento** i tre campi non compaiono affatto (le `LEFT JOIN`
non si aggiungono): il frontend legge lo stesso interruttore e non mostra la
colonna. **A modulo tesseramento spento** `/api/tesseramenti/*` risponde 404 a
chiunque, socio compreso — è la regola già in `server.ts`, che non cambia.

## Interfaccia

### Colonna "Ricevuta", identica ovunque

Stesso componente `ApriRicevuta` e stesso formato dei movimenti del voucher: il
codice `<anno>_<numero>` come testo cliccabile, vuoto dove non c'è ricevuta,
intestazione **Ricevuta**. La colonna compare solo a modulo ricevute attivo.

Va in coda in entrambe le tabelle nuove, dopo le colonne esistenti: è un
riferimento, non un dato dell'incontro o del rinnovo.

### Tesseramenti, due viste sotto lo stesso nome

La voce di menù oggi è sotto `user?.isAdmin`. Diventa visibile a chiunque, col
modulo attivo, ma mostra due cose diverse:

```
admin   situazione di tutti i soci, filtri, conteggi per stato, rinnovo
socio   la propria scadenza + storico dei propri rinnovi, in sola lettura
```

Non due pagine: la stessa, che sceglie in base al ruolo, come già fa
`ElencoIncontri` con `ambito`. Un socio senza rinnovi vede un elenco vuoto con
una riga che lo dice — non un errore.

### Schermo stretto

Le due tabelle sono già dentro `TableScroll`; la colonna in più allunga lo
scroll orizzontale ma non lo introduce. Il codice porta `whiteSpace: nowrap`,
come nei movimenti, perché `2026_60` spezzato su due righe non si legge.

## Decisioni

| Tema | Scelta | Motivo |
|---|---|---|
| Colonna sulla riga o elenco dei documenti | **colonna sulla riga** | la domanda del socio nasce guardando una riga ("questo incontro sta su una ricevuta?"). Un elenco di documenti risponde alla domanda inversa, e lascerebbe comunque la riga muta |
| Tesseramenti al socio o "Le mie ricevute" | **tesseramenti al socio** | copre l'unico caso che la colonna non raggiungeva, e per di più consegna un dato che il socio oggi non vede affatto: la propria scadenza. Una pagina nuova sarebbe servita solo a quel terzo di problema |
| Registrare un movimento anche senza voucher | **scartata** | "incontro non coperto da voucher" oggi *significa* "senza movimento": è la `WHERE NOT EXISTS (… movimento_voucher …)` su cui si regge una delle tre fonti delle ricevute. Creando un movimento per ogni incontro quella fonte si svuota, e la fatturabilità di quegli incontri sparisce in silenzio. Cambiare il modello del denaro per un problema di visualizzazione non si fa |
| Rotta `/api/tesseramenti/me` | **scartata** | il confronto con il socio di chi chiama va fatto comunque; una rotta in più sarebbe un secondo percorso per lo stesso dato |
| Voce di menù Tesseramenti per il socio | **stessa voce, contenuto diverso** | due voci ("Tesseramenti" e "Il mio tesseramento") direbbero che sono due cose, e sono la stessa vista da due lati |
| Paginare lo storico dei rinnovi | **no** | un rinnovo all'anno: la paginazione costerebbe più codice di quanto risparmi |

## Rischi e impatti

**Aprire `/api/tesseramenti/{socioId}` ai soci** è l'unico allargamento di
permessi della spec. Il rischio è quello classico: un socio che prova l'id di un
altro. Mitigato dallo stesso controllo già usato altrove e da un test che
verifica il 403 — non dalla sola assenza del link nell'interfaccia.

**La colonna sugli incontri tocca una query condivisa.** `listIncontri` serve
quattro viste (Incontri, Resoconto, Resoconti dell'admin, scheda socio) e
calcola i totali con funzioni finestra. Le due `LEFT JOIN` non devono cambiare
né il numero di righe né i totali: garantito dall'indice unico (vedi **Modello
dati**), e da verificare con un test che confronti `total` e `totale_costo`
prima e dopo un'emissione.

**La voce di menù Tesseramenti cambia pubblico.** Oggi un socio non la vede; da
domani sì. Chi ha il modulo attivo si ritroverà una voce in più per tutti i
soci: è voluto, ma va detto nel README perché è un cambiamento visibile senza
che nessuno l'abbia chiesto dal lato del club.

## Incongruenze trovate

Durante l'analisi, oltre al problema di questa spec.

### 1. "Rendicontato" non vuol dire "ha una ricevuta" — e l'elenco non sa chi ce l'ha

La dicitura **Rendicontato** nella colonna *Azioni* della tabella incontri
significa *«il club ha riconosciuto questo incontro all'istruttore»*: è la
rendicontazione del compenso (spec 001), e **non ha niente a che vedere con le
ricevute**. Un incontro può essere rendicontato e non documentato, o documentato
e non rendicontato: sono due fatti indipendenti, decisi in due momenti da due
pulsanti diversi.

Quindi le due tabelle non possono diventare una sola su quella base. Ma dentro
la domanda c'è un difetto vero:

> Un incontro **compreso in una ricevuta** mostra ancora "Modifica" ed
> "Elimina". Il backend li rifiuta entrambi — *«Per questo incontro è già stata
> emessa una ricevuta»* — ma l'utente lo scopre solo dopo aver cliccato.

Il commento in `ElencoIncontri.tsx` lo ammette già: *«Non vale per gli incontri
già registrati, che il backend rifiuta allo stesso modo ma che l'elenco non sa
riconoscere»*. Non lo sapeva perché il dato non arrivava. Con R1 arriva, quindi
**R10 chiude il difetto**: dove c'è una ricevuta, al posto dei pulsanti compare
lo stato, come già accade per "Rendicontato".

Vale anche la pena rendere le due etichette distinguibili: oggi "Rendicontato"
è l'unico stato possibile in quella colonna, domani sono due.

### 2. Il socio non vede la propria scadenza di tesseramento

Indipendentemente dalle ricevute: un socio non ha modo di sapere quando scade il
proprio tesseramento, pur essendo un dato suo e pagato da lui. Lo risolve R6, di
sponda.

### 3. La colonna "Ricevuta" resterà quasi sempre vuota fra gli incontri

Per chi ha un voucher, gli incontri sono pagati dal credito e **non** vengono
documentati singolarmente: la ricevuta sta sulla ricarica. Quindi per quei soci
la colonna è vuota per costruzione, non per mancanza di dati.

Non è un difetto — è la stessa scelta già presa nella 003 per i movimenti (una
colonna che balla fra un filtro e l'altro è peggio di una colonna vuota) — ma va
scritto, o al primo sguardo sembrerà rotta.

## Test dell'utente

Fra l'implementazione e la chiusura. L'implementazione finita porta la spec a
**In test**, non a Completata: da lì è l'utente a provare la feature sui propri
dati e sui propri casi.

In questa fase **la spec può ancora cambiare**: se la prova fa emergere un
requisito sbagliato, mancante o scomodo, si aggiorna la spec e si rimette mano
al codice, senza aprirne una nuova. È l'ultimo momento in cui farlo costa poco.

Esito da annotare qui: cosa è stato provato, cosa è stato corretto, cosa è stato
accettato così com'è.

**Stato: in attesa.** L'implementazione è chiusa e provata (vedi **Verifica**),
la spec resta in test finché l'utente non dà l'esito.

Cose che vale la pena provare per prime, perché sono quelle in cui un errore
non darebbe errore:

- Entrare **come socio senza voucher** e cercare la ricevuta di un incontro
  pagato a parte: è il caso che ha originato la spec.
- Entrare **come istruttore** e controllare il Resoconto: non deve comparire
  nessun riferimento alle ricevute dei soci a cui ha tenuto gli incontri.
- Provare a **modificare un incontro già documentato** dalla pagina Incontri:
  al posto dei pulsanti deve esserci "In ricevuta".
- Guardare la pagina **Tesseramenti** con un socio che non ha mai rinnovato, e
  con un account non ancora collegato a una scheda socio.

## Verifica

Automatica: **133/133** della suite API, con sei casi nuovi che coprono
R1–R5, R9 e R11 (i campi sulla riga documentata, il 403 sullo storico altrui,
l'assenza dei campi per l'istruttore, il nome del file ricostruito da anno e
numero).

Manuale in browser, su dati reali:

| Cosa | Esito |
|---|---|
| Incontri, admin | colonna **Ricevuta** con `2026_41`, e in *Azioni* "In ricevuta" al posto di Modifica/Elimina (R10) |
| Incontri, socio | solo i propri; colonna presente e vuota, perché i suoi incontri sono coperti dal voucher |
| Tesseramenti, socio | "Il mio tesseramento", scadenza in chiaro, storico dei rinnovi, ricevuta `2026_77` |
| Menù del socio | Voucher, Incontri, **Tesseramenti**, Info |
| Permessi del socio | storico proprio 200, storico altrui **403**, elenco di tutti **403** |
| Resoconto, istruttore | nessuna colonna Ricevuta; l'API non manda i tre campi (`[]`), mentre li manda sui suoi incontri da socio (R11) |
