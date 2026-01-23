#!/bin/bash
# TunnelSats Config Set Script
# Receives the new config as JSON on stdin, parses it, and saves it to the data volume

set -euo pipefail

# Read JSON from stdin and extract the config string using jq
CONFIG_JSON=$(cat)
NEW_CONFIG=$(echo "$CONFIG_JSON" | jq -r '."tunnelsats-config"')

# Save to the data volume
# In startOS, /data is the persistent volume mounted to the container
# During config: set, the script might run in a temporary container with the volume mounted
echo "$NEW_CONFIG" > /data/tunnelsats.conf

# Return empty success object or error
echo "{}"
