#!/usr/bin/env bats
# Tests for verify.sh diagnostic tool

setup() {
    export REPO_ROOT="$BATS_TEST_DIRNAME/.."
}

@test "verify.sh is executable and runs cleanly" {
    run "$REPO_ROOT/verify.sh"
    [ "$status" -eq 0 ]
    [[ "$output" =~ "1. Environment & Container Status" ]]
    [[ "$output" =~ "2. Querying TunnelSats Gateway Status" ]]
    [[ "$output" =~ "3. Verifying Outbound Gateway Routing" ]]
    [[ "$output" =~ "4. IPv6 Leak Prevention Test" ]]
    [[ "$output" =~ "5. Tor Coexistence & SOCKS Proxy Check" ]]
    [[ "$output" =~ "6. Target Lightning Node Port Forwarding Audit" ]]
    [[ "$output" =~ "All diagnostic probes finished successfully." ]]
}

@test "verify.sh masks egress IP output" {
    run "$REPO_ROOT/verify.sh"
    [ "$status" -eq 0 ]
    if [[ "$output" =~ "Current Egress IPv4:" ]]; then
        [[ "$output" =~ "***" ]]
    fi
}
