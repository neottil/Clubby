#!/bin/bash
# ============================================================
# Inizializzazione realm Keycloak — versione non interattiva per k8s.
#
# Eseguito dal Job "keycloak-realm-init" (vedi k8s/templates/infra/
# keycloak-init-job.yaml), lanciato dal workflow Infra. A differenza di
# scripts/init-local-keycloak.sh (uso locale, interattivo, scrive backend/.env
# e frontend/.env.local), questo script:
#   - non chiede input: tutti i parametri arrivano da variabili d'ambiente
#     (nessun default silenzioso: fallisce subito se qualcosa manca)
#   - non scrive alcun file .env (non ha senso in k8s)
#   - non crea utenti di test con credenziali note (admin@clubmanager.local
#     ecc.): crea un solo utente admin reale, con password temporanea che
#     Keycloak obbliga a cambiare al primo login
#   - stampa un riepilogo finale con i valori da copiare nei GitHub Secrets
#     della pipeline Build & Deploy, invece di scriverli su disco
#
# Variabili richieste: KEYCLOAK_URL, REALM, ADMIN_USER, ADMIN_PASS,
# FRONTEND_URL, BACKEND_CLIENT_SECRET, INITIAL_ADMIN_EMAIL,
# INITIAL_ADMIN_PASSWORD
# ============================================================
set -euo pipefail

: "${KEYCLOAK_URL:?variabile KEYCLOAK_URL mancante}"
: "${REALM:?variabile REALM mancante}"
: "${ADMIN_USER:?variabile ADMIN_USER mancante}"
: "${ADMIN_PASS:?variabile ADMIN_PASS mancante}"
: "${FRONTEND_URL:?variabile FRONTEND_URL mancante}"
: "${BACKEND_CLIENT_SECRET:?variabile BACKEND_CLIENT_SECRET mancante}"
: "${INITIAL_ADMIN_EMAIL:?variabile INITIAL_ADMIN_EMAIL mancante}"
: "${INITIAL_ADMIN_PASSWORD:?variabile INITIAL_ADMIN_PASSWORD mancante}"

echo "▶ Attendo Keycloak su $KEYCLOAK_URL..."
for i in $(seq 1 60); do
  if curl -sf "$KEYCLOAK_URL/health/ready" >/dev/null 2>&1; then
    echo "  Keycloak pronto."
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "ERRORE: Keycloak non risponde dopo 60 tentativi." >&2
    exit 1
  fi
  sleep 2
done

echo "▶ Ottengo token admin..."
ADMIN_TOKEN=$(curl -sf -X POST \
  "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=$ADMIN_USER" \
  -d "password=$ADMIN_PASS" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
  echo "ERRORE: impossibile ottenere token admin." >&2
  exit 1
fi
echo "  Token ottenuto."

kc_api() {
  local method="$1" path="$2" data="${3:-}"
  if [ -n "$data" ]; then
    curl -sf -X "$method" "$KEYCLOAK_URL/admin/realms$path" \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$data"
  else
    curl -sf -X "$method" "$KEYCLOAK_URL/admin/realms$path" \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      -H "Content-Type: application/json"
  fi
}

echo "▶ Creo realm '$REALM'..."
kc_api POST "" "{
  \"realm\": \"$REALM\",
  \"enabled\": true,
  \"registrationAllowed\": true,
  \"loginWithEmailAllowed\": true,
  \"duplicateEmailsAllowed\": false,
  \"resetPasswordAllowed\": true,
  \"editUsernameAllowed\": false,
  \"bruteForceProtected\": true
}" 2>/dev/null || echo "  (realm già esistente, salto)"

# Durata dell'access token: 2 ore (default Keycloak: 5 minuti). PUT di
# aggiornamento, idempotente anche se il realm esisteva già.
echo "▶ Imposto la durata dell'access token a 2 ore..."
kc_api PUT "/$REALM" '{"accessTokenLifespan": 7200}' 2>/dev/null \
  && echo "  Fatto." || echo "  ERRORE nell'aggiornare la durata del token."

echo "▶ Creo client 'clubmanager-spa'..."
kc_api POST "/$REALM/clients" "{
  \"clientId\": \"clubmanager-spa\",
  \"name\": \"ClubManager SPA\",
  \"enabled\": true,
  \"publicClient\": true,
  \"standardFlowEnabled\": true,
  \"directAccessGrantsEnabled\": false,
  \"rootUrl\": \"$FRONTEND_URL\",
  \"baseUrl\": \"/\",
  \"redirectUris\": [\"$FRONTEND_URL/*\"],
  \"webOrigins\": [\"$FRONTEND_URL\"],
  \"attributes\": {
    \"pkce.code.challenge.method\": \"S256\"
  },
  \"protocol\": \"openid-connect\",
  \"fullScopeAllowed\": true
}" 2>/dev/null || echo "  (client spa già esistente, salto)"

