FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY config.json ./
COPY src ./src

# Le service lit du réseau et écrit deux fichiers de cache : il n'a aucun besoin
# de root. L'utilisateur `node` porte l'uid 1000, celui du propriétaire de ./data
# sur l'hôte, donc le montage reste inscriptible.
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

ENV NODE_ENV=production
EXPOSE 3050

# 90 s de démarrage : c'est le temps de la première lecture des 10 000 raretés
# scellées quand le cache est froid. Plus court, le conteneur se ferait
# redémarrer en pleine lecture, indéfiniment.
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3050/api/snapshot > /dev/null || exit 1

CMD ["node", "src/server.js"]
