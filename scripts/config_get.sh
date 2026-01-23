#!/bin/bash
# TunnelSats Config Get Script
# Reads the current config from the data volume and returns it in JSON format for the UI

set -euo pipefail

CONFIG_FILE="/data/tunnelsats.conf"

if [[ -f "$CONFIG_FILE" ]]; then
    VALUE=$(cat "$CONFIG_FILE")
else
    VALUE=""
fi

# Return JSON-encoded object matching config_spec.yaml
# start-sdk expects a JSON object on stdout
echo "{ \"tunnelsats-config\": \"$VALUE\" }"
