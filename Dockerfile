# Stage 1: Build wireguard-go natively (cross-compiled)
FROM --platform=$BUILDPLATFORM golang:1.23-alpine AS builder

ARG TARGETOS
ARG TARGETARCH

RUN apk add --no-cache git yq

WORKDIR /build

# Build wireguard-go from source (cross-compiled)
ENV GOPROXY=https://proxy.golang.org,direct
RUN GOOS=$TARGETOS GOARCH=$TARGETARCH CGO_ENABLED=0 \
    go install -v -ldflags="-s -w" golang.zx2c4.com/wireguard@latest && \
    find /go/bin -type f -name "wireguard*" -exec mv {} /usr/local/bin/wireguard-go \; && \
    chmod +x /usr/local/bin/wireguard-go

# Convert config spec to JSON
COPY config_spec.yaml .
RUN yq '.' config_spec.yaml -o json > config_spec.json

# ============================================
# Stage 2: Runtime
# ============================================
FROM alpine:3.19

LABEL maintainer="TunnelSats <support@tunnelsats.com>"
LABEL description="WireGuard VPN tunnel with SOCKS5 proxy (v0.1.3)"

# Install runtime dependencies + temporary build tools for microsocks
RUN apk add --no-cache \
    wireguard-tools \
    iptables \
    ip6tables \
    bash \
    curl \
    jq \
    socat \
    procps \
    # Temporary build tools
    git make gcc musl-dev

# Build microsocks natively in the runtime image
RUN git clone --depth 1 https://github.com/rofl0r/microsocks.git && \
    cd microsocks && \
    make && \
    mv microsocks /usr/local/bin/ && \
    cd .. && rm -rf microsocks

# Remove build tools to keep image size small
RUN apk del git make gcc musl-dev

# Copy binaries and config from builder
COPY --from=builder /usr/local/bin/wireguard-go /usr/local/bin/
COPY --from=builder /build/config_spec.json /usr/local/share/tunnelsats/

# Copy scripts
COPY scripts/ /usr/local/bin/
RUN chmod +x /usr/local/bin/*.sh

# Data volume and settings
VOLUME /data
EXPOSE 9050

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD /usr/local/bin/health_check.sh || exit 1

ENTRYPOINT ["/usr/local/bin/docker_entrypoint.sh"]
