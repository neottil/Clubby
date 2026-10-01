# Operazioni su un ambiente in cluster

Come raggiungere database e credenziali di un ambiente deployato, e come farci
le operazioni manuali che le pipeline non coprono.

**Nessun valore di credenziale compare in questo file, e non va aggiunto.** Qui
ci sono solo i comandi che leggono i segreti dal cluster; l'output di quei
comandi non va incollato in un file del repository, in un ticket o in una chat.

Le pipeline, gli Environment e le Variables stanno in
[.github/README.md](../../.github/README.md). L'ambiente locale in
[ambiente-locale.md](sviluppo-locale.md).

## Come sono fatti i nomi

Dal nome dell'Environment (`<ambiente>`) discende tutto il resto:

| Cosa | Nome |
|---|---|
| Namespace dell'applicazione | `clubby-<ambiente>-app` |
| Namespace di PostgreSQL | la Variable `DB_NAMESPACE` (condivisibile fra club) |
| Database e utente applicativo | `<ambiente>-clubby` — **omonimi** |
| Database e utente degli account | `<ambiente>-auth` — **omonimi** |
| Host del database | `postgres.<DB_NAMESPACE>.svc.cluster.local` |

Per un Environment chiamato `development`: namespace `clubby-development-app`,
database `development-clubby` e `development-auth`.

L'utente del database **non è `postgres`**. È omonimo del database, e la password
che trovi nel Secret dell'applicazione è la sua, non quella del superutente: è
l'errore più facile da fare, e fallisce con un messaggio di autenticazione che
non spiega perché.

## Dove stanno le credenziali

| Cosa | Dove |
|---|---|
| Utente, database e host | **ConfigMap** `clubby-config`, chiavi `DB_USER`, `DB_NAME`, `DB_HOST`, `DB_PORT` |
| Password dell'utente applicativo | Secret `clubby-secrets`, chiave `DB_PASSWORD` |
| Password dell'utente degli account | Secret `clubby-auth-secrets`, chiave `DB_PASSWORD` |
| Password del superutente `postgres` | Secret `postgres-superuser` nel namespace **di PostgreSQL** |

Il nome dell'utente sta nel ConfigMap, non nel Secret:

```bash
kubectl get configmap clubby-config -n clubby-<ambiente>-app -o jsonpath='{.data.DB_USER}{"\n"}{.data.DB_NAME}{"\n"}{.data.DB_HOST}{"\n"}{.data.DB_PORT}{"\n"}'
```

Le password si leggono così (da PowerShell `base64 -d` non esiste: si usa
`[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($valore))`):

```bash
kubectl get secret clubby-secrets -n clubby-<ambiente>-app -o jsonpath='{.data.DB_PASSWORD}' | base64 -d; echo
```

Il namespace di PostgreSQL, se non lo si ricorda:

```bash
kubectl get pods -A -l app=postgres
```

Due cose sul ciclo di vita di queste credenziali:

- **La verità è il Secret dell'Environment su GitHub, non il cluster.** Il
  workflow Infra riallinea la password del ruolo (`ALTER ROLE ... PASSWORD`) a
  ogni esecuzione. Se la si cambia su GitHub e da allora gira solo un deploy —
  che rigenera il Secret nel cluster ma non tocca il ruolo — il Secret dice una
  cosa e PostgreSQL ne accetta un'altra: si risolve rieseguendo Infra.
- **La password del superutente la genera Infra e vive solo nel cluster.** Non è
  in nessun Secret di GitHub: quel `kubectl get secret` è l'unica copia.

## Accedere al database senza password

Dentro il pod l'autenticazione sul socket locale è in `trust` — è così che Infra
crea i database senza far transitare la password del superutente:

```bash
kubectl exec -it -n <db-namespace> deployment/postgres -- psql -U postgres -d <ambiente>-clubby
```

