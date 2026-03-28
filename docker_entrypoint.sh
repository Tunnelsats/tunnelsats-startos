#!/bin/sh
set -e

# TunnelSats StartOS Entrypoint

# 1. Ensure the data directory exists
mkdir -p /data

# 2. Check for the WireGuard interface
# Note: In StartOS, the container is spawned as root with CAP_NET_ADMIN.
# bridge.py will call wg-quick up, but we want it to stay interactive.

echo "Starting TunnelSats Bridge Orchestrator..."
exec python3 bridge.py start
