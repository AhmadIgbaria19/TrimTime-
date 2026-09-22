    FROM node:22-alpine AS build
    WORKDIR /app

    COPY package.json package-lock.json ./
    COPY client/package.json ./client/
    COPY server/package.json ./server/
    RUN npm ci

    COPY client ./client
    COPY server ./server
    RUN npm run build -w client

    FROM node:22-alpine
    WORKDIR /app
    ENV NODE_ENV=production

    COPY package.json package-lock.json ./
    COPY client/package.json ./client/
    COPY server/package.json ./server/
    COPY --from=build /app/node_modules ./node_modules
    COPY --from=build /app/client/dist ./client/dist
    COPY server ./server

    EXPOSE 3001
    CMD ["npm", "run", "start", "-w", "server"]
