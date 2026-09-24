FROM node:20-alpine

WORKDIR /app

COPY frontend/package*.json ./frontend/
COPY server/package*.json ./server/

RUN npm --prefix frontend ci
RUN npm --prefix server ci

COPY frontend ./frontend
COPY server ./server

RUN npm --prefix server run db:generate
RUN npm --prefix frontend run build

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:5000/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

WORKDIR /app/server

CMD ["node", "server.js"]
