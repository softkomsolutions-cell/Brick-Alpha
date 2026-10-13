FROM node:20-alpine AS builder

WORKDIR /app

COPY frontend/package*.json ./frontend/
COPY server/package*.json ./server/

RUN npm --prefix frontend ci
RUN npm --prefix server ci

COPY frontend ./frontend
COPY server ./server

RUN npm --prefix server run db:generate
RUN npm --prefix frontend run build

# Production dependency gate: build fails on high/critical advisories in packages
# that are actually shipped or bundled into the application.
RUN npm --prefix frontend audit --omit=dev --audit-level=high
RUN npm --prefix server audit --omit=dev --audit-level=high

FROM node:20-alpine AS runtime

WORKDIR /app

COPY server/package*.json ./server/
RUN npm --prefix server ci --omit=dev

COPY --from=builder /app/server ./server
COPY --from=builder /app/frontend/dist ./frontend/dist
COPY --from=builder /app/server/node_modules/.prisma ./server/node_modules/.prisma

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

WORKDIR /app/server

CMD ["node", "server.js"]
