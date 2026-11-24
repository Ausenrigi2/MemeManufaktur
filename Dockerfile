FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache su-exec
COPY package.json server.js index.html favicon.svg manifest.webmanifest ./
COPY css ./css
COPY js ./js
COPY assets ./assets
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN mkdir -p data/uploads && chown -R node:node /app \
  && chmod +x /usr/local/bin/docker-entrypoint.sh

# Uploads & Bibliothek überleben Container-Rebuilds
VOLUME /app/data

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
