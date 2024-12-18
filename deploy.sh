#!/bin/bash

# Node Refresh
echo "Rebuilding the Node application..."
npm run build
sleep 3

# Ensure you are in the correct directory
echo "Stopping Docker Compose..."
sudo docker compose down

# Delay before starting Docker Compose
sleep 3

echo "Starting Docker Compose..."
sudo docker compose up -d

# Delay to ensure all services are up and running
sleep 3

echo "Removing old migrations..."
# Uncomment the next line if you want to remove migrations
# rm -r db/migrations
sleep 5

# Delay before generating new migrations
sleep 2

echo "Generating new migrations..."
npx squid-typeorm-migration generate

# Delay before applying migrations
sleep 2

echo "Applying migrations..."
npx squid-typeorm-migration apply
sleep 5

# Delay before starting the application
sleep 3

echo "Starting the application..."
node -r dotenv/config lib/main.js
