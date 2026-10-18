# 010 — Incontro di gruppo e incontri su un voucher in negativo

> Due richieste raccolte insieme perché si toccano nello stesso punto: il form
> **Nuovo incontro** e il controllo del saldo che lo accompagna. Con l'incontro
> di gruppo la conferma sul saldo non riguarda più un socio solo, ma tutti
> quelli del gruppo.

## Stato

- [x] Draft
- [ ] Approvata
- [ ] In test (utente)
- [ ] Completata

**Versioni**: da compilare alla chiusura. Previsti `backend` minor (cambia il
comportamento di `POST`/`PUT /api/incontri`) e `frontend` minor (form di
gruppo, conferma cumulativa). `authorizer` **non** si alza: non è toccato.

## Problema

1. **Un incontro con più soci si registra uno per volta.** Quando l'istruttore
   tiene un incontro a cui partecipano più soci (una lezione di gruppo), oggi
   deve aprire **+ Nuovo incontro** una volta per socio e ripetere ogni volta
   data, attività, costo e note. È lento, e ripetendo i dati a mano è facile
   sbagliarne uno su un socio solo.
2. **Un socio con il voucher già in negativo non può fare altri incontri.**
   Oggi il backend rifiuta l'addebito, e con lui l'intero incontro, quando il
   saldo del voucher è **già** sotto zero (`createMovimento` in
   `backend/src/service/vouchers.service.ts`). Il frontend chiede già conferma
   quando un incontro porta il saldo sotto zero, ma se il saldo era negativo
   prima, dopo la conferma il salvataggio fallisce con un errore. Il socio
   l'incontro l'ha fatto comunque: l'istruttore non ha modo di registrarlo, e
   il conteggio del suo lavoro resta incompleto.

## Obiettivo

Dal form **Nuovo incontro** si scelgono uno o più soci, e il salvataggio crea un
incontro per ciascuno, con gli stessi dati. Un incontro si registra anche per
un socio con il voucher in negativo, dopo **una sola** conferma che elenca tutti
i soci del gruppo il cui saldo resterebbe o finirebbe sotto zero.

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
- **Gli addebiti manuali.** `POST /api/voucher/{id}/movimenti` registra solo
  ricariche e resta così: gli addebiti continuano a nascere solo dagli incontri.

## Requisiti

Chi è coinvolto: l'**istruttore** nella pagina **Resoconto** e l'**admin**
nella pagina **Incontri**, che usano lo stesso componente
(`frontend/src/components/ElencoIncontri.tsx`). Il socio non registra incontri
e non vede niente di nuovo.

