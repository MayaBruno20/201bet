FROM node:22-alpine AS build
WORKDIR /app/apps/frontend

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

COPY apps/frontend/package*.json ./
RUN npm install

COPY apps/frontend ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app/apps/frontend

ENV NODE_ENV=production
ENV PORT=3501
ENV HOSTNAME=0.0.0.0

COPY --from=build /app/apps/frontend/package*.json ./
RUN npm install --omit=dev

COPY --from=build /app/apps/frontend/.next ./.next
COPY --from=build /app/apps/frontend/public ./public
COPY --from=build /app/apps/frontend/next.config.ts ./next.config.ts
EXPOSE 3501

CMD ["npm", "run", "start"]
