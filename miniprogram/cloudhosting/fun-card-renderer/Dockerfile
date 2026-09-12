FROM node:20-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN test -s assets/fonts/LXGWMarkerGothic-Regular.ttf \
 && test -s assets/fonts/SmileySans-Oblique.ttf \
 && test -s assets/fonts/MaShanZheng-Regular.ttf

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node", "index.js"]
