# NEXUS — production container. Zero-dependency engine on Node 20 LTS.
FROM node:20-alpine AS base
WORKDIR /app

# Only package manifest first (layer caching). The engine has no runtime deps;
# razorpay/pg are optional and installed only when going live.
COPY package.json ./
RUN npm install --omit=dev || true

# App source
COPY src ./src
COPY public ./public
COPY server.js demo.js ./

# Data dir for file-store (mount a volume in prod, or use postgres)
RUN mkdir -p /app/data && chown -R node:node /app
USER node

ENV NODE_ENV=production
ENV PORT=4100
EXPOSE 4100

# Healthcheck hits the readiness endpoint
HEALTHCHECK --interval=30s --timeout=4s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||4100)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
