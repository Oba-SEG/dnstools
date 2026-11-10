FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
ENV NODE_ENV=production PORT=4001
EXPOSE 4001
USER node
CMD ["node", "src/index.js"]
