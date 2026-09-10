FROM node:20-bookworm-slim

WORKDIR /app

# Установить системные зависимости (Python для bcrypt, g++ для компиляции)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Копировать package.json и prisma schema (для кэширования слоёв)
COPY package*.json ./
COPY prisma ./prisma/

# Установить зависимости
RUN npm ci

# Сгенерировать Prisma Client
RUN npx prisma generate

# Копировать исходники
COPY . .

# Собрать TypeScript → JavaScript
RUN npm run build

EXPOSE 3000

# Запуск: миграции → сид → приложение
CMD ["sh", "-c", "npx prisma migrate deploy && npm run seed && node dist/main.js"]