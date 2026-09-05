# Multi-stage build: compile the Vite app, then serve the static bundle with
# nginx (which also reverse-proxies /api and /uploads to the backend container
# — see nginx.conf). Build context is the frontend/ directory itself.

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
