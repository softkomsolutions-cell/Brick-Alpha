FROM node:20-alpine AS builder

WORKDIR /app

COPY frontend/package*.json ./frontend/
RUN npm --prefix frontend ci
COPY frontend ./frontend

COPY server ./server
# Use package overrides from server/package.json so the installed/audited graph
# contains patched transitive runtime dependencies.
RUN npm --prefix server install

RUN npm --prefix server run db:generate
RUN npm --prefix frontend run build

# Production dependency gate: fail on high/critical advisories in shipped code.
RUN npm --prefix frontend audit --omit=dev --audit-level=high
RUN npm --prefix server audit --omit=dev --omit=optional --audit-level=high

# Remove development-only packages before assembling the runtime image.
RUN npm --prefix server prune --omit=dev

FROM node:20-alpine AS runtime

WORKDIR /app

COPY server ./server
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY --from=builder /app/frontend/dist ./frontend/dist

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

WORKDIR /app/server

CMD ["node", "server.js"]