| # | Requisito | Test |
|---|---|---|
| R1 | Nel form **Nuovo incontro** il campo Socio permette di aggiungere più soci: ogni socio scelto compare in un elenco sotto il campo, con un pulsante per toglierlo. Un socio già scelto non è più proponibile nel campo. | Manuale: Resoconto come istruttore, aggiungere tre soci, verificare che il terzo non proponga i primi due e che togliendone uno torni proponibile |
| R2 | **Salva** resta disabilitato finché non c'è almeno un socio e un'attività. Con più di un socio il pulsante dice quanti incontri crea (es. "Salva (3 incontri)"). | Manuale: form vuoto con attività scelta, Salva disabilitato; aggiunti tre soci, il pulsante dice "Salva (3 incontri)" |
| R3 | Salvando con N soci il frontend chiama `POST /api/incontri` N volte, una per socio e una dopo l'altra, con la stessa data, attività, costo, istruttore e note. Nessun endpoint nuovo. | `incontri-scrittura.test.ts` › "tre creazioni con gli stessi dati danno tre incontri, ciascuno con il proprio addebito"; manuale: scheda Rete del browser, tre `POST /api/incontri` in sequenza |
| R4 | Gli incontri creati insieme sono indipendenti: eliminarne o modificarne uno non tocca gli altri, né i loro addebiti. | `incontri-scrittura.test.ts` › "eliminando uno degli incontri di gruppo gli altri e i loro addebiti restano" |
| R5 | Esito parziale: se alcune creazioni falliscono, il form resta aperto con i **soli** soci non registrati, e un avviso dice quanti incontri sono stati creati e, per ogni socio rimasto, l'errore ricevuto. Salvare di nuovo riprova solo quelli, senza duplicare gli incontri già creati. | Manuale: aggiungere al gruppo un socio, eliminarlo da un'altra scheda come admin, salvare; verificare che gli altri siano creati e che nel form resti solo quello eliminato con il suo errore |
| R6 | Se tutte le creazioni riescono il form si chiude e l'elenco si ricarica, come oggi per un incontro singolo. | Manuale: gruppo di due soci, salvare, il form si chiude e i due incontri compaiono in elenco |
| R7 | In **Modifica** il socio resta uno solo e in sola lettura, come oggi. | Manuale: Modifica su un incontro creato in gruppo, il campo Socio è il testo del solo socio di quell'incontro |
| R8 | Il backend crea un incontro, con il suo addebito, anche se il voucher del socio ha **già** un saldo negativo (oggi risponde 400). | `incontri-scrittura.test.ts` › "un incontro su un voucher già negativo viene creato con il suo addebito (201)", al posto dell'attuale "nessun nuovo addebito su un voucher già negativo (400)" |
| R9 | Il backend accetta anche la modifica del costo di un incontro il cui voucher, senza contare quell'addebito, è già negativo (oggi risponde 400). | `incontri-scrittura.test.ts` › "si modifica il costo di un incontro su un voucher già negativo e l'addebito si riallinea" |
| R10 | Prima di salvare, il frontend rilegge i saldi dei voucher e calcola per ogni socio scelto il saldo dopo l'incontro. Se uno o più soci con voucher avrebbero un saldo negativo (già negativo, o portato sotto zero da questo incontro), compare **una sola** conferma che li elenca tutti, ciascuno con saldo attuale e saldo dopo l'incontro. **Annulla** non crea nessun incontro, nemmeno per i soci senza problemi di saldo. | Manuale: gruppo con Rinaldi (negativo nel seed), Moretti (saldo che basta) e un socio con saldo che va sotto zero; la conferma elenca Rinaldi e il terzo, non Moretti; Annulla non crea niente |
| R11 | I soci senza voucher (pagano a parte) non compaiono mai nella conferma, e non la fanno comparire. | Manuale: gruppo con Sara Vitali (senza voucher nel seed) e Moretti con saldo sufficiente, nessuna conferma |
| R12 | In **Modifica** la conferma resta quella di oggi, sul singolo socio, e scatta anche quando il saldo era già negativo; dopo la conferma il salvataggio riesce (R9). | Manuale: Modifica del costo di un incontro di Rinaldi, conferma, salvataggio riuscito e saldo aggiornato in Voucher |
| R13 | I permessi non cambiano: un socio non registra incontri, un istruttore registra solo per sé e solo nelle attività a cui è abilitato, per ognuno dei soci del gruppo. | `incontri-scrittura.test.ts` › "un socio non può registrare incontri (403)" e "un istruttore non registra attività a cui non è abilitato (400)", invariati |
| R14 | Manuale d'uso, documentazione di prodotto e delle API allineati: `frontend/src/manuale/sezioni.tsx` (Resoconto e Incontri dell'admin), `docs/readme/voucher-tesseramento-ricevute.md`, `docs/readme/funzionalita.md`, `backend/docs/openapi.yaml` (descrizione di `POST /api/incontri` e `PUT /api/incontri/{id}`), `bruno/clubby/incontri/03_crea_incontro.bru`. | Manuale: rilettura delle sezioni elencate, nessun riferimento al blocco sul saldo già negativo; `grep -rn "già negativo"` su `docs/`, `backend/docs/`, `frontend/src/manuale/` non trova frasi che descrivono il vecchio rifiuto |

## Modello dati

Nessuna variazione di schema. Un incontro di gruppo è fatto di N righe
`incontro` normali, ciascuna con il proprio movimento di addebito.

## API

Nessun endpoint nuovo. Cambia il comportamento di due esistenti:

- `POST /api/incontri`: non risponde più 400 quando il voucher del socio è già
  in negativo; crea l'incontro e l'addebito (R8). Corpo, risposta e permessi
  invariati.
- `PUT /api/incontri/{id}`: non risponde più 400 quando il nuovo costo si
  addebita su un voucher già in negativo (R9).

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

**Form Nuovo incontro** (Resoconto per l'istruttore, Incontri per l'admin):

- il campo **Socio** diventa **Soci**: lo stesso `SocioSelect` di oggi, che
  scelto un socio lo aggiunge a un elenco sotto il campo e si svuota per il
  successivo. Ogni riga dell'elenco ha cognome, nome e un pulsante per
  toglierla. Le opzioni del campo escludono i soci già in elenco;
- con un solo socio il form si comporta esattamente come oggi;
- data, attività, istruttore (solo admin), costo e note restano campi unici,
  validi per tutti i soci;
- **Salva** dice quanti incontri crea quando sono più di uno (R2); durante il
  salvataggio mostra l'avanzamento ("Salvataggio 2 di 3...");
