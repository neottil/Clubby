# Struttura dei manifest k8s


I manifest di backend/frontend sono **colocati nel folder del componente a cui appartengono**
(`backend/k8s/`, `frontend/k8s/`), non più in un `k8s/templates/app/` condiviso: così un cambio ai manifest
di un componente ricade sotto lo stesso prefisso di path (`backend/`/`frontend/`) usato da `Build & Deploy`
per decidere cosa buildare/deployare (vedi sopra), senza bisogno di regole separate per "solo k8s".
`k8s/templates/infra/` (usato solo da **Infra**: namespace e Postgres) resta invece centralizzato, dato
che non appartiene a nessuno dei tre moduli.

```
backend/
├── k8s/                     # manifest con placeholder ${VAR}, applicati da deploy-backend
│   ├── configmap.yaml        # variabili non sensibili (DB_*, AUTH_ISSUER, AUTH_INTERNAL_URL, ...)
│   ├── secret.yaml           # DB_PASSWORD
│   ├── deployment.yaml
│   ├── service.yaml
│   └── ingress.yaml           # possiede la richiesta TLS/cert-manager (ClusterIssuer "letsencrypt")
│                               # per l'host condiviso col frontend
└── ...                       # codice del backend

authorizer/
├── k8s/                     # manifest con placeholder ${VAR}, applicati da deploy-authorizer
│   ├── configmap.yaml        # DB_*, AUTH_ISSUER, CORS_ORIGIN, PORT, APP_VERSION
│   ├── secret.yaml           # AUTH_DB_PASSWORD, chiave di firma, admin iniziale
│   ├── deployment.yaml
│   ├── service.yaml
│   └── ingress.yaml           # host proprio (AUTH_DOMAIN), certificato TLS separato
└── ...                       # codice dell'authorizer

frontend/
├── k8s/                     # manifest con placeholder ${VAR}, applicati da deploy-frontend
│   ├── configmap.yaml        # /version.json e /config.json del club, serviti da nginx
│   ├── deployment.yaml
│   ├── service.yaml
│   └── ingress.yaml           # stesso host/secretName TLS del backend, SENZA annotazione cert-manager
│                               # (una sola Certificate per host, gestita dall'Ingress del backend)
└── ...                       # codice del frontend

k8s/
└── templates/infra/          # applicati da Infra (i due namespace e l'istanza Postgres)
    ├── namespace.yaml            # namespace applicativo (clubby-<env>-app)
    ├── postgres-namespace.yaml   # namespace dell'istanza Postgres (DB_NAMESPACE)
    ├── postgres-pvc.yaml         # questo e il seguente: applicati solo se l'istanza non esiste
    ├── postgres-deployment.yaml
    ├── postgres-service.yaml
    └── postgres-nodeport.yaml    # opzionale, solo se DB_NODE_PORT è impostata
```

