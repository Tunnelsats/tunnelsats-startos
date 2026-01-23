#!/bin/bash
# TunnelSats for StartOS - Health Check Script
# Verifies WireGuard tunnel is active and functional

set -euo pipefail

# Exit codes for StartOS:
# 0   = healthy
# 61  = starting (temporary failure)
# 62+ = unhealthy

WG_INTERFACE="ts0"
MAX_HANDSHAKE_AGE=180  # 3 minutes

# ============================================
# Check 1: WireGuard interface exists
# ============================================
if ! ip link show "$WG_INTERFACE" &>/dev/null; then
    echo "WireGuard interface $WG_INTERFACE not found" >&2
    exit 61
fi

# ============================================
# Check 2: Handshake occurred recently
# ============================================
LATEST_HANDSHAKE=$(wg show "$WG_INTERFACE" latest-handshakes 2>/dev/null | awk '{print $2}' | head -1)

if [[ -z "$LATEST_HANDSHAKE" || "$LATEST_HANDSHAKE" == "0" ]]; then
    echo "No WireGuard handshake yet - tunnel may be initializing" >&2
    exit 61
fi

NOW=$(date +%s)
HANDSHAKE_AGE=$((NOW - LATEST_HANDSHAKE))

if [[ $HANDSHAKE_AGE -gt $MAX_HANDSHAKE_AGE ]]; then
    echo "WireGuard handshake stale (${HANDSHAKE_AGE}s ago, max ${MAX_HANDSHAKE_AGE}s)" >&2
    exit 62
fi

# ============================================
# Check 3: Can reach internet through tunnel
# ============================================
VPN_IP=$(curl -sf --interface "$WG_INTERFACE" --max-time 5 https://api.ipify.org 2>/dev/null || echo "")

if [[ -z "$VPN_IP" ]]; then
    echo "Cannot reach internet through VPN tunnel" >&2
    exit 62
fi

# ============================================
# Check 4: SOCKS5 proxy is listening
# ============================================
SOCKS_PORT="${SOCKS_PORT:-9050}"
if ! ss -tlnp | grep -q ":${SOCKS_PORT}"; then
    echo "SOCKS5 proxy not listening on port ${SOCKS_PORT}" >&2
    exit 62
fi

# All checks passed
echo "VPN active. Exit IP: $VPN_IP"
exit 0
