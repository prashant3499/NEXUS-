FROM node:20-alpine
WORKDIR /app
COPY . .
ENV NODE_ENV=development
ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s CMD wget -qO- http://localhost:8080/health || exit 1
CMD ["node", "backend/server.js"]
