FROM node:22-alpine AS build
WORKDIR /app/apps/backend

COPY apps/backend/package*.json ./
RUN npm install

COPY apps/backend ./
RUN npx prisma generate && npm run build

FROM node:22-alpine
WORKDIR /app/apps/backend

COPY --from=build /app/apps/backend/package*.json ./
COPY --from=build /app/apps/backend/node_modules ./node_modules
COPY --from=build /app/apps/backend/dist ./dist
COPY --from=build /app/apps/backend/prisma ./prisma
RUN npm prune --omit=dev
EXPOSE 3502

CMD ["node", "dist/src/main.js"]
