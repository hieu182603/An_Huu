FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
COPY tsconfig.json ./
COPY src ./src/
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
ENV PORT=5000
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package*.json ./
COPY prisma ./prisma/
COPY scripts ./scripts/
USER node
EXPOSE 5000
# Run migrations in a separate release job with pinned CLI before scaling replicas.
# Use the same image with "node dist/worker.js" for the outbox worker.
# A scheduled retention job runs "node dist/retention.js --execute" (DB only, no SMTP).
CMD ["node", "dist/server.js"]
