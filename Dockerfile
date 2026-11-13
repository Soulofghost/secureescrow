FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8009

COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

COPY backend/ ./backend/
COPY contracts/ ./contracts/
COPY frontend/ ./frontend/

EXPOSE 8009

CMD ["node", "backend/src/server.js"]
