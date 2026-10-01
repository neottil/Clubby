# Account, registrazione e accessi

## Dove vivono i dati delle persone

L'anagrafica — nome, cognome, telefono — sta **solo** sulla scheda socio, nel database
applicativo. L'authorizer custodisce credenziali e ruolo, e null'altro: l'unico dato anagrafico
che conosce è l'email, perché è ciò con cui si accede. Una copia in entrambi i servizi sarebbe
stata una doppia verità scrivibile, destinata a divergere.

Ne discende che un account non collegato ad alcun socio **non ha un nominativo**: nel pannello
admin compare con la sola email, ed è corretto — è tutto ciò che se ne sa.

## Registrazione

1. La persona si registra con **email e password**, nient'altro
2. L'authorizer crea l'account come `socio`, senza privilegio admin, e apre subito una sessione
3. Da quel momento la persona accede, ma **non vede alcun dato**: un avviso in interfaccia le
   dice che il suo account non è ancora collegato a una scheda socio
4. Un admin fa l'abbinamento dal pannello, e al primo accesso successivo la persona vede i propri
   dati

**Il collegamento è sempre manuale.** L'app non abbina mai nessuno da sola. C'è stato un aggancio
automatico basato sull'email, ed è stato tolto per due motivi concreti: l'indirizzo di un socio lo
digita un admin e nessuno lo verifica, quindi chi ne conoscesse uno poteva registrarsi con quello
ed ereditare voucher e incontri di un altro; e due schede che condividono un indirizzo — due
fratelli iscritti con l'email del genitore, tutt'altro che raro in un'associazione — rendevano
l'abbinamento un'ipotesi invece di un fatto. Anche il nome e il cognome non basterebbero, fra
omonimi, secondi nomi e refusi.

Il collegamento è `socio.id_viewer`, che contiene l'id dell'account (lo stesso valore del claim
`sub` dei suoi token).

## Cambiare l'email di un socio

Non si può, finché è collegato: quella è l'email del suo account. La via è registrare un account
nuovo con l'indirizzo nuovo, poi dal pannello **"Scollega e disattiva"** sul socio e collegarlo al
nuovo account. Le due azioni stanno in un bottone solo perché l'ordine conta: disattivare senza
prima scollegare lascerebbe il socio legato a un'utenza che non può più accedere.

Un account disattivato non viene eliminato: resta come traccia di chi ha operato in passato, e i
riferimenti che lo citano negli incontri e nelle abilitazioni — che stanno in un altro database,
dove nessuna foreign key può ripulirli — restano validi.

Nome, cognome e telefono restano invece modificabili da un admin in qualunque momento: di quelli
la scheda socio è l'unica fonte, non una copia.

## Admin principale

Creato dall'authorizer al primo avvio, **solo se il database degli utenti è ancora
vuoto**: su un'istanza già popolata il passaggio non tocca nulla. Deve cambiare la
password al primo accesso.

- **In locale**: email e password chieste da `scripts/init-local.sh` (default `admin@clubby.local` / `adminadmin`; la password deve avere almeno 10 caratteri)
- **Su cluster**: email dalla variabile `INITIAL_ADMIN_EMAIL` dell'Environment, password temporanea generata dalla pipeline [Infra](pipeline-ci-cd.md#infra), nessuna credenziale scritta nel codice

Un admin può concedere il privilegio ad altri utenti dalla pagina Impostazioni, o con
`POST /api/admin/amministratore`.

## Sessione

Dopo l'accesso la sessione resta aperta finché la scheda del browser è aperta, fino a 30 giorni. Il token
di accesso dura 15 minuti e l'app lo rinnova da sola con il refresh token: prima della scadenza, al ritorno
sulla scheda dopo una pausa o una sospensione del computer, e al primo rifiuto per token scaduto. La
sessione si chiude con il logout, chiudendo la scheda, o quando un admin disattiva l'account, ne cambia
ruolo o privilegio, o ne azzera la password.

## Password dimenticata

Non c'è recupero self-service: il progetto non ha un servizio di posta. Un admin azzera
la password dalla pagina Admin, ottiene una password temporanea da consegnare
all'interessato, e questi la sostituisce al primo accesso.

