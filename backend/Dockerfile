FROM node:20-alpine
WORKDIR /app
# Full traceroute package: auto-falls-back to unprivileged UDP probes
# (SOCK_DGRAM + IP_RECVERR) when run without CAP_NET_RAW — works as the
# unprivileged node user both locally and on managed hosts.
RUN apk add --no-cache traceroute
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
ENV NODE_ENV=production PORT=4001
EXPOSE 4001
USER node
CMD ["node", "src/index.js"]
