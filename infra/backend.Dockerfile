FROM node:22-alpine AS build
WORKDIR /app

# Dependência local "201bet": "file:../.." em apps/backend/package.json
COPY package.json ./
COPY apps/backend/package.json apps/backend/package-lock.json ./apps/backend/

WORKDIR /app/apps/backend
# Coolify passa NODE_ENV=production como build-arg → npm saltaria devDeps (@nestjs/cli).
RUN npm ci --include=dev

COPY apps/backend ./
RUN npx prisma generate \
  && npx nest build

FROM node:22-alpine
WORKDIR /app/apps/backend

RUN apk add --no-cache wget openssl

COPY --from=build /app/apps/backend/package.json /app/apps/backend/package-lock.json ./
COPY --from=build /app/apps/backend/node_modules ./node_modules
COPY --from=build /app/apps/backend/dist ./dist
COPY --from=build /app/apps/backend/prisma ./prisma
COPY --from=build /app/package.json /app/package.json

RUN npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=3502
EXPOSE 3502

CMD ["node", "dist/src/main.js"]
