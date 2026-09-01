# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm && pnpm config set ignore-scripts true

COPY package.json pnpm-lock.yaml* tsconfig.json ./
RUN pnpm install --frozen-lockfile

COPY src ./src
RUN pnpm build

# Production stage
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=11435
ENV OLLAMA_HOST=http://localhost:11434

COPY package.json ./
COPY --from=builder /app/dist ./dist

EXPOSE 11435

CMD ["node", "dist/index.js"]
