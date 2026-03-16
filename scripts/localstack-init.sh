#!/bin/bash
# ============================================================
# Script di inizializzazione LocalStack
# Crea un Cognito User Pool mock e un utente admin di test
# ============================================================

set -e

REGION="eu-central-1"
ENDPOINT="http://localhost:4566"

echo "=== ClubManager LocalStack init ==="

# Crea User Pool
POOL_ID=$(aws --endpoint-url=$ENDPOINT cognito-idp create-user-pool \
  --pool-name "clubmanager-local" \
  --region $REGION \
  --query 'UserPool.Id' --output text)

echo "Created User Pool: $POOL_ID"

# Crea App Client
CLIENT_ID=$(aws --endpoint-url=$ENDPOINT cognito-idp create-user-pool-client \
  --user-pool-id "$POOL_ID" \
  --client-name "clubmanager-spa-local" \
  --no-generate-secret \
  --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH \
  --region $REGION \
  --query 'UserPoolClient.ClientId' --output text)

echo "Created Client: $CLIENT_ID"

# Crea gruppo admin
aws --endpoint-url=$ENDPOINT cognito-idp create-group \
  --user-pool-id "$POOL_ID" \
  --group-name admin \
  --region $REGION || true

# Crea utente admin di test
aws --endpoint-url=$ENDPOINT cognito-idp admin-create-user \
  --user-pool-id "$POOL_ID" \
  --username "admin@clubmanager.local" \
  --user-attributes Name=email,Value=admin@clubmanager.local Name=email_verified,Value=true \
  --temporary-password "TempPass123!" \
  --message-action SUPPRESS \
  --region $REGION || true

aws --endpoint-url=$ENDPOINT cognito-idp admin-set-user-password \
  --user-pool-id "$POOL_ID" \
  --username "admin@clubmanager.local" \
  --password "Admin123!@#" \
  --permanent \
  --region $REGION || true

aws --endpoint-url=$ENDPOINT cognito-idp admin-add-user-to-group \
  --user-pool-id "$POOL_ID" \
  --username "admin@clubmanager.local" \
  --group-name admin \
  --region $REGION || true

echo "=== LocalStack init complete ==="
echo "User Pool ID: $POOL_ID"
echo "Client ID:    $CLIENT_ID"
echo "Admin user:   admin@clubmanager.local / Admin123!@#"

# Scrivi i valori in un file per riferimento
cat > /tmp/localstack-outputs.txt << EOF
USER_POOL_ID=$POOL_ID
CLIENT_ID=$CLIENT_ID
EOF
