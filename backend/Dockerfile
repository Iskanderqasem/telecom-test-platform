FROM node:20-bullseye-slim

# Install adb for device control
RUN apt-get update && apt-get install -y --no-install-recommends \
    android-tools-adb \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Create evidence storage directory
RUN mkdir -p storage/evidence storage/test-assets

EXPOSE 4000

CMD ["sh", "-c", "node scripts/migrate.js && node src/server.js"]
