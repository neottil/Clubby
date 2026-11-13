# Clubby: resoconto commerciale

Aggiornato al 4 novembre 2026.

## In breve

Clubby è il gestionale web per le Associazioni Sportive Dilettantistiche: tiene in un posto solo soci, incontri, crediti prepagati, tesseramenti e ricevute, e dice a ogni persona solo ciò che la riguarda.

È nato per le ASD del mondo cinofilo, dove un istruttore segue soci in incontri singoli o di gruppo pagati a pacchetto, ma il modello è generico: qualunque associazione con **soci, istruttori, attività a listino e pagamenti anticipati** lo può usare così com'è.

Il problema che risolve è quello tipico del club che lavora con fogli Excel, quaderni e chat:

- quanto credito resta a ogni socio, e chi è già in negativo
- quali incontri ha tenuto un istruttore, e quali gli sono già stati pagati
- chi ha la tessera scaduta, e con che numero era tesserato l'anno scorso
- quali incassi sono già stati documentati con una ricevuta, e quali no

Ogni club ha la propria istanza, con il proprio nome, logo, colori e database separato, e si usa dal browser o come app installata sul telefono.

## Cosa fa

Clubby copre il ciclo completo del club: chi sono i soci, cosa fanno, quanto hanno pagato, quanto spetta agli istruttori e quali incassi sono documentati.

| Area | Cosa fa | Disponibilità |
| --- | --- | --- |
| **Soci** | Anagrafica (nome, cognome, telefono), collegamento all'account con cui il socio accede, ricerca e ordinamento | Sempre |
| **Incontri** | Registrazione con data, attività, costo, istruttore e note (testo semplice o Markdown); filtri per attività e periodo con i totali del periodo | Sempre |
| **Incontri di gruppo** | Più soci con stessa data, attività, costo e istruttore in un solo inserimento, con una nota per ciascuno | Sempre |
| **Listino attività** | Attività con costo proposto, modificabile senza riscrivere lo storico; un'attività usata si disattiva invece di sparire | Sempre |
| **Istruttori** | Abilitazione per singola attività, controllata anche lato server; pagina Resoconto con gli incontri tenuti, numero e costo complessivo | Sempre |
| **Rendicontazione** | L'admin marca gli incontri già riconosciuti all'istruttore; un incontro rendicontato non si modifica più, così il conteggio pagato resta ricostruibile | Sempre |
| **Voucher prepagati** | Credito acquistato con ricariche e scalato automaticamente dagli incontri; saldo negativo ammesso con avviso di conferma; import del credito venduto prima di Clubby | Sempre |
| **Ricariche con bonus** | A scelta del club: importo libero, percentuale in più, oppure tagli fissi (es. paghi 50, ricevi 55) | Configurabile |
| **Tesseramento** | Scadenza per socio, rinnovi con storico, numero di tessera per anno, quota configurabile | Modulo opzionale |
| **Ricevute** | Riepilogo di ricariche, quote e incontri pagati a parte; ricevute PDF numerate per anno, con anteprima, logo e intestazione del club, riapribili dal socio | Modulo opzionale |
| **Manuale integrato** | Istruzioni d'uso dentro l'app, filtrate per ruolo e per moduli attivi | Sempre |
| **App sul telefono** | Installabile sulla Home di Android e iPhone, senza store, con nome e icona del club | In collaudo (vedi sotto) |

Qualche dettaglio che in vendita fa la differenza:

- **Le ricevute non si possono falsare.** Numerazione per anno senza buchi, nessun annullamento, e la voce documentata non si può più cambiare. L'anteprima serve a vedere l'errore prima di emettere.
- **Il bonus sulle ricariche non gonfia gli incassi.** In Ricevute compare sempre l'importo pagato, mai il credito regalato.
- **Niente doppi conteggi.** Gli addebiti sul voucher non finiscono nelle ricevute, perché sono già coperti dalla ricarica.
- **Elenchi veloci anche con molti dati.** Ricerca, ordinamento e totali li calcola il database sull'intero risultato filtrato, e la pagina carica a blocchi.

## Chi lo usa e come

Ogni persona entra con il proprio account e vede solo ciò che le compete: i permessi sono applicati dal server, non solo nascosti nell'interfaccia.

| Chi | Cosa vede e cosa fa |
| --- | --- |
| **Socio** | La propria scheda, i propri incontri, il saldo e i movimenti del voucher, la tessera e le proprie ricevute in PDF |
| **Istruttore** | Registra e corregge gli incontri che tiene, solo nelle attività a cui è abilitato; vede i propri totali, l'elenco soci ridotto al nome e i saldi dei voucher |
| **Admin** | Gestisce tutto: account, ruoli, listino, abilitazioni, soci, voucher, tesseramenti, ricevute e rendicontazione. È un privilegio separato dal ruolo, quindi un istruttore può anche essere admin |

**Accesso.** Il socio si registra da solo con email e password, poi un admin collega l'account alla sua scheda. Il collegamento è volutamente manuale: due fratelli iscritti con l'email del genitore, o un estraneo che conosce l'indirizzo di un socio, non possono ereditare dati altrui.

**Dal browser o dal telefono.** Clubby è una web app: funziona da qualunque browser, senza installare nulla. Con la versione in collaudo (spec 012) diventa anche un'app installabile sulla schermata Home di Android e iPhone:

- nome, icona e colori del club, senza passare dagli store
- avviso quando esce una versione nuova, con il tasto "Aggiorna"
- avviso quando il telefono è offline
- casella "Resta collegato su questo dispositivo" per non dover rifare l'accesso, fino a 30 giorni

