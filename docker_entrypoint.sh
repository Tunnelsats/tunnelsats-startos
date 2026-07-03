#!/bin/sh
set -e

# TunnelSats StartOS Entrypoint

# 1. Ensure the data directory exists
mkdir -p /data

# 2. Run the orchestrator in userspace
# bridge.py will launch and manage the wireproxy client.

echo "Starting TunnelSats Bridge Orchestrator..."
exec python3 -u bridge.py start
