# Stage 1: Build
FROM bitnami/node:18 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Serve
FROM bitnami/nginx:1.27.0
COPY --from=build /app/build /app
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
