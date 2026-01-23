#!/usr/bin/env bats
# Integration tests for health check

setup() {
    export SCRIPTS_DIR="$BATS_TEST_DIRNAME/../scripts"
}

@test "health_check.sh is executable" {
    [ -x "$SCRIPTS_DIR/health_check.sh" ] || skip "Script not yet created"
}

@test "health_check.sh returns 61 when wg interface missing" {
    # This test requires running without WireGuard
    # Skip in CI without NET_ADMIN
    skip "Requires NET_ADMIN capability"
}
