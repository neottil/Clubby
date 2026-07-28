# La compilazione (npm run build) avviene nella pipeline CI (vedi
# .github/workflows/build-deploy.yml), non qui: questo Dockerfile si aspetta che
# ./dist esista già nel contesto di build e si limita a impacchettarlo con le
# dipendenze di produzione.
#
# Contesto di build = radice del repo (non ./backend): serve per poter
# copiare scripts/seed-demo-data.sh, condiviso con l'uso in locale — vedi
# context/file in .github/workflows/build-deploy.yml (job build-backend) e
# .dockerignore alla radice del repo per tenere il contesto ridotto.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# bash/curl/jq/postgresql-client: non servono all'app in sé, ma permettono di
# eseguire scripts/seed-demo-data.sh (sotto) dentro il pod già deployato via
# `kubectl exec`, per popolare dati demo in staging senza un container/toolbox
# a parte. Le variabili che lo script richiede (DB_*, KEYCLOAK_*) sono già
# tutte nell'ambiente del pod (ConfigMap/Secret) — nessun override necessario.
RUN apk add --no-cache bash curl jq postgresql-client
COPY scripts/seed-demo-data.sh /app/scripts/seed-demo-data.sh
RUN chmod +x /app/scripts/seed-demo-data.sh

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/dist ./dist

EXPOSE 3000
CMD ["node", "dist/server.js"]
