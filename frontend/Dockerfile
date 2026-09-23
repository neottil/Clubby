# La build (npm run build, con le VITE_* già valorizzate) avviene nella pipeline
# CI (vedi .github/workflows/build-deploy.yml), non qui: questo Dockerfile si
# aspetta che ./dist esista già nel contesto di build (asset statici già
# compilati) e si limita a servirli con nginx.
FROM nginx:1.27-alpine
COPY dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80