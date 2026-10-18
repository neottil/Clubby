# 010 — Incontro di gruppo, voucher per tutti i soci, incontri su un voucher in negativo

> Tre richieste raccolte insieme perché si toccano nello stesso punto: il form
> **Nuovo incontro** e il saldo del voucher che lo accompagna. Con il voucher
> per tutti ogni incontro passa dal voucher; con il saldo negativo permesso il
> pagamento può arrivare dopo l'incontro; con l'incontro di gruppo la conferma
> sul saldo riguarda tutti i soci del gruppo insieme.

## Stato

- [x] Draft
- [ ] Approvata
- [ ] In test (utente)
- [ ] Completata

**Versioni**: da compilare alla chiusura. Previsti `backend` minor (voucher
creato con il socio, nuova migrazione, `POST`/`PUT /api/incontri` che non
rifiutano più il saldo negativo) e `frontend` minor (form di gruppo, conferma
cumulativa, saldo importato nel form del socio). `authorizer` **non** si alza:
non è toccato.

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
   l'incontro l'ha fatto comunque: l'istruttore non ha modo di registrarlo.
3. **Chi paga di volta in volta è fuori dal voucher.** Un socio senza voucher
   paga ogni incontro a parte, e l'incontro finisce direttamente in Ricevute.
   Un pagamento che arriva dopo, o un incontro pagato in anticipo, non ha dove
   essere registrato: Clubby non sa dire se quel socio è in pari, in credito o in
   debito. Esistono quindi due modi di pagare con due percorsi diversi, e il
   secondo non tiene il conto.

## Obiettivo

Ogni socio ha un voucher, da quando nasce. Chi paga di volta in volta registra
nello stesso giorno ricarica e incontro, e un pagamento in ritardo resta visibile
come saldo negativo. Un incontro si registra anche per un socio con il voucher in
negativo, dopo una conferma. Dal form **Nuovo incontro** si compone un incontro
di gruppo, un socio per volta con la sua nota, e il salvataggio crea un incontro
per ciascuno, con **una sola** conferma per tutti i soci che resterebbero o
finirebbero sotto zero.

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
  incontri). Non richiesti: la conferma è l'unico freno.
- **Ricariche da parte dell'istruttore.** Le registra solo l'admin, come oggi.
  Se l'istruttore registra l'incontro prima che l'admin registri il pagamento,
  il saldo resta negativo finché la ricarica non arriva: è il credito in
  sospeso che la richiesta vuole poter vedere.
- **Riscrivere lo storico.** Gli incontri già registrati per soci senza voucher
  non ricevono un addebito a posteriori: restano pagati a parte, e in Ricevute,
  come sono stati.
- **Gli addebiti manuali.** `POST /api/voucher/{id}/movimenti` registra solo
  ricariche e resta così.

## Requisiti

Chi è coinvolto: l'**istruttore** nella pagina **Resoconto** e l'**admin**
nella pagina **Incontri**, che usano lo stesso componente
(`frontend/src/components/ElencoIncontri.tsx`), per i requisiti degli incontri;
l'**admin** nelle pagine **Soci** e **Voucher** per quelli del voucher. Il socio
vede il proprio voucher anche se paga di volta in volta.

### Voucher per tutti i soci

