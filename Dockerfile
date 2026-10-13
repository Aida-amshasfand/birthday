FROM node:22.13.0-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY . .
RUN pnpm run build

EXPOSE 3000
CMD ["node", "scripts/start.mjs"]
