FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
COPY . .
ENV HIG_RUNTIME=node
RUN npm run build:hostinger
RUN npm run check:hostinger-bundle

FROM builder AS staging-operator
RUN apk add --no-cache postgresql16-client
CMD ["npm", "run", "staging:validate"]

FROM builder AS notification-worker
ENV NODE_ENV=production
ENV HIG_RUNTIME=node
ENV HIG_QUEUE_WORKER_ENABLED=true
ENV HIG_QUEUE_HEARTBEAT_PATH=/tmp/hig-school-notification-worker-heartbeat.json
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=6 \
  CMD ["npm", "run", "stage8:worker:health"]
CMD ["npm", "run", "stage8:worker"]

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HIG_RUNTIME=node
ENV HIG_DEMO_DB_PATH=/data/hig-school-demo.sqlite
ENV HIG_SQLITE_MIGRATIONS_PATH=/app/drizzle
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/.openai ./.openai
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts/validate-production-environment.ts ./scripts/validate-production-environment.ts
COPY --from=builder /app/server/runtime/postgres-environment.ts ./server/runtime/postgres-environment.ts
COPY --from=builder /app/server/runtime/production-environment.ts ./server/runtime/production-environment.ts
COPY --from=builder /app/server/runtime/repository-backend.ts ./server/runtime/repository-backend.ts
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0", "--port", "3000"]
