FROM node:22-alpine

WORKDIR /orum
COPY . .

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/_orum/health || exit 1

USER node
CMD ["node", "server.js"]
