#!/bin/bash
# ============================================================
# Script di inizializzazione LocalStack
# Gira nell'init container (amazon/aws-cli) dopo che
# LocalStack è healthy. Crea le risorse Cognito e scrive
# gli ID in /shared/localstack.env (volume condiviso).
# ============================================================

set -e

REGION="eu-central-1"
ENDPOINT="http://localstack:4566"

echo "=== ClubManager LocalStack init ==="

# Crea User Pool
POOL_ID=$(aws --endpoint-url="$ENDPOINT" cognito-idp create-user-pool \
  --pool-name "clubmanager-local" \
  --region "$REGION" \
  --query 'UserPool.Id' --output text)

echo "Created User Pool: $POOL_ID"

# Crea App Client con OAuth / PKCE
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

echo "Created Client: $CLIENT_ID"

# Crea gruppo admin
aws --endpoint-url="$ENDPOINT" cognito-idp create-group \
  --user-pool-id "$POOL_ID" \
  --group-name admin \
  --region "$REGION" || true

# Crea utente admin di test
aws --endpoint-url="$ENDPOINT" cognito-idp admin-create-user \
  --user-pool-id "$POOL_ID" \
  --username "admin@clubmanager.local" \
  --user-attributes Name=email,Value=admin@clubmanager.local Name=email_verified,Value=true \
  --temporary-password "TempPass123!" \
  --message-action SUPPRESS \
  --region "$REGION" || true

aws --endpoint-url="$ENDPOINT" cognito-idp admin-set-user-password \
  --user-pool-id "$POOL_ID" \
  --username "admin@clubmanager.local" \
  --password "Admin123!@#" \
  --permanent \
  --region "$REGION" || true

aws --endpoint-url="$ENDPOINT" cognito-idp admin-add-user-to-group \
  --user-pool-id "$POOL_ID" \
  --username "admin@clubmanager.local" \
  --group-name admin \
  --region "$REGION" || true

# Scrivi gli ID nel volume condiviso (letto da backend e frontend)
mkdir -p /shared
cat > /shared/localstack.env << EOF
COGNITO_USER_POOL_ID=$POOL_ID
COGNITO_CLIENT_ID=$CLIENT_ID
EOF

echo "=== LocalStack init complete ==="
echo "User Pool ID: $POOL_ID"
echo "Client ID:    $CLIENT_ID"
echo "Admin user:   admin@clubmanager.local / Admin123!@#"
echo "Written /shared/localstack.env"
