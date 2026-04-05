#!/bin/bash
# ============================================================
# Inizializzazione Keycloak per ClubManager
# Eseguire UNA VOLTA dopo "docker compose up -d"
#
# Prerequisiti: curl, jq
#   macOS:  brew install jq
#   Linux:  apt install jq
#
# Uso:
#   ./scripts/init-keycloak.sh
#
# Output: scrive frontend/.env.local e backend/.env
# con i valori del realm Keycloak configurato.
# ============================================================

set -e

KEYCLOAK_URL="http://localhost:8080"
REALM="clubmanager"
ADMIN_USER="admin"
ADMIN_PASS="admin"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo ""
echo "=== ClubManager - Init Keycloak ==="
echo ""

# Attendi che Keycloak sia pronto
echo "▶ Attendo Keycloak su $KEYCLOAK_URL..."
for i in $(seq 1 60); do
  if curl -sf "$KEYCLOAK_URL/health/ready" > /dev/null 2>&1; then
    echo "  Keycloak pronto."
    break
  fi
  if [ $i -eq 60 ]; then
    echo "  ERRORE: Keycloak non risponde dopo 60 tentativi."
    echo "  Assicurati che docker compose sia avviato: docker compose up -d"
    exit 1
  fi
  echo "  ($i/60) In attesa..."
  sleep 2
done

# Ottieni token admin
echo ""
echo "▶ Ottengo token admin..."
ADMIN_TOKEN=$(curl -sf -X POST \
  "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=$ADMIN_USER" \
  -d "password=$ADMIN_PASS" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
  echo "  ERRORE: impossibile ottenere token admin."
  exit 1
fi
echo "  Token ottenuto."

# Funzione helper per chiamate API Keycloak
kc_api() {
  local method="$1"
  local path="$2"
  local data="$3"
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

# Crea realm (ignora errore se esiste già)
echo ""
echo "▶ Creo realm '$REALM'..."
kc_api POST "" "{
  \"realm\": \"$REALM\",
  \"enabled\": true,
  \"registrationAllowed\": false,
  \"loginWithEmailAllowed\": true,
  \"duplicateEmailsAllowed\": false,
  \"resetPasswordAllowed\": true,
  \"editUsernameAllowed\": false,
  \"bruteForceProtected\": true
}" 2>/dev/null || echo "  (realm già esistente, salto)"

# Crea client SPA (public, PKCE)
echo "▶ Creo client 'clubmanager-spa'..."
kc_api POST "/$REALM/clients" "{
  \"clientId\": \"clubmanager-spa\",
  \"name\": \"ClubManager SPA\",
  \"enabled\": true,
  \"publicClient\": true,
  \"standardFlowEnabled\": true,
  \"directAccessGrantsEnabled\": false,
  \"rootUrl\": \"http://localhost:5173\",
  \"baseUrl\": \"/\",
  \"redirectUris\": [\"http://localhost:5173/*\"],
  \"webOrigins\": [\"http://localhost:5173\"],
  \"attributes\": {
    \"pkce.code.challenge.method\": \"S256\"
  },
  \"protocol\": \"openid-connect\",
  \"fullScopeAllowed\": true
}" 2>/dev/null || echo "  (client spa già esistente, salto)"

# Crea client backend (confidential, per admin API)
echo "▶ Creo client 'clubmanager-backend'..."
kc_api POST "/$REALM/clients" "{
  \"clientId\": \"clubmanager-backend\",
  \"name\": \"ClubManager Backend\",
  \"enabled\": true,
  \"publicClient\": false,
  \"serviceAccountsEnabled\": true,
  \"standardFlowEnabled\": false,
  \"directAccessGrantsEnabled\": false,
  \"secret\": \"clubmanager-backend-secret\",
  \"protocol\": \"openid-connect\"
}" 2>/dev/null || echo "  (client backend già esistente, salto)"