**Manuale e pagina Info.** Il manuale d'uso è dentro l'app e mostra a ciascuno solo le sezioni che lo riguardano. La pagina Info mostra le versioni in esecuzione ed è raggiungibile anche senza accesso, utile per l'assistenza quando l'accesso non funziona.

## Come si personalizza

Ogni club riceve un Clubby con la propria identità e le proprie regole, senza sviluppo dedicato: lo stesso prodotto si configura su tre livelli.

| Cosa | Esempi | Dove si cambia | Serve un rilascio? |
| --- | --- | --- | --- |
| **Identità del club** | Nome del club, nome breve sotto l'icona dell'app, logo (anche su favicon, icone dell'app e ricevute), sei colori del tema | Configurazione del club, impostata da chi installa | No: basta rifare il deploy, senza ricompilare |
| **Moduli** | Tesseramento acceso o spento, Ricevute acceso o spento, indipendenti fra loro | Configurazione del club | No: si accendono e spengono con un deploy, e lo storico resta intatto |
| **Regole delle ricariche** | Importo libero, percentuale di bonus, oppure tagli fissi | Modalità nella configurazione; percentuale e tagli dalla pagina Impostazioni | No |
| **Dati del club** | Listino attività e costi, abilitazioni degli istruttori, quota di tesseramento, intestazione e piè di pagina delle ricevute | Pagina Impostazioni, dall'admin del club | No: effetto immediato |
| **Indirizzo web** | Dominio proprio per l'app (es. `romaasd.clubby.example.com`) | Configurazione del club | No |

**Un club, un'istanza.** Ogni club ha il proprio ambiente con database separati e credenziali proprie: non esiste un database condiviso in cui i dati di club diversi stanno nella stessa tabella. Quando si parla di riservatezza dei dati dei soci, è un argomento concreto da spendere.

**Un prodotto, tanti club.** Il codice e le immagini sono gli stessi per tutti, quindi un miglioramento rilasciato arriva a ogni club. Il rilascio passa prima dall'ambiente di sviluppo e poi viene approvato club per club, così ognuno si aggiorna quando è pronto.

**Oltre la configurazione.** Quello che non è configurabile (un campo nuovo, un modulo nuovo) si aggiunge con lo sviluppo: il progetto lavora per specifiche approvate e documentate, quindi una richiesta di un cliente diventa una specifica, poi una funzione disponibile anche agli altri club.

## Tecnologia e affidabilità

Clubby è costruito con tecnologie diffuse e moderne, e con alcune scelte pensate apposta per non perdere dati e non esporre credenziali.

- **Tecnologie:** React 19 per l'interfaccia, Node.js 24 per i servizi, PostgreSQL 16 per i dati, Kubernetes su server privato con certificati HTTPS automatici.
- **Credenziali isolate:** le password stanno in un servizio separato, con un proprio database a cui il resto dell'applicazione non accede. Le password sono cifrate con scrypt, gli accessi firmati con una chiave privata che non esce mai da quel servizio, e i tentativi di accesso sono limitati.
- **Sessioni brevi:** il token di accesso dura 15 minuti e si rinnova da solo; disattivare un account o cambiarne il ruolo ne chiude le sessioni.
- **Ricevute nei backup:** i PDF emessi sono conservati nel database, quindi finiscono nei backup insieme a tutto il resto.
- **Aggiornamenti senza fermo:** le modifiche al database sono sempre compatibili con la versione precedente, così l'aggiornamento non interrompe il servizio.
- **Rilasci controllati:** ogni modifica va prima in un ambiente di sviluppo, poi viene approvata per il rilascio e infine club per club. Se serve, si torna alla versione precedente.
- **Test automatici** sulle API, e documentazione delle API in formato OpenAPI.

## Argomenti di vendita e limiti da conoscere

Il messaggio in una riga: **Clubby sostituisce fogli e quaderni del club con un'app che ogni socio ha sul telefono, e rende impossibile perdere il conto di crediti, tessere, compensi e ricevute.**

Argomenti da usare:

1. Il socio vede da solo saldo, incontri, tessera e ricevute: meno domande alla segreteria.
2. L'istruttore registra i propri incontri, e il club sa sempre cosa gli ha già pagato.
3. Pacchetti prepagati con bonus (paghi 100, ricevi 110), senza falsare gli incassi.
4. Ricevute PDF numerate e immodificabili, con logo e intestazione del club.
5. App col marchio del club, senza store e senza costi di pubblicazione.
6. Dati di ogni club in database separati.
7. Si attiva solo quello che serve: Tesseramento e Ricevute si accendono quando il club li vuole.

Limiti da dire prima che li scopra il cliente:

- **Non incassa pagamenti online:** registra pagamenti già avvenuti (contanti, bonifico, POS).
- **Nessun recupero password via email:** il progetto non ha un servizio di posta, quindi la password dimenticata la azzera un admin.
- **Nessuna notifica push**, per ora: è stata rimandata a una fase successiva.
- **App installabile in collaudo:** la versione PWA è in test e non ancora rilasciata ai club; nel frattempo si usa dal browser.
- **Ricevute e fisco:** Clubby produce ricevute numerate, ma il formato va verificato con il commercialista del club rispetto ai suoi obblighi.
- **Attivare un club nuovo richiede un intervento tecnico** (ambiente, dominio, logo): non c'è una registrazione self-service per le associazioni.
- **Interfaccia solo in italiano.**

Fonti: la documentazione di prodotto in [docs/readme/](../readme/readme.md), [branding/README.md](../../branding/README.md) e [specs/README.md](../../specs/README.md), allo stato del ramo `feature/spec-012`.
