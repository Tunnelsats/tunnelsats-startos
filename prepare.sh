#!/bin/bash

# TunnelSats prepare script
# Sets up the build environment for a Debian system for Start9 verification

set -e

echo "[TunnelSats] Preparing build environment..."

# Build essentials and dependencies
sudo apt-get update
sudo apt-get install -y \
    build-essential \
    openssl \
    libssl-dev \
    libc6-dev \
    clang \
    libclang-dev \
    ca-certificates \
    git \
    make \
    curl \
    jq

# Note: yq version 3.4.3 is already installed on this machine,
# but we include it here for documentation.
if ! which yq > /dev/null; then
    echo "Installing yq..."
    sudo snap install yq || (
        VERSION=v4.30.6
        BINARY=yq_linux_arm64 # Adjust for current arch if needed
        curl -L https://github.com/mikefarah/yq/releases/download/${VERSION}/${BINARY} -o /usr/local/bin/yq
        chmod +x /usr/local/bin/yq
    )
fi

echo "[TunnelSats] Build environment ready."