echo "▶ Creo client 'clubmanager-backend'..."
kc_api POST "/$REALM/clients" "{
  \"clientId\": \"clubmanager-backend\",
  \"name\": \"ClubManager Backend\",
  \"enabled\": true,
  \"publicClient\": false,
  \"serviceAccountsEnabled\": true,
  \"standardFlowEnabled\": false,
  \"directAccessGrantsEnabled\": false,
  \"secret\": \"$BACKEND_CLIENT_SECRET\",
  \"protocol\": \"openid-connect\"
}" 2>/dev/null || echo "  (client backend già esistente, salto)"

echo "▶ Configuro permessi service account backend..."
BACKEND_CLIENT_ID=$(kc_api GET "/$REALM/clients?clientId=clubmanager-backend" | jq -r '.[0].id')
SA_USER_ID=$(kc_api GET "/$REALM/clients/$BACKEND_CLIENT_ID/service-account-user" | jq -r '.id')
REALM_MGMT_CLIENT_ID=$(kc_api GET "/$REALM/clients?clientId=realm-management" | jq -r '.[0].id')

for ROLE_NAME in manage-users view-users query-users manage-realm view-realm; do
  ROLE_JSON=$(kc_api GET "/$REALM/clients/$REALM_MGMT_CLIENT_ID/roles/$ROLE_NAME" 2>/dev/null || echo "")
  if [ -n "$ROLE_JSON" ]; then
    kc_api POST "/$REALM/users/$SA_USER_ID/role-mappings/clients/$REALM_MGMT_CLIENT_ID" "[$ROLE_JSON]" 2>/dev/null || true
  fi
done
echo "  Permessi configurati."

echo "▶ Creo ruoli realm..."
kc_api POST "/$REALM/roles" '{"name": "admin", "description": "Amministratore ClubManager"}' 2>/dev/null || echo "  (ruolo admin già esistente)"
kc_api POST "/$REALM/roles" '{"name": "viewer", "description": "Viewer ClubManager"}' 2>/dev/null || echo "  (ruolo viewer già esistente)"

echo "▶ Creo il primo utente admin ($INITIAL_ADMIN_EMAIL), password temporanea..."
kc_api POST "/$REALM/users" "{
  \"username\": \"$INITIAL_ADMIN_EMAIL\",
  \"email\": \"$INITIAL_ADMIN_EMAIL\",
  \"emailVerified\": true,
  \"enabled\": true
}" 2>/dev/null || echo "  (utente già esistente, salto creazione)"

INITIAL_ADMIN_KC_ID=$(kc_api GET "/$REALM/users?email=$INITIAL_ADMIN_EMAIL" | jq -r '.[0].id')
if [ -n "$INITIAL_ADMIN_KC_ID" ] && [ "$INITIAL_ADMIN_KC_ID" != "null" ]; then
  kc_api PUT "/$REALM/users/$INITIAL_ADMIN_KC_ID/reset-password" \
    "{\"type\":\"password\",\"value\":\"$INITIAL_ADMIN_PASSWORD\",\"temporary\":true}" 2>/dev/null || true
  ADMIN_ROLE_JSON=$(kc_api GET "/$REALM/roles/admin")
  kc_api POST "/$REALM/users/$INITIAL_ADMIN_KC_ID/role-mappings/realm" "[$ADMIN_ROLE_JSON]" 2>/dev/null || true
  echo "  Utente admin creato: ruolo assegnato, password da cambiare al primo login."
else
  echo "ERRORE: impossibile recuperare l'utente admin appena creato." >&2
  exit 1
fi

echo ""
echo "=== Fatto ==="
echo ""
echo "--- COPIA QUESTI VALORI NELL'ENVIRONMENT GITHUB DI QUESTO AMBIENTE ---"
echo "KEYCLOAK_REALM=$REALM"
echo "KEYCLOAK_ADMIN_CLIENT_ID=clubmanager-backend"
echo "KEYCLOAK_ADMIN_CLIENT_SECRET=$BACKEND_CLIENT_SECRET   (Secret)"
echo "KEYCLOAK_CLIENT_ID=clubmanager-spa"
echo "---------------------------------------------------------------------------"
echo ""
echo "Primo accesso amministratore:"
echo "  URL      : $FRONTEND_URL"
echo "  Email    : $INITIAL_ADMIN_EMAIL"
echo "  Password : (quella fornita al lancio della pipeline Infra, temporanea — Keycloak chiederà di cambiarla al primo login)"
echo ""
