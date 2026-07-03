#!/usr/bin/env bash
set -e

# Load master password from git-ignored .env.local
ENV_FILE=".env.local"
if [ ! -f "$ENV_FILE" ]; then
    echo "Error: $ENV_FILE not found."
    exit 1
fi

# Extract safely ignoring stray trailing quotes (sync with deploy-sideload.sh)
MASTER_PWD=$(grep '^startOS-Master-pwd=' "$ENV_FILE" | cut -d '=' -f 2- | tr -d '"' | tr -d "'" | tr -d '\r\n')
HOST="https://public-fallacy.local"
SDK_CLI="/home/hakuna/.cargo/bin/start-cli"

if [ -z "$MASTER_PWD" ]; then
    echo "Error: password not found"
    exit 1
fi

echo "Phase 1: Authenticating to $HOST..."
$SDK_CLI -h "$HOST" auth login "$MASTER_PWD"

echo "Phase 2: Preparing and Pushing Configuration..."
# Prepare the JSON-config
CONF_CONTENT=$(cat tunnelsats-test.conf)
# Escaping for JSON
JSON_CONF=$(jq -n --arg conf "$CONF_CONTENT" '{"target-node": "lnd", "tunnelsats-conf": $conf}')

# Push the config
echo "Pushing tunnelsats configuration..."
echo "$JSON_CONF" | $SDK_CLI -h "$HOST" package config tunnelsats set

echo "Phase 3: Verifying Remote Logs..."
# Wait a few seconds for service to restart and logs to populate
sleep 5
echo "Fetching tunnelsats logs..."
$SDK_CLI -h "$HOST" package logs tunnelsats --limit 50
