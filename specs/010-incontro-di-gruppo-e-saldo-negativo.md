# 010 — Incontro di gruppo e incontri su un voucher in negativo

> Due richieste raccolte insieme perché si toccano nello stesso punto: il form
> **Nuovo incontro** e il controllo del saldo che lo accompagna. Con l'incontro
> di gruppo la conferma sul saldo non riguarda più un socio solo, ma tutti
> quelli del gruppo.

## Stato

- [x] Draft
- [x] Approvata
- [x] In test (utente)
- [x] Completata

Approvata dall'utente il 2026-10-18 e implementata lo stesso giorno.

**Versioni**: `backend 2.13.0`, `frontend 2.12.0`. `authorizer` **non** si
alza: non è toccato.

## Problema

1. **Un incontro con più soci si registra uno per volta.** Quando l'istruttore
   tiene un incontro a cui partecipano più soci (una lezione di gruppo), oggi
   deve aprire **+ Nuovo incontro** una volta per socio e ripetere ogni volta
   data, attività, costo e istruttore. È lento, e ripetendo i dati a mano è
   facile sbagliarne uno su un socio solo.
2. **Un socio con il voucher già in negativo non può fare altri incontri.**
   Oggi il backend rifiuta l'addebito, e con lui l'intero incontro, quando il
   saldo del voucher è **già** sotto zero (`createMovimento` in
   `backend/src/service/vouchers.service.ts`). Il frontend chiede già conferma
   quando un incontro porta il saldo sotto zero, ma se il saldo era negativo
   prima, dopo la conferma il salvataggio fallisce con un errore. Il socio
   l'incontro l'ha fatto comunque: l'istruttore non ha modo di registrarlo, e
   il conteggio del suo lavoro resta incompleto.

## Obiettivo

Dal form **Nuovo incontro** si compone un incontro di gruppo, un socio per volta
con la sua nota, e il salvataggio crea un incontro per ciascuno con gli stessi
dati comuni. Un incontro si registra anche per un socio con il voucher in
negativo, dopo una conferma; per un gruppo la conferma è **una sola** ed elenca
tutti i soci che resterebbero o finirebbero sotto zero.

## Fuori perimetro

