# Multi-stage build for a self-hosted deployment (the live demo deploy
# targets Vercel instead — see README "Deployment" — this Dockerfile is
# for anyone running CohortCove outside Vercel). Runtime env vars
# (DATABASE_URL, AUTH_SECRET, etc.) are supplied at `docker run` / deploy
# time — see .env.example.

FROM node:20.11-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20.11-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# A build-time placeholder DB is fine — `next build` only needs the schema
# to generate the Prisma client, it never queries a real database.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV AUTH_SECRET="build-time-placeholder-not-used-at-runtime-aaaaaaaaaaaaaaaa"
RUN npx prisma generate
RUN npm run build

FROM node:20.11-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/next.config.js ./next.config.js

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["npm", "run", "start"]
