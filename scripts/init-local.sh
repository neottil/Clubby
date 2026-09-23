#!/usr/bin/env bash
# Prepara l'ambiente di sviluppo locale: genera i file .env dei tre moduli e
# la chiave con cui l'authorizer firma i token.
#
# Non c'è nulla da configurare oltre ai .env: l'authorizer crea da solo il
# primo amministratore al primo avvio, se il database degli utenti è vuoto.
#
# Va eseguito una volta dopo `docker compose up -d` (o dopo un reset dei
# volumi). È idempotente e non sovrascrive nulla senza chiedere.
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

chiedi() {
  local prompt="$1" predefinito="$2" risposta
  read -r -p "$prompt [$predefinito]: " risposta
  echo "${risposta:-$predefinito}"
}

conferma_sovrascrittura() {
  local file="$1" risposta
  [ -f "$file" ] || return 0
  read -r -p "  $file esiste già. Sovrascriverlo? [s/N]: " risposta
  case "$risposta" in [sS]*) return 0 ;; *) return 1 ;; esac
}

echo "=== Configurazione dell'ambiente locale di Clubby ==="
echo

TENANT_NAME=$(chiedi "Nome dell'associazione (mostrato nell'interfaccia)" "Clubby")
API_BASE_URL=$(chiedi "URL del backend" "http://localhost:3000")
AUTH_BASE_URL=$(chiedi "URL dell'authorizer" "http://localhost:3001")

echo
echo "Primo amministratore (solo email e password: l'anagrafica sta sulla scheda"
echo "socio, che si censisce poi dal pannello):"
ADMIN_EMAIL=$(chiedi "  Email" "admin@clubby.local")

# Password chiesta, con un default comodo per lo sviluppo. Solo in locale: in
# cluster la genera Infra. La lunghezza minima è quella dell'authorizer
# (crypto/password.ts): una password più corta verrebbe rifiutata al suo
# avvio e l'admin non sarebbe creato, con il solo indizio di un errore nel log.
LUNGHEZZA_MINIMA_PASSWORD=10
while true; do
  ADMIN_PASSWORD=$(chiedi "  Password (almeno $LUNGHEZZA_MINIMA_PASSWORD caratteri)" "adminadmin")
  [ "${#ADMIN_PASSWORD}" -ge "$LUNGHEZZA_MINIMA_PASSWORD" ] && break
  echo "  Troppo corta: l'authorizer non creerebbe l'admin. Riprova."
done

# Chiave di firma dei token. Generarla e salvarla nel .env, invece di
# lasciarla generare all'authorizer a ogni avvio, evita di dover rifare
# l'accesso a ogni riavvio del processo durante lo sviluppo.
echo
echo "Genero la chiave RSA per la firma dei token..."
JWT_KEY=$(openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 2>/dev/null | awk '{printf "%s\\n", $0}')

echo
echo "Scrivo i file di configurazione:"

if conferma_sovrascrittura "$ROOT_DIR/backend/.env"; then
  cat > "$ROOT_DIR/backend/.env" << EOF
DB_HOST=localhost
DB_PORT=5432
DB_NAME=clubby
DB_USER=clubby
DB_PASSWORD=clubby

AUTH_ISSUER=$AUTH_BASE_URL
AUTH_INTERNAL_URL=$AUTH_BASE_URL

# Moduli opzionali, attivi solo con il valore esatto "true". In locale si
# sviluppa con tutto acceso (i test delle API li coprono); per provare
# l'applicazione senza un modulo basta mettere "false" qui e nella
# corrispondente VITE_ di frontend/.env.local.
ENABLE_MODULE_TESSERAMENTO=true
ENABLE_MODULE_FATTURAZIONE=true

PORT=3000
APP_VERSION=dev
EOF
  echo "  backend/.env scritto."
fi

if conferma_sovrascrittura "$ROOT_DIR/authorizer/.env"; then
  cat > "$ROOT_DIR/authorizer/.env" << EOF
PORT=3001

DB_HOST=localhost
DB_PORT=5432
DB_NAME=clubby_auth
DB_USER=clubby_auth
DB_PASSWORD=clubby_auth

AUTH_ISSUER=$AUTH_BASE_URL
AUTH_JWT_PRIVATE_KEY="$JWT_KEY"

INITIAL_ADMIN_EMAIL=$ADMIN_EMAIL
INITIAL_ADMIN_PASSWORD=$ADMIN_PASSWORD

CORS_ORIGIN=http://localhost:5173
EOF
  echo "  authorizer/.env scritto."
fi

# Le variabili che questo script non conosce (tema, logo) vengono rilette dal
# file precedente e riscritte: si impostano a mano una volta, e un nuovo run
# non deve cancellarle in silenzio.
PRESERVATE=""
if [ -f "$ROOT_DIR/frontend/.env.local" ]; then
  PRESERVATE=$(grep -E '^(VITE_THEME_[A-Z_]+|VITE_LOGO_FILE)=' \
    "$ROOT_DIR/frontend/.env.local" || true)
fi

if conferma_sovrascrittura "$ROOT_DIR/frontend/.env.local"; then
  cat > "$ROOT_DIR/frontend/.env.local" << EOF
VITE_API_BASE_URL=$API_BASE_URL
VITE_AUTH_BASE_URL=$AUTH_BASE_URL
VITE_TENANT_NAME=$TENANT_NAME

# Moduli opzionali: devono corrispondere agli ENABLE_MODULE_* di backend/.env,
# altrimenti l'applicazione mostra pagine che il backend rifiuta (o le nasconde
# pur essendo attive).
VITE_ENABLE_MODULE_TESSERAMENTO=true
VITE_ENABLE_MODULE_FATTURAZIONE=true
EOF
  if [ -n "$PRESERVATE" ]; then
    echo "$PRESERVATE" >> "$ROOT_DIR/frontend/.env.local"
    echo "  frontend/.env.local scritto (variabili di personalizzazione preservate)."
  else
    echo "  frontend/.env.local scritto."
  fi
fi

cat << EOF

=== Fatto ===

Avvia i tre moduli:
  npm run dev            (tutti insieme)

Poi apri http://localhost:5173 e accedi con:
  email:    $ADMIN_EMAIL
  password: $ADMIN_PASSWORD

Al primo accesso ti verrà chiesto di sostituirla.

Nota: l'amministratore iniziale viene creato solo se il database degli utenti
è vuoto. Se hai già usato l'applicazione e vuoi ripartire da zero, azzera i
volumi con "docker compose down -v" e rilancia "docker compose up -d".
EOF
