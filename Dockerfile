# Stage 1 - Build Vite App
FROM mirror.gcr.io/node:18 AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build


# Stage 2 - Run via nginx
FROM mirror.gcr.io/nginx:stable-alpine

# remove default nginx html
RUN rm -rf /usr/share/nginx/html/*

# copy build output
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]