- **Un'API di creazione multipla.** Per scelta dell'utente: il frontend chiama
  `POST /api/incontri` una volta per socio (vedi [Alternative scartate](#alternative-scartate)).
- **Un "gruppo" come entità.** Gli incontri creati insieme non restano legati:
  nessuna colonna, nessun identificativo di gruppo. Dopo il salvataggio ciascuno
  si modifica, si elimina e si rendiconta da solo, come oggi.
- **Modifica di gruppo.** **Modifica** resta sul singolo incontro, con il socio
  in sola lettura come oggi.
- **Costi diversi per socio nello stesso gruppo.** Il costo è uno per tutti; chi
  paga diversamente si corregge dopo con **Modifica**.
- **Limiti al saldo negativo** (soglia massima di scoperto, blocco dopo N
  incontri). Non richiesti: la conferma è l'unico freno, come già per il primo
  incontro che porta sotto zero.
- **Voucher per tutti i soci.** Valutato e scartato (vedi
  [Alternative scartate](#alternative-scartate)): chi non ha un voucher continua
  a pagare gli incontri a parte, come oggi.
- **Gli addebiti manuali.** `POST /api/voucher/{id}/movimenti` registra solo
  ricariche e resta così: gli addebiti continuano a nascere solo dagli incontri.

## Requisiti

Chi è coinvolto: l'**istruttore** nella pagina **Resoconto** e l'**admin**
nella pagina **Incontri**, che usano lo stesso componente
(`frontend/src/components/ElencoIncontri.tsx`). Il socio non registra incontri
e non vede niente di nuovo.

### Incontri su un voucher in negativo

| # | Requisito | Test |
|---|---|---|
| R1 | Il backend crea un incontro, con il suo addebito, anche se il voucher del socio ha **già** un saldo negativo (oggi risponde 400). | `incontri-scrittura.test.ts` › "un incontro su un voucher già negativo viene creato con il suo addebito (201)", al posto dell'attuale "nessun nuovo addebito su un voucher già negativo (400)" |
| R2 | Il backend accetta anche la modifica del costo di un incontro il cui voucher, senza contare quell'addebito, è già negativo (oggi risponde 400). | `incontri-scrittura.test.ts` › "si modifica il costo di un incontro su un voucher già negativo e l'addebito si riallinea" |
| R3 | Incontro singolo (senza spunta di gruppo) e **Modifica**: la conferma resta quella di oggi, sul singolo socio, e scatta sia quando il saldo era già negativo sia quando ci finisce con questo incontro; dopo la conferma il salvataggio riesce. I saldi sono riletti al momento del salvataggio. | Manuale: nuovo incontro e Modifica del costo di un incontro di Rinaldi (negativo nel seed), conferma, salvataggio riuscito e saldo aggiornato in Voucher |

### Incontro di gruppo

| # | Requisito | Test |
|---|---|---|
| R4 | Nel form **Nuovo incontro**, e solo lì (non in Modifica), c'è la spunta **Incontro di gruppo**. Spenta, il form funziona esattamente come oggi. | Manuale: Resoconto come istruttore, la spunta c'è in Nuovo incontro e non in Modifica; spenta, Salva crea un incontro come prima |
| R5 | Accesa, compare il **riquadro del gruppo**: sotto il form, o alla sua destra quando la finestra è più larga del breakpoint `md` (768 px, costante accanto a `MOBILE_BREAKPOINT` in `useIsMobile.ts`). Il pulsante **Salva** del form diventa **Aggiungi**. | Manuale: spunta accesa a finestra larga, riquadro a destra; stringendo sotto 768 px, riquadro sotto; il pulsante del form si chiama Aggiungi |
| R6 | Al primo **Aggiungi** il riquadro prende dal form data, attività, costo e istruttore, e li mostra in testa; nel form quei campi diventano in sola lettura finché il gruppo ha almeno un socio. | Manuale: compilare data, attività e costo, scegliere un socio, Aggiungi; il riquadro mostra i quattro dati e nel form non sono più modificabili |
| R7 | Ogni **Aggiungi** aggiunge al riquadro una riga su due colonne, **Socio** e **Note**: a sinistra il socio come chip, a destra la sua nota (testo o Markdown, come nel form). Svuota nel form socio e note per il successivo. Un socio già nel gruppo non è più proponibile nel campo Socio. Aggiungi resta disabilitato senza socio o senza attività. | Manuale: aggiungere tre soci con note diverse, ognuno compare come chip nella colonna Socio con la propria nota accanto, nella colonna Note; il campo Socio non propone i soci già aggiunti |
| R8 | Ogni chip ha un pulsante per togliere il socio dal gruppo. Tolto l'ultimo, i campi comuni del form tornano modificabili. Spegnere la spunta con soci nel gruppo chiede conferma e, se confermato, svuota il gruppo. | Manuale: togliere un socio, torna proponibile; togliere tutti, data e costo tornano modificabili; con due soci nel gruppo spegnere la spunta, conferma, il gruppo si svuota |
| R9 | Il riquadro ha il pulsante **Salva gruppo**, che dice quanti incontri crea ("Salva gruppo (3 incontri)") ed è disabilitato a gruppo vuoto. Salvando, il frontend chiama `POST /api/incontri` una volta per socio, una dopo l'altra, con i dati comuni e la nota di quel socio, e mostra l'avanzamento ("Salvataggio 2 di 3..."). Nessun endpoint nuovo. | `incontri-scrittura.test.ts` › "tre creazioni con gli stessi dati comuni e note diverse danno tre incontri, ciascuno con il proprio addebito e la propria nota"; manuale: scheda Rete del browser, tre `POST /api/incontri` in sequenza |
| R10 | Prima di salvare il gruppo, il frontend rilegge i saldi dei voucher e calcola per ogni socio con voucher il saldo dopo l'incontro. Se uno o più soci avrebbero un saldo negativo (già negativo, o portato sotto zero da questo incontro), compare **una sola** conferma che li elenca tutti, ciascuno con saldo attuale e saldo dopo l'incontro. **Annulla** non crea nessun incontro del gruppo. | Manuale: gruppo con Rinaldi (negativo nel seed), Moretti (saldo che basta) e un socio con saldo che va sotto zero; la conferma elenca Rinaldi e il terzo, non Moretti; Annulla non crea niente |
| R11 | I soci senza voucher (pagano a parte) non compaiono mai nella conferma, e non la fanno comparire. | Manuale: gruppo con Sara Vitali (senza voucher nel seed) e Moretti con saldo sufficiente, nessuna conferma |
| R12 | Gli incontri creati insieme sono indipendenti: eliminarne o modificarne uno non tocca gli altri, né i loro addebiti. | `incontri-scrittura.test.ts` › "eliminando uno degli incontri di gruppo gli altri e i loro addebiti restano" |
| R13 | Esito parziale: se alcune creazioni falliscono, il riquadro resta aperto con i **soli** soci non registrati, ciascuno con l'errore ricevuto, e un avviso dice quanti incontri sono stati creati. **Salva gruppo** riprova solo quelli, senza duplicare gli incontri già creati. | Manuale: aggiungere al gruppo un socio nuovo, eliminarlo da un'altra scheda come admin, salvare; gli altri sono creati e nel riquadro resta solo quello eliminato con il suo errore |
| R14 | Se tutte le creazioni riescono il form si chiude e l'elenco si ricarica, come oggi per un incontro singolo. | Manuale: gruppo di due soci, Salva gruppo, il form si chiude e i due incontri compaiono in elenco |
| R15 | I permessi non cambiano: un socio non registra incontri, un istruttore registra solo per sé e solo nelle attività a cui è abilitato, per ognuno dei soci del gruppo. | `incontri-scrittura.test.ts` › "un socio non può registrare incontri (403)" e "un istruttore non registra attività a cui non è abilitato (400)", invariati |

### Documentazione

| # | Requisito | Test |
|---|---|---|
| R16 | Allineati: `frontend/src/manuale/sezioni.tsx` (Resoconto e Incontri dell'admin), `docs/readme/voucher-tesseramento-ricevute.md`, `docs/readme/funzionalita.md`, `backend/docs/openapi.yaml` (descrizione di `POST /api/incontri` e `PUT /api/incontri/{id}`), `bruno/clubby/incontri/03_crea_incontro.bru`. | Manuale: rilettura delle sezioni elencate; `grep -rn "già negativo"` su `docs/`, `backend/docs/`, `frontend/src/manuale/` non trova frasi che descrivono il vecchio rifiuto |

## Modello dati

Nessuna variazione di schema. Un incontro di gruppo è fatto di N righe
`incontro` normali, ciascuna con il proprio movimento di addebito quando il
socio ha un voucher.

## API

Nessun endpoint nuovo. Cambia il comportamento di due esistenti:

- `POST /api/incontri`: non risponde più 400 quando il voucher del socio è già
  in negativo; crea l'incontro e l'addebito (R1). Corpo, risposta e permessi
  invariati.
- `PUT /api/incontri/{id}`: non risponde più 400 quando il nuovo costo si
  addebita su un voucher già in negativo (R2).

Nel backend si toglie il controllo "saldo già negativo" da `createMovimento` e
da `updateMovimentoImporto` (`backend/src/service/vouchers.service.ts`). Lì
dentro gli addebiti arrivano solo da `incontri.service`: `POST
/api/voucher/{id}/movimenti` rifiuta già tutto ciò che non è una ricarica, quindi
togliere il controllo non apre gli addebiti manuali. Vanno aggiornati anche i
commenti di `createIncontro` e `updateIncontro`, che descrivono il vecchio
rifiuto.

La conferma resta una scelta dell'interfaccia, come oggi per il primo incontro
che porta sotto zero: il backend non chiede né registra niente.

## Interfaccia

**Form Nuovo incontro** (Resoconto per l'istruttore, Incontri per l'admin),
con la spunta **Incontro di gruppo** accesa:

```
┌ Nuovo incontro ─────────────┐  ┌ Gruppo ──────────────────────────┐
│ [x] Incontro di gruppo      │  │ 18/10/2026 · Educazione · 30,00 €│
│ Socio    [cerca socio...  ] │  │ Istruttore: Ferrari              │
│ Data     18/10/2026  (fisso)│  │ SOCIO              NOTE          │
│ Attività Educazione  (fisso)│  │ (Rinaldi Giulia ×) Ha lavorato   │
│ Costo    30,00       (fisso)│  │                    sul richiamo  │
│ Note     [               ]  │  │ (Moretti Luca ×)   —             │
│                             │  │                                  │
│      [Annulla] [Aggiungi]   │  │        [Salva gruppo (2 incontri)]│
└─────────────────────────────┘  └──────────────────────────────────┘
```

- sopra 768 px i due riquadri stanno affiancati; sotto, il gruppo va sotto il
  form;
- nel riquadro ogni socio è una riga su due colonne, Socio e Note, con la
  stessa griglia su tutte le righe (circa 2/5 e 3/5), così le note restano
  allineate; anche su schermo stretto le colonne restano due;
- il campo Socio è lo stesso `SocioSelect` di oggi, con le opzioni filtrate;
- le chip seguono gli stili condivisi di `frontend/src/styles/ui.ts`: se uno
  stile per le chip non c'è ancora, si aggiunge lì e non nel componente;
- Annulla chiude il form e scarta il gruppo, come oggi scarta i campi.

**Conferma sul saldo**: resta il `confirm` del browser già usato oggi, con un
testo che elenca i soci, uno per riga:

```
Questi soci avranno il voucher in negativo:

Rinaldi Giulia: saldo -5,00 €, dopo l'incontro -35,00 €
Costa Davide: saldo 10,00 €, dopo l'incontro -20,00 €

Vuoi registrare comunque gli incontri?
```

**Esito parziale** (R13): un `Avviso` sopra il riquadro, per esempio "Creati 2
incontri su 3", e accanto alla chip rimasta l'errore ricevuto.

Il socio non vede niente di nuovo: i suoi incontri restano in sola lettura.

## Decisioni

| Tema | Scelta | Motivo |
|---|---|---|
| Come si crea un gruppo | N chiamate a `POST /api/incontri` dal frontend, una per socio | Richiesta esplicita dell'utente: nessuna API apposita |
| Forma del gruppo | Spunta nel form esistente, riquadro a fianco o sotto, Salva che diventa Aggiungi, una chip per socio con la sua nota | Indicazione dell'utente: il form resta quello che gli istruttori conoscono |
| Dati comuni del gruppo | Data, attività, costo e istruttore, presi al primo Aggiungi e poi fissi | Sono i dati che rendono "lo stesso incontro"; l'attività si aggiunge a quelli indicati perché il costo ne deriva e il backend la richiede. Fissarli evita un gruppo in cui i primi soci hanno una data e gli ultimi un'altra |
| Note | Una per socio | Indicazione dell'utente: in un gruppo ogni socio lavora su cose sue |
| Chiamate in sequenza o in parallelo | In sequenza | L'esito per socio è ordinato e leggibile, l'avanzamento si mostra, e un gruppo ha pochi soci: il tempo in più non si nota |
| Esito parziale | Gli incontri creati restano; nel riquadro restano solo i soci falliti | Senza un'API di gruppo non c'è una transazione che li tenga insieme. Annullare a mano quelli già creati potrebbe fallire a sua volta; lasciarli e riprovare gli altri non duplica niente |
| Chi può creare un gruppo | Istruttore (Resoconto) **e** admin (Incontri) | È lo stesso componente e lo stesso form: escludere l'admin vorrebbe dire un ramo in più per togliere una funzione utile anche a lui |
| Quali soci entrano nella conferma | Chi ha un voucher e dopo l'incontro avrebbe saldo negativo, sia che lo fosse già sia che ci finisca ora | È la regola della conferma che c'è già oggi per il singolo incontro: estenderla al gruppo senza cambiarne il criterio. Chi non ha voucher paga a parte e non ha un saldo |
| Una conferma o una per socio | Una sola, cumulativa | Richiesta esplicita dell'utente; con dieci soci, dieci finestre di fila si confermano senza leggerle |
| Annulla sulla conferma | Non crea nessun incontro del gruppo | Chi annulla vuole ripensare il gruppo, non ritrovarsi metà degli incontri creati |
| Saldi usati per la conferma | Riletti al salvataggio | Quelli caricati all'apertura della pagina possono essere vecchi: un altro istruttore può aver registrato un incontro nel frattempo, e con un gruppo l'errore si moltiplica |
| Blocco del backend sul saldo già negativo | Rimosso, in creazione e in modifica | Altrimenti la conferma dell'interfaccia porta comunque a un errore. Tenerlo solo in modifica lascerebbe un incontro registrabile ma non correggibile |
| Legame fra gli incontri del gruppo | Nessuno | Ognuno ha il suo addebito, il suo stato di rendicontazione e la sua eventuale ricevuta: un legame dovrebbe decidere cosa succede quando uno solo cambia, e nessuno l'ha chiesto |

## Alternative scartate

| Alternativa | Perché no |
|---|---|
| Endpoint `POST /api/incontri/gruppo` che crea tutti gli incontri in una transazione | Scartata dall'utente: si riusa la creazione esistente chiamandola più volte dal frontend. Il prezzo è l'esito parziale (R13) |
| Un solo campo Soci a scelta multipla, con una nota unica per tutti (prima bozza di questa spec) | Scartata dall'utente: ogni socio ha la sua nota, e il gruppo si compone dentro il form esistente con Aggiungi |
| Un voucher per ogni socio, creato con il socio, e chi paga di volta in volta che registra ricarica e incontro nello stesso giorno (seconda bozza di questa spec) | Proposta dall'utente e ritirata il 2026-10-18. Con `RECHARGE_MODE` `percentage` la ricarica di un pagamento singolo riceverebbe la maggiorazione, e con `map` un importo che non è un taglio non si registrerebbe: un socio che paga di volta in volta non deve avere il trattamento delle ricariche. Si resta con i soci senza voucher che pagano a parte |
| Chiamate in parallelo (`Promise.all`) | Più veloci, ma l'esito arriva in ordine sparso e l'avanzamento non si può mostrare; il guadagno su pochi soci è trascurabile |
| Annullare gli incontri già creati se uno fallisce | Simula una transazione senza averla: l'eliminazione può fallire a sua volta e lascerebbe uno stato più confuso dell'esito parziale |
| Una conferma per ogni socio in negativo | Scartata dall'utente: l'avviso del gruppo è uno solo e riguarda tutti i soci in negativo |
| Conferma solo per chi è **già** in negativo | Cambierebbe la regola della conferma attuale, che scatta anche quando è questo incontro a portare sotto zero: due criteri diversi fra singolo e gruppo |
| Tenere il blocco del backend e chiedere conferma con un parametro (`forza: true`) | Sposterebbe nel backend una scelta che oggi sta nell'interfaccia (il primo sotto zero si conferma solo lì), e chiederebbe di cambiare il corpo dell'API |
| Una colonna `gruppo_id` su `incontro` | Nessuna funzione la userebbe: vedi Fuori perimetro |

## Rischi e impatti

- **Voucher che scendono senza limite.** Togliendo il blocco, un socio può
  accumulare addebiti senza ricaricare. L'unico freno resta la conferma, che
  però ora compare a ogni incontro di chi è in negativo. Il saldo negativo si
  vede già nella pagina Voucher.
- **Esito parziale.** Un gruppo può restare registrato a metà se la rete cade o
  un socio viene eliminato nel frattempo. Mitigato da R13: si vede chi manca e
  si riprova solo quello.
- **Doppio clic.** Durante il salvataggio Salva gruppo è disabilitato: senza, un
  secondo clic rifarebbe l'intero gruppo.
- **Test esistente.** "nessun nuovo addebito su un voucher già negativo (400)"
  in `tests/api/incontri-scrittura.test.ts` verifica proprio il comportamento
  che si toglie: va sostituito (R1), non lasciato fallire. Il saldo di
  `socio2` previsto in `ATTESE` cambia dopo quel test, e i test che lo leggono
  dopo vanno ricontrollati.
- **Seed.** `scripts/seed/04-voucher-e-incontri.sh` porta già Rinaldi in
  negativo, e Vitali è senza voucher: nessuna modifica, e sono i casi giusti per
  provare R1, R3, R10 e R11.
- **Ricevute.** Nessun impatto: gli incontri coperti da voucher non finiscono in
  Ricevute, quelli di soci senza voucher sì, uno per socio come oggi.

## Implementazione

- Backend: tolto il controllo "saldo già negativo" da `createMovimento` e
  `updateMovimentoImporto` (`backend/src/service/vouchers.service.ts`), commenti
  di `createIncontro` e `updateIncontro` allineati.
- Frontend: la composizione e il salvataggio del gruppo stanno in
  `ElencoIncontri.tsx`; il riquadro è un componente di sola presentazione,
  `frontend/src/components/RiquadroGruppo.tsx`. `MD_BREAKPOINT` e `useSopraMd`
  stanno in `frontend/src/hooks/useIsMobile.ts`, gli stili `chip` e
  `chipRimuovi` in `frontend/src/styles/ui.ts`.
- Test: in `tests/api/incontri-scrittura.test.ts` il caso del 400 è sostituito
  dai due di R1 e R2, e il blocco "incontro di gruppo" copre R9 e R12. Suite
  completa: 165 test, tutti verdi.
- Prova nel browser (dati del seed, come Ferrari): gruppo con Rinaldi, Moretti e
  Vitali; la conferma ha elencato solo Rinaldi, e sono nati tre incontri con le
  rispettive note. Riquadro a destra a 1280 px, sotto a 600 px.

## Test dell'utente

- 2026-10-18: l'utente chiede socio e note **su due colonne** nel riquadro
  Gruppo, invece della nota sotto la chip. Corretti R7 e la sezione
  Interfaccia; implementato in `RiquadroGruppo.tsx` con una griglia comune a
  tutte le righe e l'intestazione Socio / Note. Provato a 1280 e a 600 px.
- 2026-10-18: in una nota Markdown che inizia con un titolo compariva quella
  che sembrava una riga vuota. Era il margine superiore del titolo (e
  l'inferiore dell'ultimo blocco). Tolti in `MarkdownEditor.tsx` per la vista
  in sola lettura (`.cm-markdown-view`): vale anche per la modale delle note.
  Fuori dal perimetro della spec, ma emerso provandola.

## Verifica

Da compilare dopo il test dell'utente.
