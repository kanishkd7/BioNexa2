# Stage 1: Build React App
FROM mirror.gcr.io/library/node:18-bullseye AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Serve using NGINX
FROM mirror.gcr.io/library/nginx:1.27
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
