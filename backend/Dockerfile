# La compilazione (npm run build) avviene nella pipeline CI (vedi
# .github/workflows/build-deploy.yml), non qui: questo Dockerfile si aspetta che
# ./dist esista già nel contesto di build e si limita a impacchettarlo con le
# dipendenze di produzione.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY dist ./dist

EXPOSE 3000
CMD ["node", "dist/server.js"]
