FROM node:22-alpine AS build
WORKDIR /app

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_SITE_HOST
ARG NEXT_PUBLIC_ADMIN_SITE_HOST
ARG NEXT_PUBLIC_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_SITE_HOST=$NEXT_PUBLIC_SITE_HOST
ENV NEXT_PUBLIC_ADMIN_SITE_HOST=$NEXT_PUBLIC_ADMIN_SITE_HOST
ENV NEXT_PUBLIC_PUBLIC_SITE_URL=$NEXT_PUBLIC_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID

# Dependência local "201bet": "file:../.." em apps/frontend/package.json
COPY package.json ./
COPY apps/frontend/package.json apps/frontend/package-lock.json ./apps/frontend/

WORKDIR /app/apps/frontend
# Coolify pode injetar NODE_ENV=production no build; forçamos devDeps se forem precisas.
RUN npm ci --include=dev

COPY apps/frontend ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app/apps/frontend

ENV NODE_ENV=production
ENV PORT=3501
ENV HOSTNAME=0.0.0.0

COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/apps/frontend/package.json /app/apps/frontend/package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/apps/frontend/.next ./.next
COPY --from=build /app/apps/frontend/public ./public
COPY --from=build /app/apps/frontend/next.config.ts ./next.config.ts
EXPOSE 3501

CMD ["npm", "run", "start"]
