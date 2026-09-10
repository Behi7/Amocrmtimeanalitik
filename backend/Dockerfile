FROM node:20-bookworm-slim

WORKDIR /app

# Установить зависимости
RUN apt-get update && apt-get install -y python3 make g++ openssl && rm -rf /var/lib/apt/lists/*

# Установить engine для Prisma
ENV PRISMA_CLIENT_ENGINE_TYPE=binary
ENV PRISMA_QUERY_ENGINE_BINARY=binary

# Копировать package файлы
COPY package*.json ./
COPY prisma ./prisma/

# Установить зависимости
RUN npm ci

# Сгенерировать Prisma Client
RUN npx prisma generate

# Копировать исходники
COPY . .

# Собрать проект
RUN npm run build

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && npm run seed && node dist/main.js"]