#!/bin/bash

# Ensure you are in the correct directory
echo "Stopping Docker Compose..."
sudo docker compose down

echo "Starting Docker Compose..."
sudo docker compose up -d

echo "Removing old migrations..."
# rm -r db/migrations

echo "Generating new migrations..."
npx squid-typeorm-migration generate

echo "Applying migrations..."
npx squid-typeorm-migration apply

echo "Starting the application..."
node -r dotenv/config lib/main.js
