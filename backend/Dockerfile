FROM node:20-alpine
WORKDIR /app
# traceroute + libcap: route /api/traceroute spawns the system traceroute.
# It needs raw sockets (cap_net_raw via setcap) so the unprivileged node
# user can perform TCP-SYN probes.
RUN apk add --no-cache traceroute libcap \
    && setcap 'cap_net_raw=+ep' /usr/bin/traceroute
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
ENV NODE_ENV=production PORT=4001
EXPOSE 4001
USER node
CMD ["node", "src/index.js"]
