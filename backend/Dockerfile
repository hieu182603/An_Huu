# Stage 1: Build & Prisma Generate
FROM node:22-alpine AS builder

WORKDIR /app

# Cài đặt OpenSSL cần thiết cho Prisma trên Alpine
RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY tsconfig.json ./
COPY src ./src/

# Sinh Prisma Client và biên dịch TypeScript
RUN npx prisma generate
RUN npm run build

# Stage 2: Production Runtime
FROM node:22-alpine AS runner

WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV PORT=5000

COPY package*.json ./
COPY prisma ./prisma/

# Cài đặt chỉ production dependencies
RUN npm ci --only=production
RUN npx prisma generate

# Copy mã đã biên dịch từ builder
COPY --from=builder /app/dist ./dist

# Tạo user không đặc quyền để bảo mật container
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 expressjs
USER expressjs

EXPOSE 5000

# Chạy server
CMD ["node", "dist/server.js"]
