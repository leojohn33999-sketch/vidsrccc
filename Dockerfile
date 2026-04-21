# Use a specific, lighter Playwright image
FROM mcr.microsoft.com/playwright:v1.52.0-noble

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only what's needed for production
RUN npm install --production

# Copy all files (server.js, utils, etc.)
COPY . .

# Match the port in your server.js (4000) or Render's 10000
# Render will automatically map its 10000 to your 4000 if you set the PORT env var
EXPOSE 4000

CMD ["npm", "start"]
