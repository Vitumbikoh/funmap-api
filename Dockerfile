FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
RUN npm install

FROM base AS build
COPY . .
RUN npm run build --workspace @funmap/api

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY apps/api/.env.example ./.env.example
EXPOSE 4000
CMD ["node", "dist/main.js"]

