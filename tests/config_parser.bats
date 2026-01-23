#!/usr/bin/env bats
# Unit tests for config parser

setup() {
    # Create test fixtures directory
    export TEST_DIR="$BATS_TEST_DIRNAME/fixtures"
    mkdir -p "$TEST_DIR"
    
    # Create valid test config
    cat > "$TEST_DIR/valid.conf" << 'EOF'
[Interface]
# TunnelSats WireGuard Configuration
# Server: us3.tunnelsats.com
# Port Forwarding: 23217
# myPubKey: QVOdgdIHPxTkHuWqZBwRog1UaA5kHkMo9XhiZmB/rBI=
# Valid Until: 2026-02-01T13:25:08.314Z
PrivateKey = wJZlElRVWk+i2rxWRez1jzdRTmIHehhiKt6nweHx2Xo=
Address = 10.9.0.158/32

[Peer]
PublicKey = cb1NcUdG5RKFaauOuMncwNhh0ZRr5y9wTQzUaAWtvxA=
PresharedKey = H4PaNtd85Erv5MVv3DTMpDoR+gNnlHHZxgurQmyEgo0=
Endpoint = us3.tunnelsats.com:51820
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
EOF
}

# Helper function to parse fields (mirrors entrypoint logic)
parse_field() {
    grep -oP "$1"' *= *\K.*' "$2" | head -1 || echo ""
}

parse_comment() {
    grep -oP "# $1: *\K.*" "$2" | head -1 || echo ""
}

@test "parses PrivateKey correctly" {
    result=$(parse_field "PrivateKey" "$TEST_DIR/valid.conf")
    [ "$result" = "wJZlElRVWk+i2rxWRez1jzdRTmIHehhiKt6nweHx2Xo=" ]
}

@test "parses Address correctly" {
    result=$(parse_field "Address" "$TEST_DIR/valid.conf")
    [ "$result" = "10.9.0.158/32" ]
}

@test "parses PublicKey correctly" {
    result=$(parse_field "PublicKey" "$TEST_DIR/valid.conf")
    [ "$result" = "cb1NcUdG5RKFaauOuMncwNhh0ZRr5y9wTQzUaAWtvxA=" ]
}

@test "parses Endpoint correctly" {
    result=$(parse_field "Endpoint" "$TEST_DIR/valid.conf")
    [ "$result" = "us3.tunnelsats.com:51820" ]
}

@test "parses Port Forwarding comment" {
    result=$(parse_comment "Port Forwarding" "$TEST_DIR/valid.conf")
    [ "$result" = "23217" ]
}

@test "parses Server comment" {
    result=$(parse_comment "Server" "$TEST_DIR/valid.conf")
    [ "$result" = "us3.tunnelsats.com" ]
}

@test "parses Valid Until comment" {
    result=$(parse_comment "Valid Until" "$TEST_DIR/valid.conf")
    [ "$result" = "2026-02-01T13:25:08.314Z" ]
}

@test "parses myPubKey comment" {
    result=$(parse_comment "myPubKey" "$TEST_DIR/valid.conf")
    [ "$result" = "QVOdgdIHPxTkHuWqZBwRog1UaA5kHkMo9XhiZmB/rBI=" ]
}

@test "parses PresharedKey correctly" {
    result=$(parse_field "PresharedKey" "$TEST_DIR/valid.conf")
    [ "$result" = "H4PaNtd85Erv5MVv3DTMpDoR+gNnlHHZxgurQmyEgo0=" ]
}

@test "returns empty for missing field" {
    result=$(parse_field "NonExistentField" "$TEST_DIR/valid.conf")
    [ -z "$result" ]
}
