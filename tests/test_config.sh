#!/bin/bash
# TunnelSats config validation test script
set -euo pipefail

# Work in the project root
cd "$(dirname "$0")/.."

echo "--- Testing config_get.sh ---"
# Mock data file
mkdir -p data
echo "[Interface]
PrivateKey = test-key-value" > data/tunnelsats.conf

# Ensure config_spec.json exists locally for testing
cat config_spec.yaml | yq . | jq . > config_spec.json

# Temporarily point config_get.sh to the local spec file AND local data file
sed -i 's|/usr/local/share/tunnelsats/config_spec.json|./config_spec.json|g' scripts/config_get.sh
sed -i 's|/data/tunnelsats.conf|./data/tunnelsats.conf|g' scripts/config_get.sh

GET_RESPONSE=$(scripts/config_get.sh)
echo "$GET_RESPONSE" | jq .

# Validate keys for config_get: { "config": { ... }, "spec": { ... } }
echo "$GET_RESPONSE" | jq -e '.config' > /dev/null || (echo "FAILED: Missing 'config' field in GET response" && exit 1)
echo "$GET_RESPONSE" | jq -e '.spec' > /dev/null || (echo "FAILED: Missing 'spec' field in GET response" && exit 1)
echo "$GET_RESPONSE" | jq -r '.config."tunnelsats-config"' | grep -q "test-key-value" || (echo "FAILED: Incorrect config value in GET response" && exit 1)

echo "--- Testing config_set.sh ---"
# Temporarily point config_set.sh to the local data file
sed -i 's|/data/tunnelsats.conf|./data/tunnelsats.conf|g' scripts/config_set.sh

SAMPLE_INPUT='{"tunnelsats-config": "new-config-data"}'
SET_RESPONSE=$(echo "$SAMPLE_INPUT" | scripts/config_set.sh)
echo "$SET_RESPONSE" | jq .

# Validate keys for config_set: { "depends-on": {} }
echo "$SET_RESPONSE" | jq -e '."depends-on"' > /dev/null || (echo "FAILED: Missing 'depends-on' field in SET response" && exit 1)

# Verify the config was actually "saved" to the mock data file
grep -q "new-config-data" data/tunnelsats.conf || (echo "FAILED: config_set.sh did not update data/tunnelsats.conf" && exit 1)

# Revert path changes
sed -i 's|./config_spec.json|/usr/local/share/tunnelsats/config_spec.json|g' scripts/config_get.sh
sed -i 's|./data/tunnelsats.conf|/data/tunnelsats.conf|g' scripts/config_get.sh
sed -i 's|./data/tunnelsats.conf|/data/tunnelsats.conf|g' scripts/config_set.sh

echo "SUCCESS: All config procedures local checks passed!"
rm config_spec.json data/tunnelsats.conf
rmdir data
