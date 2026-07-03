# Builder stage for wireproxy
FROM golang:alpine AS builder
RUN apk add --no-cache git
RUN git clone --depth 1 --branch v1.1.1 https://github.com/octeep/wireproxy.git /wireproxy && \
    cd /wireproxy && \
    go build -o /wireproxy-bin ./cmd/wireproxy

# Final stage
FROM alpine:3.19

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    ca-certificates \
    curl \
    bash \
    wireguard-tools

# Copy compiled wireproxy from builder
COPY --from=builder /wireproxy-bin /usr/local/bin/wireproxy

# Set working directory
WORKDIR /app

# Copy application files
COPY bridge.py .
COPY docker_entrypoint.sh .
RUN chmod +x docker_entrypoint.sh

# StartOS data persistence directory
VOLUME /data

# Default entrypoint
ENTRYPOINT ["/app/docker_entrypoint.sh"]
