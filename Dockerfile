FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY .next ./.next
COPY public ./public
COPY package.json ./package.json

EXPOSE 3000

CMD ["sh", "-c", "npm run start"]
