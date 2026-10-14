# syntax=docker/dockerfile:1
#
# Order tracking (purchase) — один образ: BFF (NestJS) + зібраний фронт (React/Vite, apps/web/dist),
# який Nest роздає сам (ServeStaticModule, усе поза /api/*).
#
# Контекст збірки — корінь репозиторію:
#     docker build -t purchase:local .
# Реєстр і версію Node можна перевизначити, не чіпаючи файл:
#     docker build --build-arg REGISTRY=docker.io/library --build-arg NPM_REGISTRY=https://registry.npmjs.org ...

ARG REGISTRY=10.20.50.25:8081
ARG NODE_VERSION=22
# Базовий образ можна підмінити на внутрішній з уже вшитим CA-ланцюжком:
#     docker build --build-arg BASE_IMAGE=10.20.50.25:8081/node-internal-ca:22 ...
ARG BASE_IMAGE=${REGISTRY}/node:${NODE_VERSION}
# Дзеркало npm для npm ci. Порожнє = registry.npmjs.org.
ARG NPM_REGISTRY=


FROM $BASE_IMAGE AS build
ARG NPM_REGISTRY
RUN if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY" --location=global; fi
WORKDIR /app
# Спершу лише маніфести — цей шар перезбирається тільки при зміні залежностей, не коду.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY packages packages
COPY apps apps
RUN npm run build

# --- runtime: тільки prod-залежності api і зібрана статика ---
# packages/shared — лише типи (import type), у рантаймі не потрібен; маніфест копіюється тільки
# для того, щоб npm ci бачив усі воркспейси з package-lock.json.
FROM $BASE_IMAGE
ARG NPM_REGISTRY
RUN if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY" --location=global; fi
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace=apps/api --include-workspace-root=false --ignore-scripts \
    && npm cache clean --force
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/dist apps/web/dist

# Вкладені файли: у docker compose і Kubernetes сюди монтується том (див. deploy.yaml).
RUN mkdir -p /app/data/uploads && chown -R node:node /app/data
ENV PORT=3000
ENV UPLOADS_DIR=/app/data/uploads
EXPOSE 3000
USER node
CMD ["node", "apps/api/dist/main.js"]
