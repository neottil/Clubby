# Come per il backend, la compilazione (npm run build) avviene nella pipeline
# CI: questo Dockerfile si aspetta che ./dist esista già nel contesto di build
# e si limita a impacchettarlo con le dipendenze di produzione.
#
# Contesto di build = ./authorizer (a differenza del backend, qui non serve
# nulla dalla radice del repo).
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY dist ./dist

EXPOSE 3001
CMD ["node", "dist/server.js"]
