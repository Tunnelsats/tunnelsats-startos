FROM alpine:3.19

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    wireguard-tools \
    iptables \
    iproute2 \
    ca-certificates \
    curl \
    bash

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
