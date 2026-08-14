FROM alpine:3.19

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    ca-certificates \
    bash \
    wireguard-tools

# Set working directory
WORKDIR /app

# Copy application files
COPY version.json .
COPY bridge.py .
COPY docker_entrypoint.sh .
COPY verify.sh .
COPY web/ web/
RUN chmod +x docker_entrypoint.sh verify.sh

# StartOS data persistence directory
VOLUME /data

# Default entrypoint
ENTRYPOINT ["/app/docker_entrypoint.sh"]