È anche la via più comoda per dump e restore: gli stessi comandi di
[ambiente-locale.md](sviluppo-locale.md#dump-e-restore-del-database-locale) con
`kubectl exec -n <db-namespace> deployment/postgres --` al posto di
`docker exec clubby-postgres`.

```bash
kubectl exec -n <db-namespace> deployment/postgres -- pg_dump -U postgres -d <ambiente>-clubby -Fc > ~/clubby-backup/<ambiente>-clubby.dump
```

Ogni utente vede **solo il proprio** database: Infra fa
`REVOKE ALL ON DATABASE ... FROM PUBLIC`, quindi `<ambiente>-clubby` non può
collegarsi a `<ambiente>-auth` nemmeno con la password giusta. Per guardarli
insieme serve il superutente.

## Un client locale (DBeaver e simili)


Postgres gira dentro il cluster su un Service `ClusterIP` (solo interno, non raggiungibile da internet).
Due modi per collegarti da un client locale:

### 1. Tunnel SSH + `kubectl port-forward` (sempre disponibile, nessuna esposizione pubblica)

Da terminale locale:
```bash
ssh -i ~/.ssh/k9_deploy 5432:localhost:5432 deploy@<IP_VPS> \
  'export KUBECONFIG=/home/deploy/.kube/config && kubectl port-forward -n <namespace> svc/postgres 5432:5432'
```
(sostituisci `<IP_VPS>` e `<namespace>` con il `DB_NAMESPACE` dell'istanza, es. `postgres-prod`;
sostituisci `deploy` se il tuo `SSH_USER` è diverso). Lascia il terminale aperto finché usi il client — il
tunnel resta attivo finché la sessione SSH è connessa.

Poi in DBeaver: host `localhost`, porta `5432`, database e utente `<env>-clubby` (o `<env>-auth` per gli
account), password `DB_PASSWORD` (o `AUTH_DB_PASSWORD`) dell'Environment del club. Ogni utente vede solo il
proprio database.

### 2. `NodePort` (esposizione pubblica sull'IP della VPS, opt-in)

Imposta `DB_NODE_PORT` (es. `30432`) sull'Environment desiderato e rilancia **Infra**: crea un Service
`NodePort` aggiuntivo (`k8s/templates/infra/postgres-nodeport.yaml`), raggiungibile su
`<IP_VPS>:<DB_NODE_PORT>`. Il Service espone l'intera istanza, quindi i database di tutti i club che la
condividono (ciascuno protetto dalla password del proprio utente). Non viene mai rimosso in automatico:
su un'istanza condivisa, un club senza `DB_NODE_PORT` toglierebbe l'accesso configurato da un altro.
Per rimuoverlo:

```bash
kubectl delete service postgres-external -n <DB_NAMESPACE>
```

⚠️ **Attenzione**: un `NodePort` espone Postgres su tutte le interfacce della VPS, protetto solo dalla
password del DB. Se lo attivi, filtra la porta via firewall (es. Hetzner Cloud Firewall) al tuo IP
personale — non lasciarla aperta a tutto internet.

In DBeaver: host `<IP_VPS>` (o un DNS che punta allo stesso IP, es. `db-dev.clubby.click`), porta
`DB_NODE_PORT`, stesse credenziali del metodo 1.

### 3. Client `psql` usa-e-getta in Docker

Senza installare niente in locale, con il `NodePort` del metodo 2 attivo:

```bash
docker run --rm -it postgres:18.3-alpine \
  psql -h <IP_VPS> -p <DB_NODE_PORT> -U <env>-clubby -d <env>-clubby
```

## Eseguire il seed contro un ambiente

⚠️ **Solo su un ambiente usa-e-getta.** `scripts/seed-demo-data.sh` **azzera** i
due database prima di ripopolarli: nato per la macchina di sviluppo, su un
ambiente con dati veri è un disastro e non una ripopolazione. È il motivo per cui
lo script sta fuori dall'immagine del backend, lontano da un `kubectl exec` su un
pod. Su un ambiente di prova, con il port-forward attivo:

```bash
DB_HOST=localhost DB_PORT=15432 \
DB_NAME=<ambiente>-clubby DB_USER=<ambiente>-clubby \
DB_PASSWORD="$(kubectl get secret clubby-secrets -n clubby-<ambiente>-app -o jsonpath='{.data.DB_PASSWORD}' | base64 -d)" \
AUTH_DB_NAME=<ambiente>-auth AUTH_DB_USER=<ambiente>-auth \
AUTH_DB_PASSWORD="$(kubectl get secret clubby-auth-secrets -n clubby-<ambiente>-app -o jsonpath='{.data.DB_PASSWORD}' | base64 -d)" \
AUTH_INTERNAL_URL=https://<AUTH_DOMAIN> \
INITIAL_ADMIN_EMAIL="$(kubectl get configmap clubby-auth-config -n clubby-<ambiente>-app -o jsonpath='{.data.INITIAL_ADMIN_EMAIL}')" \
SEED_ADMIN_PASSWORD="$(kubectl get secret clubby-auth-secrets -n clubby-<ambiente>-app -o jsonpath='{.data.INITIAL_ADMIN_PASSWORD}' | base64 -d)" \
bash scripts/seed-demo-data.sh
```

Le credenziali si leggono dal cluster dentro la riga di comando e non si
scrivono da nessuna parte. `INITIAL_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD` vanno
presi **da quell'ambiente** e non da `authorizer/.env`: sono i valori con cui il
suo authorizer ricrea l'admin iniziale, e usarne altri lascia due amministratori
diversi.

### Se la registrazione dà 409 "esiste già un account"

Il seed azzera il database che gli indichi e registra gli account via HTTP
sull'authorizer: se i due non sono la stessa installazione, il reset avviene per
davvero, solo non dove serve. Dalla versione attuale lo script se ne accorge da
sé e lo dice; le due cause possibili sono:

1. **L'authorizer si è riavviato dopo l'azzeramento** e ha ricreato l'admin
   iniziale — lo fa al proprio avvio quando trova la tabella account vuota. In
   quel caso il seed riusa quell'account e tira avanti.
2. **`AUTH_INTERNAL_URL` e `AUTH_DB_*` puntano a installazioni diverse.** Lo
   script si ferma e lo scrive.

A distinguerli basta la data di creazione dell'account sopravvissuto: se è di
pochi secondi dopo il lancio del seed è il caso 1, se è vecchia è il caso 2.

```bash
kubectl exec -n <db-namespace> deployment/postgres -- psql -U postgres -d <ambiente>-auth -c "SELECT email, created_at FROM utente ORDER BY created_at"
```

Nota sull'ordine: il database dei dati viene azzerato **prima** di quello degli
account. Un seed interrotto in mezzo lascia quindi gli account collegati a
schede socio che non esistono più — non è uno stato utilizzabile, e si risolve
rilanciando il seed.
