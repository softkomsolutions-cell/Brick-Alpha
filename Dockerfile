FROM node:20-alpine AS builder

WORKDIR /app

COPY frontend/package*.json ./frontend/
COPY server/package*.json ./server/

RUN npm --prefix frontend ci
RUN npm --prefix server ci
# Pin patched transitive runtime dependencies until upstream Express/Prisma ranges catch up.
RUN npm --prefix server install --no-save body-parser@2.3.0 proxy-addr@2.0.8 qs@6.16.0

COPY frontend ./frontend
COPY server ./server

RUN npm --prefix server run db:generate
RUN npm --prefix frontend run build

# Production dependency gate: build fails on high/critical advisories in packages
# that are actually shipped or bundled into the application.
RUN npm --prefix frontend audit --omit=dev --audit-level=high
RUN npm --prefix server audit --omit=dev --omit=optional --audit-level=high

FROM node:20-alpine AS runtime

WORKDIR /app

COPY server/package*.json ./server/
RUN npm --prefix server ci --omit=dev
RUN npm --prefix server install --omit=dev --no-save body-parser@2.3.0 proxy-addr@2.0.8 qs@6.16.0

COPY server ./server
COPY --from=builder /app/frontend/dist ./frontend/dist
COPY --from=builder /app/server/node_modules/.prisma ./server/node_modules/.prisma

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

WORKDIR /app/server

CMD ["node", "server.js"]
