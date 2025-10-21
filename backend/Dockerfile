# --- Build Stage ---
# This stage installs ALL dependencies (including dev) and compiles native modules.
FROM node:18-alpine AS builder

WORKDIR /app

# Install build tools required for native modules like 'hummus-recipe'
RUN apk add --no-cache python3 make g++

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application source code
COPY . .

# --- Production Stage ---
# This stage creates the final, lean image for running the application.
FROM node:18-alpine

WORKDIR /app

# Install Tini, a lightweight init system for containers, to properly handle signals.
RUN apk add --no-cache tini

# Copy the entire application, including the compiled node_modules, from the builder stage.
# This ensures we don't need to run `npm install` again.
COPY --from=builder /app .

EXPOSE 5000

# Create a non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Use Tini as the entrypoint to manage the Node.js process
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "app.js"]
