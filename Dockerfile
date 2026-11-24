# Development/staging image. Production hardening (standalone output, non-root, healthcheck) is Phase 9.
FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm run dev -- -H 0.0.0.0"]
