FROM node:22-alpine AS build
WORKDIR /app/apps/frontend

COPY apps/frontend/package*.json ./
RUN npm install

COPY apps/frontend ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app/apps/frontend

COPY --from=build /app/apps/frontend/package*.json ./
RUN npm install --omit=dev

COPY --from=build /app/apps/frontend/.next ./.next
COPY --from=build /app/apps/frontend/public ./public
COPY --from=build /app/apps/frontend/next.config.ts ./next.config.ts
EXPOSE 3501

CMD ["npm", "run", "start"]
