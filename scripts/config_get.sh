#!/bin/bash
# TunnelSats Config Get Script
# Reads the current config from the data volume and returns it in JSON format for the UI

set -euo pipefail

SPEC_FILE="/usr/local/share/tunnelsats/config_spec.json"
CONFIG_FILE="/data/tunnelsats.conf"

# Read current config value
if [[ -f "$CONFIG_FILE" ]]; then
    CONFIG_VALUE=$(cat "$CONFIG_FILE")
else
    CONFIG_VALUE=""
fi

# Build config value object
CONFIG_JSON=$(jq -n --arg val "$CONFIG_VALUE" '{"tunnelsats-config": $val}')

# Combine with spec for StartOS
# StartOS expects: { "config": { ... }, "spec": { ... } }
jq -n \
  --slurpfile spec "$SPEC_FILE" \
  --argjson config "$CONFIG_JSON" \
  '{config: $config, spec: $spec[0]}'