| # | Requisito | Test |
|---|---|---|
| R1 | Creare un socio crea anche il suo voucher, a saldo zero, nella stessa transazione: o nascono entrambi o nessuno dei due. | `attivita-soci.test.ts` › "un socio nuovo ha già il voucher, a saldo zero" |
| R2 | La migrazione `005_voucher_per_tutti.sql` crea un voucher a saldo zero per ogni socio che non ne ha uno. Ripetuta, non crea doppioni. | Manuale: migrazioni da zero su un database con un socio senza voucher, poi `SELECT count(*) FROM socio s WHERE NOT EXISTS (SELECT 1 FROM voucher v WHERE v.socio_id = s.id)` restituisce 0; una seconda esecuzione dell'`INSERT` non aggiunge righe |
| R3 | Il **saldo importato** (credito portato in Clubby da prima) passa nel form **Nuovo socio** della pagina Soci, dietro la stessa spunta di oggi: `POST /api/soci` accetta `saldo_iniziale` facoltativo, maggiore o uguale a zero, e lo scrive sul voucher creato con il socio. Nessuna ricarica viene registrata. | `attivita-soci.test.ts` › "un socio creato con saldo importato ha il voucher con quel saldo iniziale e nessuna ricarica"; `attivita-soci.test.ts` › "un saldo importato negativo è rifiutato (400)" |
| R4 | Nella pagina Voucher spariscono il pulsante **+ Nuovo voucher** e il suo form: un voucher non si crea più a mano. `POST /api/voucher` resta per questa release, ma su ogni socio risponde 400 "Il socio ha già un voucher"; si toglie nella release successiva. | `attivita-soci.test.ts` › "POST /api/voucher su un socio appena creato risponde 400"; manuale: pagina Voucher come admin, nessun pulsante + Nuovo voucher |
| R5 | Nella pagina Voucher il socio con una scheda vede sempre la card del proprio voucher: il messaggio "Non hai un voucher attivo" sparisce. | Manuale: dopo la migrazione, accesso come un socio che prima non aveva voucher; la card del voucher c'è, a saldo zero |
| R6 | Chi paga di volta in volta: l'admin registra lo stesso giorno la **Ricarica** con quanto pagato e l'incontro, che si addebita sul voucher come per tutti. Nessun percorso nuovo. *In attesa di decisione:* come si comporta la ricarica di un pagamento singolo con `RECHARGE_MODE` `percentage` o `map` (vedi [Domande aperte](#domande-aperte)). | Manuale: socio a saldo zero, ricarica di 30 € e incontro da 30 € nello stesso giorno, saldo finale 0 e la ricarica in Ricevute |
| R7 | In Ricevute un incontro compare come voce solo se non ha un addebito sul voucher, come oggi: restano documentabili gli incontri registrati prima di questa spec per i soci senza voucher, e nessun incontro nuovo vi entra. | `documenti-emissione.test.ts`, rivisto: "un incontro con addebito sul voucher non è una voce da documentare"; manuale dopo la migrazione: un incontro storico di Vitali non ancora documentato resta fra le voci |

### Incontri su un voucher in negativo

| # | Requisito | Test |
|---|---|---|
| R8 | Il backend crea un incontro, con il suo addebito, anche se il voucher del socio ha **già** un saldo negativo (oggi risponde 400). | `incontri-scrittura.test.ts` › "un incontro su un voucher già negativo viene creato con il suo addebito (201)", al posto dell'attuale "nessun nuovo addebito su un voucher già negativo (400)" |
| R9 | Il backend accetta anche la modifica del costo di un incontro il cui voucher, senza contare quell'addebito, è già negativo (oggi risponde 400). | `incontri-scrittura.test.ts` › "si modifica il costo di un incontro su un voucher già negativo e l'addebito si riallinea" |
| R10 | Incontro singolo (senza spunta di gruppo) e **Modifica**: la conferma resta quella di oggi, sul singolo socio, e scatta sia quando il saldo era già negativo sia quando ci finisce con questo incontro; dopo la conferma il salvataggio riesce. I saldi sono riletti al momento del salvataggio. | Manuale: nuovo incontro e Modifica del costo di un incontro di Rinaldi (negativo nel seed), conferma, salvataggio riuscito e saldo aggiornato in Voucher |

### Incontro di gruppo

| # | Requisito | Test |
|---|---|---|
| R11 | Nel form **Nuovo incontro**, e solo lì (non in Modifica), c'è la spunta **Incontro di gruppo**. Spenta, il form funziona esattamente come oggi. | Manuale: Resoconto come istruttore, la spunta c'è in Nuovo incontro e non in Modifica; spenta, Salva crea un incontro come prima |
| R12 | Accesa, compare il **riquadro del gruppo**: sotto il form, o alla sua destra quando la finestra è più larga del breakpoint `md` (768 px, costante accanto a `MOBILE_BREAKPOINT` in `useIsMobile.ts`). Il pulsante **Salva** del form diventa **Aggiungi**. | Manuale: spunta accesa a finestra larga, riquadro a destra; stringendo sotto 768 px, riquadro sotto; il pulsante del form si chiama Aggiungi |
| R13 | Al primo **Aggiungi** il riquadro prende dal form data, attività, costo e istruttore, e li mostra in testa; nel form quei campi diventano in sola lettura finché il gruppo ha almeno un socio. | Manuale: compilare data, attività e costo, scegliere un socio, Aggiungi; il riquadro mostra i quattro dati e nel form non sono più modificabili |
| R14 | Ogni **Aggiungi** aggiunge al riquadro un socio come chip, con sotto la sua nota (testo o Markdown, come nel form), e svuota nel form socio e note per il successivo. Un socio già nel gruppo non è più proponibile nel campo Socio. Aggiungi resta disabilitato senza socio o senza attività. | Manuale: aggiungere tre soci con note diverse, ognuno compare come chip con la propria nota; il campo Socio non propone i soci già aggiunti |
| R15 | Ogni chip ha un pulsante per togliere il socio dal gruppo. Tolto l'ultimo, i campi comuni del form tornano modificabili. Spegnere la spunta con soci nel gruppo chiede conferma e, se confermato, svuota il gruppo. | Manuale: togliere un socio, torna proponibile; togliere tutti, data e costo tornano modificabili; con due soci nel gruppo spegnere la spunta, conferma, il gruppo si svuota |
| R16 | Il riquadro ha il pulsante **Salva gruppo**, che dice quanti incontri crea ("Salva gruppo (3 incontri)") ed è disabilitato a gruppo vuoto. Salvando, il frontend chiama `POST /api/incontri` una volta per socio, una dopo l'altra, con i dati comuni e la nota di quel socio, e mostra l'avanzamento ("Salvataggio 2 di 3..."). Nessun endpoint nuovo. | `incontri-scrittura.test.ts` › "tre creazioni con gli stessi dati comuni e note diverse danno tre incontri, ciascuno con il proprio addebito e la propria nota"; manuale: scheda Rete del browser, tre `POST /api/incontri` in sequenza |
| R17 | Prima di salvare il gruppo, il frontend rilegge i saldi dei voucher e calcola per ogni socio il saldo dopo l'incontro. Se uno o più soci avrebbero un saldo negativo (già negativo, o portato sotto zero da questo incontro), compare **una sola** conferma che li elenca tutti, ciascuno con saldo attuale e saldo dopo l'incontro. **Annulla** non crea nessun incontro del gruppo. | Manuale: gruppo con Rinaldi (negativo nel seed), Moretti (saldo che basta) e un socio a saldo zero; la conferma elenca Rinaldi e il socio a saldo zero, non Moretti; Annulla non crea niente |
| R18 | Gli incontri creati insieme sono indipendenti: eliminarne o modificarne uno non tocca gli altri, né i loro addebiti. | `incontri-scrittura.test.ts` › "eliminando uno degli incontri di gruppo gli altri e i loro addebiti restano" |
| R19 | Esito parziale: se alcune creazioni falliscono, il riquadro resta aperto con i **soli** soci non registrati, ciascuno con l'errore ricevuto, e un avviso dice quanti incontri sono stati creati. **Salva gruppo** riprova solo quelli, senza duplicare gli incontri già creati. | Manuale: aggiungere al gruppo un socio nuovo, eliminarlo da un'altra scheda come admin, salvare; gli altri sono creati e nel riquadro resta solo quello eliminato con il suo errore |
| R20 | Se tutte le creazioni riescono il form si chiude e l'elenco si ricarica, come oggi per un incontro singolo. | Manuale: gruppo di due soci, Salva gruppo, il form si chiude e i due incontri compaiono in elenco |
| R21 | I permessi non cambiano: un socio non registra incontri, un istruttore registra solo per sé e solo nelle attività a cui è abilitato, per ognuno dei soci del gruppo. | `incontri-scrittura.test.ts` › "un socio non può registrare incontri (403)" e "un istruttore non registra attività a cui non è abilitato (400)", invariati |

### Documentazione

| # | Requisito | Test |
|---|---|---|
| R22 | Allineati: `frontend/src/manuale/sezioni.tsx` (voucher del socio, Resoconto, Incontri e Voucher dell'admin, Ricevute), `docs/readme/voucher-tesseramento-ricevute.md`, `docs/readme/funzionalita.md`, `backend/docs/openapi.yaml` (`POST /api/soci`, `POST /api/voucher` deprecato, `POST` e `PUT /api/incontri`), `bruno/clubby/` (crea socio, crea voucher, crea incontro), `scripts/seed/` e il suo README (Vitali con voucher, che paga di volta in volta), la sezione Database di `AGENTS.md` (Vitali "non ha voucher"). | Manuale: rilettura dei file elencati; `grep -rn -i "senza voucher\|già negativo\|non hai un voucher"` su `docs/`, `backend/docs/`, `frontend/src/`, `scripts/seed/`, `AGENTS.md` trova solo frasi sullo storico |

## Modello dati

Nessuna variazione di schema. Una migrazione di soli dati,
`backend/src/db/migrations/005_voucher_per_tutti.sql`:

```sql
INSERT INTO voucher (socio_id)
SELECT s.id FROM socio s
WHERE NOT EXISTS (SELECT 1 FROM voucher v WHERE v.socio_id = s.id);
```

È un'aggiunta, quindi ammessa: il codice vecchio, se girasse ancora durante il
rollout, troverebbe soltanto voucher a saldo zero che sa già gestire. Rende vera
per i dati esistenti la regola che R1 applica ai soci nuovi. L'indice unico
`idx_voucher_socio` impedisce i doppioni.

Un incontro di gruppo è fatto di N righe `incontro` normali, ciascuna con il
proprio movimento di addebito.

## API

Nessun endpoint nuovo. Cambia il comportamento di quattro esistenti:

- `POST /api/soci`: crea anche il voucher (R1); accetta `saldo_iniziale`
  facoltativo, `>= 0` (R3). Risposta invariata.
- `POST /api/voucher`: deprecato. Il codice non cambia; poiché ogni socio ha
  già un voucher risponde sempre 400 "Il socio ha già un voucher" (R4). Si
  toglie nella release successiva, con la riga in `ROUTES`.
- `POST /api/incontri`: non risponde più 400 quando il voucher del socio è già
  in negativo; crea l'incontro e l'addebito (R8).
- `PUT /api/incontri/{id}`: non risponde più 400 quando il nuovo costo si
  addebita su un voucher già in negativo (R9).

Nel backend si toglie il controllo "saldo già negativo" da `createMovimento` e
da `updateMovimentoImporto` (`backend/src/service/vouchers.service.ts`). Lì
dentro gli addebiti arrivano solo da `incontri.service`: `POST
/api/voucher/{id}/movimenti` rifiuta già tutto ciò che non è una ricarica, quindi
togliere il controllo non apre gli addebiti manuali.

La conferma resta una scelta dell'interfaccia, come oggi per il primo incontro
che porta sotto zero: il backend non chiede né registra niente.

## Interfaccia

**Form Nuovo incontro** (Resoconto per l'istruttore, Incontri per l'admin),
con la spunta **Incontro di gruppo** accesa:

```
┌ Nuovo incontro ─────────────┐  ┌ Gruppo ──────────────────────────┐
│ [x] Incontro di gruppo      │  │ 18/10/2026 · Educazione · 30,00 €│
│ Socio    [cerca socio...  ] │  │ Istruttore: Ferrari              │
│ Data     18/10/2026  (fisso)│  │                                  │
│ Attività Educazione  (fisso)│  │ (Rinaldi Giulia ×)               │
│ Costo    30,00       (fisso)│  │   Ha lavorato sul richiamo       │
│ Note     [               ]  │  │ (Moretti Luca ×)                 │
│                             │  │   —                              │
│      [Annulla] [Aggiungi]   │  │        [Salva gruppo (2 incontri)]│
└─────────────────────────────┘  └──────────────────────────────────┘
```

- sopra 768 px i due riquadri stanno affiancati; sotto, il gruppo va sotto il
  form, e le chip vanno a capo una per riga con la nota sotto;
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

**Esito parziale** (R19): un `Avviso` sopra il riquadro, per esempio "Creati 2
incontri su 3", e accanto alla chip rimasta l'errore ricevuto.

**Form Nuovo socio** (pagina Soci, admin): la spunta **Importa un saldo** e il
campo importo, spostati dal form Nuovo voucher che sparisce.

## Decisioni

| Tema | Scelta | Motivo |
|---|---|---|
| Voucher | Uno per ogni socio, creato con il socio | Richiesta dell'utente: un solo modo di pagare, che tiene il conto anche dei crediti in sospeso |
| Soci già esistenti senza voucher | Migrazione di soli dati che crea il voucher a saldo zero | Senza, la regola varrebbe solo per i soci nuovi e i due percorsi di pagamento resterebbero entrambi |
| Incontri storici pagati a parte | Restano senza addebito e documentabili in Ricevute | Sono stati pagati fuori dal voucher: addebitarli ora porterebbe in negativo soci che sono in pari |
| Saldo importato | Nel form Nuovo socio | Era l'unica ragione di aprire a mano un voucher; senza quel form deve stare dove il voucher nasce |
| `POST /api/voucher` | Deprecato per una release, poi rimosso | Un client vecchio riceve un 400 leggibile invece di un 404; la rimozione è una riga in `ROUTES` |
| Come si crea un gruppo | N chiamate a `POST /api/incontri` dal frontend, una per socio | Richiesta esplicita dell'utente: nessuna API apposita |
| Forma del gruppo | Spunta nel form esistente, riquadro a fianco o sotto, Salva che diventa Aggiungi, una chip per socio con la sua nota | Indicazione dell'utente: il form resta quello che gli istruttori conoscono |
| Dati comuni del gruppo | Data, attività, costo e istruttore, presi al primo Aggiungi e poi fissi | Sono i dati che rendono "lo stesso incontro"; l'attività si aggiunge a quelli indicati perché il costo ne deriva e il backend la richiede. Fissarli evita un gruppo in cui i primi soci hanno una data e gli ultimi un'altra |
| Note | Una per socio | Indicazione dell'utente: in un gruppo ogni socio lavora su cose sue |
| Chiamate in sequenza o in parallelo | In sequenza | L'esito per socio è ordinato e leggibile, l'avanzamento si mostra, e un gruppo ha pochi soci: il tempo in più non si nota |
| Esito parziale | Gli incontri creati restano; nel riquadro restano solo i soci falliti | Senza un'API di gruppo non c'è una transazione che li tenga insieme. Annullare a mano quelli già creati potrebbe fallire a sua volta; lasciarli e riprovare gli altri non duplica niente |
| Chi può creare un gruppo | Istruttore (Resoconto) **e** admin (Incontri) | È lo stesso componente e lo stesso form: escludere l'admin vorrebbe dire un ramo in più per togliere una funzione utile anche a lui |
| Quali soci entrano nella conferma | Chi dopo l'incontro avrebbe saldo negativo, sia che lo fosse già sia che ci finisca ora | È la regola della conferma che c'è già oggi per il singolo incontro: estenderla al gruppo senza cambiarne il criterio |
| Una conferma o una per socio | Una sola, cumulativa | Richiesta esplicita dell'utente; con dieci soci, dieci finestre di fila si confermano senza leggerle |
| Annulla sulla conferma | Non crea nessun incontro del gruppo | Chi annulla vuole ripensare il gruppo, non ritrovarsi metà degli incontri creati |
| Saldi usati per la conferma | Riletti al salvataggio | Quelli caricati all'apertura della pagina possono essere vecchi: un altro istruttore può aver registrato un incontro nel frattempo, e con un gruppo l'errore si moltiplica |
| Blocco del backend sul saldo già negativo | Rimosso, in creazione e in modifica | Altrimenti la conferma dell'interfaccia porta comunque a un errore, e con il voucher per tutti chi paga dopo l'incontro sarebbe bloccato al secondo incontro |
| Legame fra gli incontri del gruppo | Nessuno | Ognuno ha il suo addebito, il suo stato di rendicontazione e la sua eventuale ricevuta: un legame dovrebbe decidere cosa succede quando uno solo cambia, e nessuno l'ha chiesto |

## Domande aperte

| Tema | Domanda | Proposta |
|---|---|---|
| Pagamento singolo con `RECHARGE_MODE` `percentage` o `map` | In `percentage` una ricarica di 30 € per un incontro accredita 30 € più la percentuale, quindi chi paga di volta in volta riceverebbe un bonus a ogni incontro; in `map` si sceglie solo fra i tagli configurati, quindi 30 € non si registrano se non c'è un taglio da 30. | Una spunta **Pagamento alla pari** nel form Ricarica, disponibile in tutte le modalità: il credito accreditato è uguale a quanto pagato, senza percentuale e fuori dai tagli. In Ricevute entra come ogni ricarica |

## Alternative scartate

| Alternativa | Perché no |
|---|---|
| Endpoint `POST /api/incontri/gruppo` che crea tutti gli incontri in una transazione | Scartata dall'utente: si riusa la creazione esistente chiamandola più volte dal frontend. Il prezzo è l'esito parziale (R19) |
| Un solo campo Soci a scelta multipla, con una nota unica per tutti (prima bozza di questa spec) | Scartata dall'utente: ogni socio ha la sua nota, e il gruppo si compone dentro il form esistente con Aggiungi |
| Soci senza voucher che pagano a parte | Scartata dall'utente: due percorsi di pagamento, e quello "a parte" non tiene conto di crediti e debiti |
| Addebitare a posteriori gli incontri storici dei soci senza voucher | Sono già pagati: il saldo andrebbe negativo per soldi già incassati, e quelli già in ricevuta verrebbero contati due volte |
| Chiamate in parallelo (`Promise.all`) | Più veloci, ma l'esito arriva in ordine sparso e l'avanzamento non si può mostrare; il guadagno su pochi soci è trascurabile |
| Annullare gli incontri già creati se uno fallisce | Simula una transazione senza averla: l'eliminazione può fallire a sua volta e lascerebbe uno stato più confuso dell'esito parziale |
| Una conferma per ogni socio in negativo | Scartata dall'utente: l'avviso del gruppo è uno solo e riguarda tutti i soci in negativo |
| Conferma solo per chi è **già** in negativo | Cambierebbe la regola della conferma attuale, che scatta anche quando è questo incontro a portare sotto zero: due criteri diversi fra singolo e gruppo |
| Tenere il blocco del backend e chiedere conferma con un parametro (`forza: true`) | Sposterebbe nel backend una scelta che oggi sta nell'interfaccia, e chiederebbe di cambiare il corpo dell'API |
| Una colonna `gruppo_id` su `incontro` | Nessuna funzione la userebbe: vedi Fuori perimetro |

## Rischi e impatti

- **Voucher che scendono senza limite.** Togliendo il blocco, un socio può
  accumulare addebiti senza ricaricare. L'unico freno resta la conferma, che
  ora compare a ogni incontro di chi è in negativo. Il saldo negativo si vede già
  nella pagina Voucher, ed è proprio il credito in sospeso da recuperare.
- **Ricevute.** Da qui in avanti gli incontri non entrano più in Ricevute: entra
  la ricarica con cui il socio paga. Per chi paga di volta in volta la ricevuta
  si emette quindi sulla ricarica. La decisione della spec 001 sul riferimento
  `(tipo, riferimento_id)` non cambia; il tipo `incontro` resta per lo storico.
- **Test esistenti.** "nessun nuovo addebito su un voucher già negativo (400)"
  verifica il comportamento che si toglie e va sostituito (R8). `tests/api/dati.ts`
  crea i voucher con `POST /api/voucher`, che diventa un 400: si passa a
  `saldo_iniziale` sul socio e a una ricarica. I test di Ricevute che usano
  incontri pagati a parte non possono più crearli dalle API: un incontro storico
  senza addebito si prepara dal database, come eccezione dichiarata alla regola
  "i dati si creano dalle API", perché è proprio un dato che le API non producono più.
- **Seed.** `scripts/seed/lib-dominio.sh` inserisce i voucher a mano: va
  riallineato perché ogni socio ne abbia uno. Vitali passa a socio con voucher
  che paga di volta in volta (ricarica e incontro nello stesso giorno); i suoi
  incontri vecchi possono restare pagati a parte, per avere in Ricevute un caso
  di storico. Rinaldi resta in negativo, ed è il caso per provare R8, R10 e R17.
- **Esito parziale.** Un gruppo può restare registrato a metà se la rete cade o
  un socio viene eliminato nel frattempo. Mitigato da R19.
- **Doppio clic.** Durante il salvataggio Salva gruppo è disabilitato: senza, un
  secondo clic rifarebbe l'intero gruppo.
- **Eliminazione di un socio.** Il voucher se ne va in cascata con il socio,
  come oggi; un socio con ricariche già in ricevuta resta non eliminabile.

## Test dell'utente

Da compilare durante la prova.

## Verifica

Da compilare dopo il test dell'utente.
