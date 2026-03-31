# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

RUN --mount=type=cache,target=/root/.npm npm ci

COPY apps/api ./apps/api
COPY packages/shared ./packages/shared

WORKDIR /workspace/apps/api

RUN npx prisma generate && npm run build

FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

WORKDIR /workspace/apps/api

COPY --from=builder /workspace/apps/api/dist ./dist
COPY --from=builder /workspace/apps/api/src ./src
COPY --from=builder /workspace/apps/api/prisma ./prisma
COPY --from=builder /workspace/node_modules/.prisma /workspace/node_modules/.prisma

EXPOSE 3001

CMD ["node", "dist/index.js"]
