FROM node:20-alpine

RUN apk add --no-cache docker-cli

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

CMD ["node", "src/queue/worker.js"]
