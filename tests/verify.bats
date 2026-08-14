#!/usr/bin/env bats
# Tests for verify.sh diagnostic tool

setup() {
    export REPO_ROOT="$BATS_TEST_DIRNAME/.."
}

@test "verify.sh is executable and runs diagnostics structure" {
    run "$REPO_ROOT/verify.sh"
    [[ "$output" =~ "1. Environment & Container Status" ]]
    [[ "$output" =~ "2. Querying TunnelSats Gateway Status" ]]
    [[ "$output" =~ "3. Target Node Policy Routing & Egress Audit" ]]
    [[ "$output" =~ "4. IPv6 Leak Prevention Policy" ]]
    [[ "$output" =~ "5. Tor Coexistence & SOCKS Proxy Check" ]]
    [[ "$output" =~ "6. Target Lightning Node Port Forwarding Audit" ]]
    [[ "$output" =~ "Verification Summary" ]]
}

@test "verify.sh outputs direct CLI audit commands for target node" {
    run "$REPO_ROOT/verify.sh"
    [[ "$output" =~ "start-cli package attach" ]]
    [[ "$output" =~ "api.ipify.org" ]]
    [[ "$output" =~ "api6.ipify.org" ]]
}
