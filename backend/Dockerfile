# La compilazione (npm run build) avviene nella pipeline CI (vedi
# .github/workflows/build-deploy.yml), non qui: questo Dockerfile si aspetta che
# ./dist esista già nel contesto di build e si limita a impacchettarlo con le
# dipendenze di produzione.
#
# Contesto di build = radice del repo (non ./backend): serve per poter copiare
# scripts/migra.sh e branding/, che stanno fuori da backend/ — vedi
# context/file in .github/workflows/build-deploy.yml (job build-backend) e
# .dockerignore alla radice del repo per tenere il contesto ridotto.
#
# scripts/seed-demo-data.sh NON entra qui, di proposito: azzera due database
# interi, e una cosa del genere non deve trovarsi a portata di `kubectl exec`
# su un pod di staging. Si esegue dalla propria macchina, puntando
# esplicitamente al database che si vuole distruggere.
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production

# bash e postgresql-client non servono all'app in sé: li usa scripts/migra.sh,
# eseguito da un Job k8s su questa stessa immagine.
RUN apk add --no-cache bash postgresql-client
# Migrazioni di schema: applicate da un Job k8s che gira su QUESTA immagine
# prima del rollout (vedi .github/workflows/migrate-db.yml). Stanno qui e non
# in un artefatto a parte perché devono essere esattamente quelle che
# accompagnano il codice di questa immagine.
COPY scripts/migra.sh /app/scripts/migra.sh
COPY backend/src/db/migrations /app/migrations
RUN chmod +x /app/scripts/migra.sh

# Loghi dei club: il backend ne disegna il raster in cima alle ricevute
# (service/documenti/logo.ts). Stessa cartella che il frontend serve al
# browser, stessa Variable LOGO_FILE a sceglierne uno per ambiente — una copia
# sola, così il logo in testa alle pagine e quello sulle ricevute non possono
# divergere. Anche questa, come gli script sopra, è fuori da backend/ e arriva
# perché il contesto di build è la radice del repo.
COPY branding /app/branding

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/dist ./dist

EXPOSE 3000
CMD ["node", "dist/server.js"]