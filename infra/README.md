# INFRA

Files necessari per la build dell'infrastruttura.

## Stack

- `keycloak/template.yaml` — Keycloak su ECS Fargate + RDS Postgres
- `db/template.yaml` — Aurora Serverless v2 (database applicativo)
- `backend/template.yaml` — Lambda + HTTP API Gateway + JWT Authorizer (Keycloak OIDC)
- `frontend/template.yaml` — S3 + CloudFront
- `auth/template.yaml` — DEPRECATED (Cognito, sostituito da Keycloak)

## Tenant configs

- `tenants/asd1.dev.env` — Configurazione ASD1 dev
- `tenants/asd1.prod.env` — Configurazione ASD1 prod

## CREAZIONE MANUALE

Vai su AWS Console > IAM > Roles > Create role -> GitHubActions-ClubManager

Scegli Web identity -> token.actions.githubusercontent.com

Configura Trust relationship con questo JSON (sostituisci tuo-username):

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::453224543995:oidc-provider/token.actions.githubusercontent.com"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
                },
                "StringLike": {
                    "token.actions.githubusercontent.com:sub": [
                        "repo:neottil/ClubManager:*"
                    ]
                }
            }
        }
    ]
}
```

Attach policy con permessi per: Lambda, API Gateway, CloudWatch Logs, IAM (roles), S3, CloudFront, SSM, ECS, ECR, RDS, EC2 (VPC/SG/Subnets), Elastic Load Balancing, STS.

Copia l'ARN del ruolo creato (es. arn:aws:iam::123456789012:role/GitHubActionsRole)

Aggiungi in GitHub Secrets: `AWS_ROLE_ARN = <l'ARN copiato>`

### Verifica rapida OIDC Provider

Prima di creare il ruolo, verifica che l'OIDC Provider GitHub esista:

```bash
aws iam list-open-id-connect-providers | grep token.actions.githubusercontent.com
```

Se non c'e', crealo con AWS CLI:

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b343ba288b7b42d7cc
```

### GitHub Secrets richiesti

- `AWS_ROLE_ARN` — ARN del ruolo IAM per GitHub Actions
- `KEYCLOAK_ADMIN_PASSWORD` — Password admin console Keycloak
- `KEYCLOAK_DB_PASSWORD` — Password database Keycloak
- `KEYCLOAK_ADMIN_CLIENT_SECRET` — Secret del client backend (confidential)
