#!/bin/bash

# Use a specific version or alternative bash (e.g., /usr/bin/bash or /bin/bash)
# You can replace /bin/bash with any shell path you prefer, like /usr/bin/bash.

echo "Rebuilding the Node application..."
npm run build
sleep 3

echo "Stopping Docker Compose..."
sudo docker compose down

sleep 3

echo "Starting Docker Compose..."
sudo docker compose up -d

sleep 3

echo "Removing old migrations..."
# Uncomment the next line if you want to remove migrations
# rm -r db/migrations
sleep 5

# Delay before generating new migrations
sleep 2

echo "Generating new migrations..."
npx squid-typeorm-migration generate

sleep 2

echo "Applying migrations..."
npx squid-typeorm-migration apply
sleep 5

sleep 3

echo "Starting the application..."
/bin/bash -c "node -r dotenv/config lib/main.js &"  # Start Node app with specific bash

# Run GraphQL server in another bash shell or terminal emulator
echo "Starting GraphQL server in a separate terminal or background..."
/bin/bash -c "npx squid-graphql-server &"  # Using bash to run GraphQL server in the background
