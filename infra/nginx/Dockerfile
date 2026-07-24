FROM nginx:1.27-alpine
# Não correr `nginx -t` no build: upstreams frontend/backend só resolvem em runtime.
COPY prod.conf /etc/nginx/conf.d/default.conf
