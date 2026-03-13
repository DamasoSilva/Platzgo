FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache tzdata
ENV TZ=America/Sao_Paulo

FROM base AS deps
COPY package*.json ./
RUN npm install

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3001
CMD ["npm","run","start"]
