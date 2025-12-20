# Stage 1: Build React App
# Using mirror.gcr.io to avoid Docker Hub rate limits
FROM mirror.gcr.io/library/node:20 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Serve using NGINX
FROM mirror.gcr.io/library/nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
