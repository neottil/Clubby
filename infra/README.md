# INFRA

Files necessari per la build dell'infrastruttura.

## CREAZIONE MANUALE
Vai su AWS Console > IAM > Roles > Create role -> GitHubActions-ClubManager 

Scegli Web identity → token.actions.githubusercontent.com

Configura Trust relationship con questo JSON (sostituisci tuo-username):

json
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
Attach policy:
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Cognito",
      "Effect": "Allow",
      "Action": [
        "cognito-idp:CreateUserPool",
        "cognito-idp:UpdateUserPool",
        "cognito-idp:DeleteUserPool",
        "cognito-idp:DescribeUserPool",
        "cognito-idp:CreateUserPoolClient",
        "cognito-idp:UpdateUserPoolClient",
        "cognito-idp:DeleteUserPoolClient",
        "cognito-idp:DescribeUserPoolClient",
        "cognito-idp:CreateUserPoolDomain",
        "cognito-idp:DeleteUserPoolDomain",
        "cognito-idp:DescribeUserPoolDomain",
        "cognito-idp:CreateGroup",
        "cognito-idp:UpdateGroup",
        "cognito-idp:DeleteGroup",
        "cognito-idp:ListGroups"
      ],
      "Resource": "*"
    },
    {
      "Sid": "Lambda",
      "Effect": "Allow",
      "Action": [
        "lambda:CreateFunction",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "lambda:DeleteFunction",
        "lambda:GetFunction",
        "lambda:ListFunctions",
        "lambda:AddPermission",
        "lambda:RemovePermission",
        "lambda:TagResource",
        "lambda:UntagResource"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ApiGatewayV2",
      "Effect": "Allow",
      "Action": [
        "apigateway:GET",
        "apigateway:POST",
        "apigateway:PUT",
        "apigateway:PATCH",
        "apigateway:DELETE"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CloudWatchLogs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams",
        "logs:DeleteLogGroup"
      ],
      "Resource": "*"
    },
    {
      "Sid": "IAMForLambdaRoles",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:PassRole",
        "iam:CreatePolicy",
        "iam:DeletePolicy",
        "iam:CreatePolicyVersion",
        "iam:DeletePolicyVersion",
        "iam:GetRole",
        "iam:GetPolicy",
        "iam:ListRoles"
      ],
      "Resource": "*"
    },
    {
      "Sid": "STSCallerIdentity",
      "Effect": "Allow",
      "Action": "sts:GetCallerIdentity",
      "Resource": "*"
    }
  ]
}

Copia l'ARN del ruolo creato (es. arn:aws:iam::123456789012:role/GitHubActionsRole)

Aggiungi in GitHub Secrets: AWS_ROLE_ARN = <l'ARN copiato>

Verifica rapida OIDC Provider
Prima di creare il ruolo, verifica che l'OIDC Provider GitHub esista:

bash
aws iam list-open-id-connect-providers | grep token.actions.githubusercontent.com
Se non c'è, crealo con AWS CLI:

bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b343ba288b7b42d7cc

copiare arn in github secrets.