# Use the official Node.js image as a base
FROM node:16

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the project
RUN npm run build

# Expose the GraphQL port
EXPOSE 4350

# Command to run the application
CMD ["node", "-r", "dotenv/config", "lib/main.js"]
