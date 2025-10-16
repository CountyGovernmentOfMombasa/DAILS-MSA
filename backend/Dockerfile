# --- Build Stage ---
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files and install all dependencies (including dev) for potential build steps/tests
COPY package*.json ./
RUN npm install

# Copy the rest of the application source code
COPY . .

# Optional: If you had a build step (e.g., for TypeScript), you would run it here.
# RUN npm run build

# --- Production Stage ---
FROM node:18-alpine AS runner
RUN apk update && apk upgrade && \
	apk add --no-cache tini

WORKDIR /app

COPY package*.json ./
# Install only production dependencies
RUN npm install --production --omit=dev


# Copy built application from the builder stage
COPY --from=builder /app .

EXPOSE 5000

# Create and use a non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "app.js"]

WORKDIR /app

COPY package*.json ./
# Install only production dependencies
RUN npm install --production --omit=dev


# Copy built application from the builder stage
COPY --from=builder /app .

EXPOSE 5000

# Create and use a non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

CMD ["node", "app.js"]
