# Step 1: Build Angular app
FROM node:16 AS build
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Important: use legacy provider for webpack build
RUN node --openssl-legacy-provider ./node_modules/.bin/webpack --mode production

# Step 2: Serve with Nginx
FROM nginx:alpine
COPY --from=build /app/dist/scheduler1 /usr/share/nginx/html

EXPOSE 4200
CMD ["nginx", "-g", "daemon off;"]
