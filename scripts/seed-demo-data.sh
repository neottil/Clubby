#!/bin/bash
# ============================================================
# Popola il database (e Keycloak) con dati di esempio per demo/test manuali.
#
# Crea 3 soci:
#   - Mario Rossi   -> collegato a un account Keycloak (viewer), voucher con
#                      saldo positivo, incontri di vario tipo
#   - Laura Bianchi -> collegata a un account Keycloak (viewer), voucher con
#                      una ricarica E un saldo finale NEGATIVO (per testare
#                      la UI in quel caso)
#   - Giulia Verdi  -> NESSUn account Keycloak (socio "solo gestionale",
#                      senza accesso all'area viewer), voucher con saldo
#                      positivo
#
# Username/password degli account Keycloak sono nome/cognome del socio
# (vedi in fondo per il riepilogo credenziali stampato a fine esecuzione).
#
# Idempotente: ad ogni esecuzione elimina prima i 3 soci demo (email fisse,
# vedi sotto) — a cascata anche voucher/incontri/movimenti collegati — e i
# relativi utenti Keycloak, poi li ricrea da zero. Rieseguibile senza
# accumulare dati duplicati ad ogni lancio.
#
# Non interattivo: tutti i parametri arrivano da variabili d'ambiente, con
# default adatti a un ambiente locale (docker-compose) — le stesse identiche
# variabili sono già presenti nell'ambiente del pod backend (ConfigMap
# clubmanager-config + Secret clubmanager-secrets), quindi lo script gira
# SENZA OVERRIDE anche dentro un pod backend già deployato (utile per
# popolare dati demo in staging). Il pod backend include già bash/curl/jq/
# psql e questo stesso script (vedi backend/Dockerfile) — nessun `kubectl cp`
# necessario, basta un `kubectl exec`.
#
# Prerequisiti (in locale): bash, psql, curl, jq
#
# Variabili DB (default = ambiente locale via docker-compose):
#   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
# Variabili Keycloak (default = ambiente locale): usa le stesse credenziali
# del client confidential "clubmanager-backend" (grant client_credentials,
# stesso meccanismo di backend/src/service/admin.service.ts) — non le
# credenziali dell'admin bootstrap della console Keycloak (quelle non sono
# mai presenti nei pod applicativi, solo nei GitHub Secrets di Infra):
#   KEYCLOAK_URL, KEYCLOAK_REALM, KEYCLOAK_ADMIN_CLIENT_ID, KEYCLOAK_ADMIN_CLIENT_SECRET
#
# Uso in locale:
#   ./scripts/seed-demo-data.sh
#   DB_HOST=1.2.3.4 KEYCLOAK_URL=https://auth.example.com ./scripts/seed-demo-data.sh
#
# Uso dentro un pod backend già deployato (staging/prod), nessuna variabile
# da passare — sono già tutte nell'ambiente del pod:
#   kubectl exec -it <pod-backend> -n <namespace> -- bash /app/scripts/seed-demo-data.sh
# ============================================================
set -euo pipefail

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-clubmanager}"
DB_USER="${DB_USER:-clubmanager}"
DB_PASSWORD="${DB_PASSWORD:-clubmanager}"

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
KEYCLOAK_REALM="${KEYCLOAK_REALM:-clubmanager}"
KEYCLOAK_ADMIN_CLIENT_ID="${KEYCLOAK_ADMIN_CLIENT_ID:-clubmanager-backend}"
KEYCLOAK_ADMIN_CLIENT_SECRET="${KEYCLOAK_ADMIN_CLIENT_SECRET:-clubmanager-backend-secret}"
# ------------------------------------------------------------
# Helper: esegue una query e ritorna un solo valore scalare
# ------------------------------------------------------------
# NIENTE pipe verso "head": psql viene eseguito fino in fondo e la prima riga
# è estratta con l'espansione di parametro. Con "| head -n1" e "set -o pipefail"
# attivo (vedi sopra), head chiude la pipe appena letta la prima riga e psql può
# ricevere SIGPIPE: la pipeline esce con 141 e lo script si interrompe in modo
# NON deterministico, a seconda di quale dei due processi vince la corsa.
#
# ON_ERROR_STOP=1: un errore SQL fa uscire psql con stato diverso da zero invece
# di lasciar proseguire (rilevante per psql_exec, che riceve più statement in un
# solo -c) e, qui, invece di restituire un valore vuoto che si propagherebbe
# silenziosamente nelle query successive come UUID non valido.
psql_scalar() {
  local out
  out=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -v ON_ERROR_STOP=1 -tAc "$1")
  printf '%s\n' "${out%%$'\n'*}"
}

psql_exec() {
  PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -v ON_ERROR_STOP=1 -c "$1" > /dev/null
}

