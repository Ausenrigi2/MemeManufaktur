FROM node:22-alpine

WORKDIR /app
COPY package.json server.js index.html favicon.svg ./
COPY css ./css
COPY js ./js
COPY assets ./assets
RUN mkdir -p data/uploads

# Uploads & Bibliothek überleben Container-Rebuilds
VOLUME /app/data

EXPOSE 8080
CMD ["node", "server.js"]
