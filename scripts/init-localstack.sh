#!/bin/bash
# ============================================================
# Inizializzazione LocalStack per ClubManager
# Eseguire UNA VOLTA dopo "docker compose up -d"
#
# Prerequisiti: aws CLI installato sull'host
#   macOS:  brew install awscli
#   Linux:  apt install awscli  oppure  pip install awscli
#   Windows: scarica da https://aws.amazon.com/cli/
#
# Uso:
#   ./scripts/init-localstack.sh
#
# Output: scrive frontend/.env.local e backend/.env
# con i valori generati (POOL_ID, CLIENT_ID).
# ============================================================

set -e

ENDPOINT="http://localhost:4566"
REGION="eu-central-1"

# Credenziali fittizie (LocalStack non le valida)
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=$REGION

echo ""
echo "=== ClubManager - Init LocalStack ==="
echo ""

# Attendi che LocalStack sia pronto
echo "▶ Attendo LocalStack su $ENDPOINT..."
for i in $(seq 1 30); do
  if curl -sf "$ENDPOINT/_localstack/health" > /dev/null 2>&1; then
    echo "  LocalStack pronto."
    break
  fi
  if [ $i -eq 30 ]; then
    echo "  ERRORE: LocalStack non risponde dopo 30 tentativi."
    echo "  Assicurati che docker compose sia avviato: docker compose up -d"
    exit 1
  fi
  echo "  ($i/30) In attesa..."
  sleep 2
done

# Crea User Pool
echo ""
echo "▶ Creo User Pool Cognito..."
POOL_ID=$(aws --endpoint-url="$ENDPOINT" cognito-idp create-user-pool \
  --pool-name "clubmanager-local" \
  --region "$REGION" \
  --query 'UserPool.Id' --output text)
echo "  Pool ID: $POOL_ID"

# Crea App Client
echo "▶ Creo App Client..."
CLIENT_ID=$(aws --endpoint-url="$ENDPOINT" cognito-idp create-user-pool-client \
  --user-pool-id "$POOL_ID" \
  --client-name "clubmanager-spa-local" \
  --no-generate-secret \
  --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH ALLOW_USER_SRP_AUTH \
  --supported-identity-providers COGNITO \
  --callback-urls "http://localhost:5173/callback" \
  --logout-urls "http://localhost:5173/" \
  --allowed-o-auth-flows code \
  --allowed-o-auth-scopes openid email profile \
  --allowed-o-auth-flows-user-pool-client \
  --region "$REGION" \
  --query 'UserPoolClient.ClientId' --output text)
echo "  Client ID: $CLIENT_ID"

# Crea gruppo admin
echo "▶ Creo gruppo admin..."
aws --endpoint-url="$ENDPOINT" cognito-idp create-group \
  --user-pool-id "$POOL_ID" \
  --group-name admin \
  --region "$REGION" > /dev/null 2>&1 || true

# Crea utente admin di test
echo "▶ Creo utente admin di test (admin@clubmanager.local)..."
aws --endpoint-url="$ENDPOINT" cognito-idp admin-create-user \
  --user-pool-id "$POOL_ID" \
  --username "admin@clubmanager.local" \
  --user-attributes Name=email,Value=admin@clubmanager.local Name=email_verified,Value=true \
  --temporary-password "TempPass123!" \
  --message-action SUPPRESS \
  --region "$REGION" > /dev/null 2>&1 || true

aws --endpoint-url="$ENDPOINT" cognito-idp admin-set-user-password \
  --user-pool-id "$POOL_ID" \
  --username "admin@clubmanager.local" \
  --password "Admin123!@#" \
  --permanent \
  --region "$REGION" > /dev/null 2>&1 || true

aws --endpoint-url="$ENDPOINT" cognito-idp admin-add-user-to-group \
  --user-pool-id "$POOL_ID" \
  --username "admin@clubmanager.local" \
  --group-name admin \
  --region "$REGION" > /dev/null 2>&1 || true

echo "  Utente creato."

# Scrivi frontend/.env.local
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

cat > "$ROOT_DIR/frontend/.env.local" << EOF
VITE_API_BASE_URL=http://localhost:3000
VITE_COGNITO_USER_POOL_ID=$POOL_ID
VITE_COGNITO_CLIENT_ID=$CLIENT_ID
VITE_COGNITO_ENDPOINT=http://localhost:4566
VITE_TENANT_ID=asd1
EOF

# Scrivi backend/.env
cat > "$ROOT_DIR/backend/.env" << EOF
NODE_ENV=development
TENANT_ID=asd1
DB_LOCAL=true
DB_HOST=localhost
DB_PORT=5432
DB_NAME=clubmanager
DB_USER=clubmanager
DB_PASSWORD=clubmanager_dev
DB_CLUSTER_ARN=arn:aws:rds:eu-central-1:000000000000:cluster:local
DB_SECRET_ARN=arn:aws:secretsmanager:eu-central-1:000000000000:secret:local
COGNITO_USER_POOL_ID=$POOL_ID
AWS_REGION_NAME=eu-central-1
AWS_ENDPOINT=http://localhost:4566
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
EOF

echo ""
echo "=== Fatto! ==="
echo ""
echo "  User Pool ID : $POOL_ID"
echo "  Client ID    : $CLIENT_ID"
echo "  Admin user   : admin@clubmanager.local / Admin123!@#"
echo ""
echo "  Scritti:"
echo "    frontend/.env.local"
echo "    backend/.env"
echo ""
echo "  Prossimi passi:"
echo "    1. cd backend  && npx tsx src/local/server.ts"
echo "    2. cd frontend && npm run dev"
echo ""
