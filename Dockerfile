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
  CMD ["sh", "run-with-gavin-bootstrap.sh"]
WORKDIR /app/server

CMD ["sh", "-c", "node server.js & pid=$!; while true; do node gavin-brickeconomy-bootstrap.js; code=$?; if [ \"$code\" -eq 0 ]; then kill $pid 2>/dev/null || true; wait $pid 2>/dev/null || true; exec node server.js; fi; sleep 2; done"]
