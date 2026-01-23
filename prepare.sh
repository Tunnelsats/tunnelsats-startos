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

# Install yq (Mike Farah version)
echo "Installing/Updating yq..."
ARCH=$(uname -m)
case $ARCH in
    x86_64) YQ_ARCH="amd64" ;;
    aarch64) YQ_ARCH="arm64" ;;
    *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

sudo curl -L https://github.com/mikefarah/yq/releases/latest/download/yq_linux_${YQ_ARCH} -o /usr/local/bin/yq
sudo chmod a+rx /usr/local/bin/yq

echo "[TunnelSats] Build environment ready."
/usr/local/bin/yq --version
