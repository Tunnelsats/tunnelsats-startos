# Builder stage for microsocks
FROM alpine:3.19 AS builder
RUN apk add --no-cache build-base git
RUN git clone https://github.com/rofl0r/microsocks.git && \
    cd microsocks && \
    make

# Final stage
FROM alpine:3.19

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    wireguard-tools \
    iptables \
    iproute2 \
    ca-certificates \
    curl \
    bash \
    su-exec

# Create unprivileged user for the proxy
RUN adduser -D -H -u 1000 proxy_user

# Copy compiled microsocks from builder
COPY --from=builder /microsocks/microsocks /usr/local/bin/microsocks

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