echo "▶ Verifico connessione al DB ($DB_HOST:$DB_PORT/$DB_NAME)..."
psql_scalar "SELECT 1;" > /dev/null
echo "  OK."

# ------------------------------------------------------------
# 0. Token admin Keycloak (serve sia per la pulizia che per la creazione)
# ------------------------------------------------------------
# grant_type=client_credentials sul realm applicativo (non username/password
# sul realm master): stesso identico meccanismo usato dal backend stesso
# (getAdminToken() in backend/src/service/admin.service.ts), con le stesse
# credenziali già presenti nell'ambiente del pod backend (service account del
# client confidential "clubmanager-backend", permessi manage-users/
# manage-realm assegnati da scripts/keycloak-realm-init.sh) — niente
# credenziali di bootstrap separate da procurarsi a parte.
echo "▶ Ottengo token admin Keycloak..."
TOKEN_RESPONSE=$(curl -s -w '\n%{http_code}' -X POST \
  "$KEYCLOAK_URL/realms/$KEYCLOAK_REALM/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=$KEYCLOAK_ADMIN_CLIENT_ID" \
  -d "client_secret=$KEYCLOAK_ADMIN_CLIENT_SECRET")
TOKEN_HTTP_CODE=$(echo "$TOKEN_RESPONSE" | tail -n1)
TOKEN_BODY=$(echo "$TOKEN_RESPONSE" | sed '$d')

if [ "$TOKEN_HTTP_CODE" != "200" ]; then
  echo "ERRORE: richiesta token Keycloak fallita (HTTP $TOKEN_HTTP_CODE): $TOKEN_BODY" >&2
  exit 1
fi

ADMIN_TOKEN=$(echo "$TOKEN_BODY" | jq -r '.access_token')
if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
  echo "ERRORE: impossibile ottenere token admin Keycloak (risposta: $TOKEN_BODY)." >&2
  exit 1
fi
echo "  Token ottenuto."

