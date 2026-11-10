FROM node:26.13.0-alpine

WORKDIR /app
RUN apk add --no-cache openssl
# Copy dependency definitions and prisma schema
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (keeping devDependencies for prisma CLI and ts-node)
RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

# Copy source code and build
COPY . .
RUN npm run build

EXPOSE 3001

CMD ["sh", "-c", "npx prisma generate && npx prisma migrate deploy && node -r ts-node/register prisma/seed.ts && node dist/main"]
