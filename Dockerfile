FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app
COPY package.json server.js index.html favicon.svg manifest.webmanifest ./
COPY css ./css
COPY js ./js
COPY assets ./assets
RUN mkdir -p data/uploads && chown -R node:node /app

# Uploads & Bibliothek überleben Container-Rebuilds
VOLUME /app/data

USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
