# TunnelSats for StartOS
# Multi-stage build: compile microsocks, then create minimal runtime

# ============================================
# Stage 1: Build microsocks SOCKS5 proxy
# ============================================
FROM alpine:3.19 AS builder

RUN apk add --no-cache \
    git \
    make \
    gcc \
    musl-dev

WORKDIR /build

# Clone and build microsocks
RUN git clone --depth 1 https://github.com/rofl0r/microsocks.git && \
    cd microsocks && \
    make && \
    mv microsocks /usr/local/bin/

# ============================================
# Stage 2: Runtime
# ============================================
FROM alpine:3.19

LABEL maintainer="TunnelSats <support@tunnelsats.com>"
LABEL description="WireGuard VPN tunnel with SOCKS5 proxy for Lightning hybrid mode"

# Install runtime dependencies
RUN apk add --no-cache \
    wireguard-tools \
    iptables \
    ip6tables \
    bash \
    curl \
    jq \
    socat \
    procps

# Copy microsocks from builder
COPY --from=builder /usr/local/bin/microsocks /usr/local/bin/

# Copy scripts
COPY scripts/ /usr/local/bin/
RUN chmod +x /usr/local/bin/*.sh

# Data volume for config persistence
VOLUME /data

# SOCKS5 proxy port
EXPOSE 9050

# Health check (runs every 30s)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD /usr/local/bin/health_check.sh || exit 1

ENTRYPOINT ["/usr/local/bin/docker_entrypoint.sh"]
