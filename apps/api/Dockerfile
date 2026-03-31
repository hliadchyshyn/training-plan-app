FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /workspace

COPY package.json ./
COPY tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

RUN npm install

COPY apps/api ./apps/api
COPY packages/shared ./packages/shared

WORKDIR /workspace/apps/api

RUN npx prisma generate && npm run build

FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /workspace/apps/api

COPY --from=builder /workspace/apps/api/package.json ./
COPY --from=builder /workspace/node_modules /workspace/node_modules
COPY --from=builder /workspace/apps/api/node_modules ./node_modules
COPY --from=builder /workspace/apps/api/dist ./dist
COPY --from=builder /workspace/apps/api/prisma ./prisma

EXPOSE 3001

CMD ["node", "dist/index.js"]