# Assegna ruoli realm-management al service account del backend
echo "▶ Configuro permessi service account backend..."
BACKEND_CLIENT_ID=$(kc_api GET "/$REALM/clients?clientId=clubmanager-backend" | jq -r '.[0].id')
SA_USER_ID=$(kc_api GET "/$REALM/clients/$BACKEND_CLIENT_ID/service-account-user" | jq -r '.id')
REALM_MGMT_CLIENT_ID=$(kc_api GET "/$REALM/clients?clientId=realm-management" | jq -r '.[0].id')

# Get the roles we need
for ROLE_NAME in manage-users view-users query-users manage-realm view-realm; do
  ROLE_JSON=$(kc_api GET "/$REALM/clients/$REALM_MGMT_CLIENT_ID/roles/$ROLE_NAME" 2>/dev/null || echo "")
  if [ -n "$ROLE_JSON" ] && [ "$ROLE_JSON" != "" ]; then
    kc_api POST "/$REALM/users/$SA_USER_ID/role-mappings/clients/$REALM_MGMT_CLIENT_ID" "[$ROLE_JSON]" 2>/dev/null || true
  fi
done
echo "  Permessi configurati."

# Crea ruoli realm: admin, viewer
echo "▶ Creo ruoli realm..."
kc_api POST "/$REALM/roles" '{"name": "admin", "description": "Amministratore ClubManager"}' 2>/dev/null || echo "  (ruolo admin già esistente)"
kc_api POST "/$REALM/roles" '{"name": "viewer", "description": "Viewer ClubManager"}' 2>/dev/null || echo "  (ruolo viewer già esistente)"

# Crea utente admin di test
echo "▶ Creo utente admin di test (admin@clubmanager.local)..."
kc_api POST "/$REALM/users" "{
  \"username\": \"admin@clubmanager.local\",
  \"email\": \"admin@clubmanager.local\",
  \"emailVerified\": true,
  \"enabled\": true,
  \"credentials\": [{
    \"type\": \"password\",
    \"value\": \"Admin123!\",
    \"temporary\": false
  }]
}" 2>/dev/null || echo "  (utente admin già esistente, salto)"

# Assegna ruolo admin all'utente
ADMIN_KC_USER_ID=$(kc_api GET "/$REALM/users?email=admin@clubmanager.local" | jq -r '.[0].id')
ADMIN_ROLE_JSON=$(kc_api GET "/$REALM/roles/admin")
if [ -n "$ADMIN_KC_USER_ID" ] && [ "$ADMIN_KC_USER_ID" != "null" ]; then
  kc_api POST "/$REALM/users/$ADMIN_KC_USER_ID/role-mappings/realm" "[$ADMIN_ROLE_JSON]" 2>/dev/null || true
  echo "  Utente admin creato e ruolo assegnato."
fi

# Scrivi frontend/.env.local
cat > "$ROOT_DIR/frontend/.env.local" << EOF
VITE_API_BASE_URL=http://localhost:3000
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_REALM=clubmanager
VITE_KEYCLOAK_CLIENT_ID=clubmanager-spa
VITE_TENANT_ID=asd1
EOF

# Scrivi backend/.env
cat > "$ROOT_DIR/backend/.env" << EOF
NODE_ENV=development
TENANT_ID=asd1
DB_HOST=localhost
DB_PORT=5432
DB_NAME=clubmanager
DB_USER=clubmanager
DB_PASSWORD=clubmanager_dev
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=clubmanager
KEYCLOAK_ADMIN_CLIENT_ID=clubmanager-backend
KEYCLOAK_ADMIN_CLIENT_SECRET=clubmanager-backend-secret
EOF

echo ""
echo "=== Fatto! ==="
echo ""
echo "  Keycloak URL : $KEYCLOAK_URL"
echo "  Realm        : $REALM"
echo "  Admin user   : admin@clubmanager.local / Admin123!"
echo "  Admin console: $KEYCLOAK_URL/admin (admin / admin)"
echo ""
echo "  Scritti:"
echo "    frontend/.env.local"
echo "    backend/.env"
echo ""
echo "  Prossimi passi:"
echo "    1. cd backend  && npx tsx src/local/server.ts"
echo "    2. cd frontend && npm run dev"
echo ""
