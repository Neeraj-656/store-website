FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src

FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app /app

EXPOSE 3010

CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]