- su schermo stretto l'elenco dei soci va a capo riga per riga, senza tabella.

**Conferma sul saldo**: resta il `confirm` del browser già usato oggi, con un
testo che elenca i soci, uno per riga:

```
Questi soci avranno il voucher in negativo:

Rinaldi Giulia: saldo -5,00 €, dopo l'incontro -35,00 €
Costa Davide: saldo 10,00 €, dopo l'incontro -20,00 €

Vuoi registrare comunque gli incontri?
```

Con un solo socio il testo resta al singolare.

**Esito parziale** (R5): un `Avviso` sopra il form, per esempio "Creati 2
incontri su 3. Non registrato: Costa Davide (Socio con id ... non trovato)". Nel
form restano i soli soci non registrati.

Il socio non vede niente di nuovo: i suoi incontri restano in sola lettura.

## Decisioni

| Tema | Scelta | Motivo |
|---|---|---|
| Come si crea un gruppo | N chiamate a `POST /api/incontri` dal frontend, una per socio | Richiesta esplicita dell'utente: nessuna API apposita |
| Chiamate in sequenza o in parallelo | In sequenza | L'esito per socio è ordinato e leggibile, l'avanzamento si mostra, e un gruppo di una sessione ha pochi soci: il tempo in più non si nota |
| Esito parziale | Gli incontri creati restano; nel form restano solo i soci falliti | Senza un'API di gruppo non c'è una transazione che li tenga insieme. Annullare a mano quelli già creati potrebbe fallire a sua volta; lasciarli e riprovare gli altri non duplica niente |
| Chi può creare un gruppo | Istruttore (Resoconto) **e** admin (Incontri) | È lo stesso componente e lo stesso form: escludere l'admin vorrebbe dire un ramo in più per togliere una funzione utile anche a lui |
| Quali soci entrano nella conferma | Chi ha un voucher e dopo l'incontro avrebbe saldo negativo, sia che lo fosse già sia che ci finisca ora | È la regola della conferma che c'è già oggi per il singolo incontro: estenderla al gruppo senza cambiarne il criterio |
| Una conferma o una per socio | Una sola, cumulativa | Richiesta esplicita dell'utente; con dieci soci, dieci finestre di fila si confermano senza leggerle |
| Annulla sulla conferma | Non crea nessun incontro del gruppo | Chi annulla vuole ripensare il gruppo, non ritrovarsi metà degli incontri creati |
| Saldi usati per la conferma | Riletti al Salva | Quelli caricati all'apertura della pagina possono essere vecchi: un altro istruttore può aver registrato un incontro nel frattempo, e con un gruppo l'errore si moltiplica |
| Blocco del backend sul saldo già negativo | Rimosso, in creazione e in modifica | Altrimenti la conferma dell'interfaccia porta comunque a un errore. Tenerlo solo in modifica lascerebbe un incontro registrabile ma non correggibile |
| Legame fra gli incontri del gruppo | Nessuno | Ognuno ha il suo addebito, il suo stato di rendicontazione e la sua eventuale ricevuta: un legame dovrebbe decidere cosa succede quando uno solo cambia, e nessuno l'ha chiesto |

## Alternative scartate

| Alternativa | Perché no |
|---|---|
| Endpoint `POST /api/incontri/gruppo` che crea tutti gli incontri in una transazione | Scartata dall'utente: si riusa la creazione esistente chiamandola più volte dal frontend. Il prezzo è l'esito parziale (R5) |
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
  un socio viene eliminato nel frattempo. Mitigato da R5: si vede chi manca e si
  riprova solo quello.
- **Doppio clic.** Durante il salvataggio Salva è disabilitato, come oggi:
  senza, un secondo clic rifarebbe l'intero gruppo.
- **Test esistente.** "nessun nuovo addebito su un voucher già negativo (400)"
  in `tests/api/incontri-scrittura.test.ts` verifica proprio il comportamento
  che si toglie: va sostituito (R8), non lasciato fallire. Il saldo di
  `socio2` previsto in `ATTESE` cambia dopo quel test, e i test che lo leggono
  dopo vanno ricontrollati.
- **Seed.** `scripts/seed/04-voucher-e-incontri.sh` porta già Rinaldi in
  negativo: nessuna modifica, ed è il caso giusto per provare R8 e R10.
- **Ricevute.** Nessun impatto: gli incontri coperti da voucher non finiscono in
  Ricevute, quelli di soci senza voucher sì, uno per socio come oggi.

## Test dell'utente

Da compilare durante la prova.

## Verifica

Da compilare dopo il test dell'utente.
