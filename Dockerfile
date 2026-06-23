FROM node:20-slim AS build
WORKDIR /app/services/api
COPY services/api/package*.json ./
RUN npm ci
COPY services/api ./
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app/services/api
COPY services/api/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/services/api/dist ./dist
EXPOSE 8080
CMD ["node", "dist/index.js"]
