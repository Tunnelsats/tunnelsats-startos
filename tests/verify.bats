#!/usr/bin/env bats
# Tests for verify.sh diagnostic tool

setup() {
    export REPO_ROOT="$BATS_TEST_DIRNAME/.."
}

@test "verify.sh is executable and runs diagnostics structure" {
    run "$REPO_ROOT/verify.sh"
    [[ "$output" =~ "1. Environment & Container Status" ]]
    [[ "$output" =~ "2. Querying TunnelSats Gateway Status" ]]
    [[ "$output" =~ "3. Tor Coexistence & SOCKS Proxy Check" ]]
    [[ "$output" =~ "4. Target Lightning Node Port Forwarding Profile" ]]
    [[ "$output" =~ "5. Target Node Host CLI Audit Recipes" ]]
    [[ "$output" =~ "Verification Summary" ]]
}

@test "verify.sh outputs direct CLI audit commands for target node" {
    run "$REPO_ROOT/verify.sh"
    [[ "$output" =~ "start-cli package attach" ]]
    [[ "$output" =~ "api.ipify.org" ]]
    [[ "$output" =~ "api6.ipify.org" ]]
}
