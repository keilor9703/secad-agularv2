# ══════════════════════════════════════════════════════════════════════════
# Imagen del frontend SECAD (Angular 22) — se sirve con nginx, que además
# hace de proxy hacia el contenedor de la API.
#
# El backend NO se construye aquí: vive en el repositorio secad_angular, que
# es el que trae el docker-compose.yml del despliegue completo.
# ══════════════════════════════════════════════════════════════════════════

# ── Etapa 1: compilación ──────────────────────────────────────────────────
# Node 22: package.json exige "^22.22.3 || ^24.15.0 || >=26.0.0". Con node:20
# (el que usaba la imagen del frontend anterior) el build falla.
FROM node:22-alpine AS build
WORKDIR /app

# Manifiestos y todo lo que `npm ci` necesita ANTES del resto del código:
#  · .npmrc     → legacy-peer-deps (la librería @policia/mfa declara Angular 20)
#  · dist-libs  → @policia/mfa se instala desde el .tgz local
#  · patches    → patch-package corre en el postinstall, justo tras npm ci
#  · scripts    → el postinstall es scripts/postinstall.js
COPY package*.json .npmrc ./
COPY dist-libs ./dist-libs
COPY patches ./patches
COPY scripts ./scripts

RUN npm ci

# El resto del código fuente
COPY . .

RUN npm run build -- --configuration=production

# ── Etapa 2: servir ───────────────────────────────────────────────────────
FROM nginx:alpine AS runtime

# @angular/build:application deja el bundle del navegador en browser/
COPY --from=build /app/dist/policiadev-app/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
