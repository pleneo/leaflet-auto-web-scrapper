FROM node:24-bookworm-slim

WORKDIR /app

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package.json package-lock.json ./

RUN npm ci \
  && npx playwright install --with-deps chromium

ENV NODE_ENV=production

COPY tsconfig.json tsconfig.base.json tsconfig.app.json tsconfig.node.json tsconfig.spec.json ./
COPY vite.config.ts vitest.config.ts index.html ./
COPY public ./public
COPY src ./src

RUN npm run build

CMD ["npm", "run", "worker"]