# kc_api NON usa "curl -f": in caso di errore HTTP vogliamo vedere status +
# corpo della risposta (motivo dell'errore), non un fallimento silenzioso.
kc_api() {
  local method="$1" path="$2" data="${3:-}"
  local response http_code body
  if [ -n "$data" ]; then
    response=$(curl -s -w '\n%{http_code}' -X "$method" "$KEYCLOAK_URL/admin/realms$path" \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$data")
  else
    response=$(curl -s -w '\n%{http_code}' -X "$method" "$KEYCLOAK_URL/admin/realms$path" \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      -H "Content-Type: application/json")
  fi
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
    echo "$body"
  else
    echo "  [kc_api] $method $path -> HTTP $http_code: $body" >&2
    return 1
  fi
}

# ------------------------------------------------------------
# 1. Pulizia dati demo da run precedenti (idempotenza)
# ------------------------------------------------------------
echo "▶ Pulisco eventuali dati di esempio da run precedenti..."

elimina_utente_keycloak_se_esiste() {
  local username="$1"
  local kc_user_id
  kc_user_id=$(kc_api GET "/$KEYCLOAK_REALM/users?username=$username" | jq -r '.[0].id // empty')
  if [ -n "$kc_user_id" ]; then
    kc_api DELETE "/$KEYCLOAK_REALM/users/$kc_user_id" > /dev/null
    echo "  Utente Keycloak '$username' (esistente) eliminato."
  fi
}

elimina_utente_keycloak_se_esiste "mario.rossi"
elimina_utente_keycloak_se_esiste "laura.bianchi"

# A cascata (ON DELETE CASCADE) elimina anche voucher/incontro/movimento_voucher
# collegati a questi soci — vedi backend/src/db/schema.sql.
psql_exec "
  DELETE FROM socio WHERE email IN (
    'mario.rossi@example.local',
    'laura.bianchi@example.local',
    'giulia.verdi@example.local'
  );
"
echo "  Dati precedenti (se presenti) rimossi."

# ------------------------------------------------------------
# 2. Soci
# ------------------------------------------------------------
echo "▶ Creo i soci..."

MARIO_ID=$(psql_scalar "
  INSERT INTO socio (nome, cognome, email, telefono, data_iscrizione, note)
  VALUES ('Mario', 'Rossi', 'mario.rossi@example.local', '+39 333 1111111', CURRENT_DATE - INTERVAL '6 months', 'Socio di esempio, saldo positivo')
  RETURNING id;
")

LAURA_ID=$(psql_scalar "
  INSERT INTO socio (nome, cognome, email, telefono, data_iscrizione, note)
  VALUES ('Laura', 'Bianchi', 'laura.bianchi@example.local', '+39 333 2222222', CURRENT_DATE - INTERVAL '3 months', 'Socio di esempio, saldo negativo dopo ricarica + addebiti')
  RETURNING id;
")

GIULIA_ID=$(psql_scalar "
  INSERT INTO socio (nome, cognome, email, telefono, data_iscrizione, note)
  VALUES ('Giulia', 'Verdi', 'giulia.verdi@example.local', '+39 333 3333333', CURRENT_DATE - INTERVAL '1 year', 'Socio di esempio, nessun account viewer')
  RETURNING id;
")

echo "  Mario Rossi   -> $MARIO_ID"
echo "  Laura Bianchi -> $LAURA_ID"
echo "  Giulia Verdi  -> $GIULIA_ID"

# ------------------------------------------------------------
# 3. Voucher — uno per socio
# ------------------------------------------------------------
echo "▶ Creo i voucher..."

# data_creazione esplicita e non il default NOW(): il voucher deve esistere
# prima dei movimenti che lo muovono. Lasciandola a "oggi", la lista mostrava
# voucher creati stamattina con addebiti di venti giorni fa. 30 giorni copre
# l'incontro demo più vecchio (Giulia, 20 giorni fa) ed è successiva alla data
# di iscrizione di tutti e tre i soci.
VOUCHER_CREATO="NOW() - INTERVAL '30 days'"

MARIO_VOUCHER_ID=$(psql_scalar "
  INSERT INTO voucher (socio_id, saldo_iniziale, data_creazione)
  VALUES ('$MARIO_ID', 100.00, $VOUCHER_CREATO)
  RETURNING id;
")

LAURA_VOUCHER_ID=$(psql_scalar "
  INSERT INTO voucher (socio_id, saldo_iniziale, data_creazione)
  VALUES ('$LAURA_ID', 30.00, $VOUCHER_CREATO)
  RETURNING id;
")

GIULIA_VOUCHER_ID=$(psql_scalar "
  INSERT INTO voucher (socio_id, saldo_iniziale, data_creazione)
  VALUES ('$GIULIA_ID', 50.00, $VOUCHER_CREATO)
  RETURNING id;
")

# ------------------------------------------------------------
# 4. Incontri (di vario tipo) + movimenti di addebito collegati
# ------------------------------------------------------------
echo "▶ Creo gli incontri e i relativi addebiti..."

# Data di N giorni fa in formato YYYY-MM-DD, portabile: "-d '@epoch'" è
# supportato sia da GNU date che da BusyBox date (usato in postgres:16-alpine),
# a differenza di "-d '10 days ago'" (solo GNU) o "-v-10d" (solo BSD/macOS).
days_ago() {
  local n="$1"
  local now
  now=$(date -u +%s)
  date -u -d "@$((now - n * 86400))" +%F 2>/dev/null || date -u -v-"${n}"d +%F
}

# Il 7° parametro (note_markdown) è opzionale e vale false: le note demo sono
# testo semplice, tranne le due passate esplicitamente come Markdown più sotto.
# ATTENZIONE: le note vengono interpolate dentro un letterale SQL fra apici
# singoli — non devono contenere apostrofi (in Markdown non servono, e usarli
# richiederebbe di raddoppiarli).
# L'addebito prende la stessa data dell'incontro che lo genera, come fa
# createIncontro() nel backend (incontri.service.ts): le due liste devono
# raccontare la stessa cronologia.
crea_incontro_con_addebito() {
  local socio_id="$1" voucher_id="$2" data="$3" attivita="$4" costo="$5" note="$6" note_markdown="${7:-false}"
  local incontro_id
  incontro_id=$(psql_scalar "
    INSERT INTO incontro (socio_id, data_incontro, attivita, costo, note, note_markdown)
    VALUES ('$socio_id', '$data', '$attivita', $costo, '$note', $note_markdown)
    RETURNING id;
  ")
  psql_exec "
    INSERT INTO movimento_voucher (voucher_id, incontro_id, data_movimento, importo, descrizione)
    VALUES ('$voucher_id', '$incontro_id', '$data', -$costo, 'Addebito incontro: $attivita');
  "
}

# Due note in Markdown (le altre restano testo semplice, così la demo mostra
# entrambi i formati fianco a fianco nella stessa tabella): coprono titoli,
# grassetto, barrato, elenchi puntati e numerati, citazione, tabella e link —
# cioè tutto ciò che la barra dei comandi dell'editor sa produrre.
NOTA_MD_MANTRAILING="## Mantrailing - incontro individuale

Obiettivi della sessione:

* riconoscimento **odore di riferimento**
* pista su asfalto con distrazioni leggere
* ~~pista in bosco~~ rimandata alla prossima volta

> Buona motivazione, partenza sicura.

| Prova | Esito |
| --- | --- |
| Pista breve | OK |
| Pista lunga | Da ripetere |"

NOTA_MD_K9="### K9 Cross Training - stand a 3 stazioni

1. riscaldamento
2. passo laterale
3. defaticamento

Il **passo laterale** va ripreso: appoggio posteriore ancora incerto.

Scheda degli esercizi: [K9 Cross](https://example.local/schede/k9-cross)"

# Mario Rossi: due incontri, saldo finale 100 - 20 - 25 = 55
crea_incontro_con_addebito "$MARIO_ID" "$MARIO_VOUCHER_ID" "$(days_ago 10)" "Dog Dance" 20.00 "Lezione di gruppo"
crea_incontro_con_addebito "$MARIO_ID" "$MARIO_VOUCHER_ID" "$(days_ago 3)" "Mantrailing" 25.00 "$NOTA_MD_MANTRAILING" true

# Giulia Verdi: due incontri, saldo finale 50 - 20 - 15 = 15
crea_incontro_con_addebito "$GIULIA_ID" "$GIULIA_VOUCHER_ID" "$(days_ago 20)" "Educazione singolo" 20.00 "Primo incontro"
crea_incontro_con_addebito "$GIULIA_ID" "$GIULIA_VOUCHER_ID" "$(days_ago 5)" "Passeggiata" 15.00 "Passeggiata di gruppo"

# Laura Bianchi: ricarica + due incontri più costosi -> saldo finale negativo
# Ricarica (movimento senza incontro collegato), precedente ai due incontri
psql_exec "
  INSERT INTO movimento_voucher (voucher_id, incontro_id, data_movimento, importo, descrizione)
  VALUES ('$LAURA_VOUCHER_ID', NULL, NOW() - INTERVAL '15 days', 50.00, 'Ricarica voucher');
"
crea_incontro_con_addebito "$LAURA_ID" "$LAURA_VOUCHER_ID" "$(days_ago 8)" "K9 Cross Training" 40.00 "$NOTA_MD_K9" true
crea_incontro_con_addebito "$LAURA_ID" "$LAURA_VOUCHER_ID" "$(days_ago 1)" "Piscina" 60.00 "Idroterapia"
# Saldo Laura: 30 (iniziale) + 50 (ricarica) - 40 - 60 = -20 (negativo, come richiesto)

# ------------------------------------------------------------
# 5. Account Keycloak per Mario e Laura (Giulia resta senza)
# ------------------------------------------------------------
VIEWER_ROLE_JSON=$(kc_api GET "/$KEYCLOAK_REALM/roles/viewer")

crea_utente_viewer() {
  local socio_id="$1" nome="$2" cognome="$3" email="$4"
  local username="${nome,,}.${cognome,,}"
  local password="${nome}${cognome}"

  echo "  Creo utente Keycloak '$username'..."
  kc_api POST "/$KEYCLOAK_REALM/users" "{
    \"username\": \"$username\",
    \"email\": \"$email\",
    \"firstName\": \"$nome\",
    \"lastName\": \"$cognome\",
    \"emailVerified\": true,
    \"enabled\": true
  }" > /dev/null || echo "    (utente già esistente, salto creazione)"

  local kc_user_id
  kc_user_id=$(kc_api GET "/$KEYCLOAK_REALM/users?username=$username" | jq -r '.[0].id')
  if [ -z "$kc_user_id" ] || [ "$kc_user_id" = "null" ]; then
    echo "ERRORE: impossibile recuperare l'utente Keycloak appena creato ($username)." >&2
    exit 1
  fi

  kc_api PUT "/$KEYCLOAK_REALM/users/$kc_user_id/reset-password" \
    "{\"type\":\"password\",\"value\":\"$password\",\"temporary\":false}" > /dev/null

  kc_api POST "/$KEYCLOAK_REALM/users/$kc_user_id/role-mappings/realm" "[$VIEWER_ROLE_JSON]" > /dev/null || true

  psql_exec "UPDATE socio SET id_viewer = '$kc_user_id' WHERE id = '$socio_id';"

  echo "    username: $username / password: $password"
}

crea_utente_viewer "$MARIO_ID" "Mario" "Rossi" "mario.rossi@example.local"
crea_utente_viewer "$LAURA_ID" "Laura" "Bianchi" "laura.bianchi@example.local"

echo ""
echo "=== Fatto ==="
echo ""
echo "Soci creati:"
echo "  Mario Rossi   (saldo voucher atteso: 55.00,  con account viewer)"
echo "  Laura Bianchi (saldo voucher atteso: -20.00, con account viewer e una ricarica)"
echo "  Giulia Verdi  (saldo voucher atteso: 15.00,  SENZA account viewer)"
echo ""
echo "Credenziali account viewer creati:"
echo "  mario.rossi / MarioRossi"
echo "  laura.bianchi / LauraBianchi"
echo ""
echo "Incontri con note MD:"
echo "  Mario Rossi / Mantrailing "
echo "  Laura Bianchi / K9 Cross Training "
echo ""
