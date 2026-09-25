# Migrazioni — database degli account

Modifiche allo schema successive a `../schema.sql`, che resta la **baseline**
con cui Infra crea un database nuovo.

Stesse regole e stesso workflow del database dell'applicazione: vedi
[backend/src/db/migrations/README.md](../../../../backend/src/db/migrations/README.md).
Cambia solo il database su cui vengono applicate (`<env>-auth`, con il suo
utente proprietario).

Qui vive solo ciò che riguarda account, ruoli e sessioni: i dati
dell'associazione stanno nell'altro database, e una migrazione non può
attraversarli entrambi.

## Prima della prima migrazione

Il workflow è già generico sui due database, ma l'immagine dell'authorizer non
è ancora attrezzata a eseguirle: il suo contesto di build è limitato al proprio
modulo, quindi non contiene `scripts/migra.sh`, e manca `postgresql-client`.
Aggiungendo il primo file qui vanno fatte anche queste tre cose, come in
`backend/Dockerfile`:

1. portare il contesto di build dell'authorizer alla radice del repo
   (`.github/workflows/build-deploy.yml`, job `build-authorizer`);
2. `RUN apk add --no-cache bash postgresql-client` e `COPY scripts/migra.sh`;
3. `COPY authorizer/src/db/migrations /app/migrations`, con la relativa
   eccezione in `.dockerignore`.
