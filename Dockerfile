FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.server.json vite.config.ts index.html calculator.html ./
COPY assets ./assets
COPY public ./public
COPY src ./src

RUN npm run build

FROM node:22-bookworm-slim AS app-runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV ACCOUNT_STORE_PATH=/app/data/accounts.json
ENV TABLE_STORE_PATH=/app/data/table-state.json

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/build/server ./build/server

RUN mkdir -p /app/data

EXPOSE 8080

CMD ["node", "build/server/server/main.js"]

FROM nginx:1.27-alpine AS web-runtime

COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build/web /usr/share/nginx/html

EXPOSE 80
