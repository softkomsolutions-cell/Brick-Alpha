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

WORKDIR /app/server

CMD ["node", "server.js"]
