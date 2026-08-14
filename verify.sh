#!/usr/bin/env bash
# ==============================================================================
# TunnelSats StartOS 0.4.0 Service Diagnostic Tool
# ==============================================================================
# Audits TunnelSats service container status, WireGuard gateway reachability,
# target Lightning node inbound reachability (port 9735), and Tor connectivity.
#
# Usage:
#   Inside container:  /app/verify.sh
#   From StartOS host: start-cli package attach tunnelsats /app/verify.sh
# ==============================================================================

set -euo pipefail

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "\n${BLUE}==> $1${NC}"
}

FAILED_CHECKS=0

# 1. Environment & Container Status Check
log_step "1. Environment & Container Status"

ENGINE="none"
CONTAINER_NAME="tunnelsats.embassy"
CONTAINER_ID=""
SUDO_CMD=""

if [ -f "/app/bridge.py" ] || [ -f "./bridge.py" ]; then
    ENGINE="inside"
    log_info "Running diagnostic checks from inside the TunnelSats container namespace."
else
    # Detect available container runtime
    if command -v podman &> /dev/null; then
        ENGINE="podman"
    elif command -v docker &> /dev/null; then
        ENGINE="docker"
    fi

    if [ "$EUID" -ne 0 ] && command -v sudo &> /dev/null; then
        SUDO_CMD="sudo"
    fi

    if [ "$ENGINE" != "none" ]; then
        CONTAINER_ID=$($SUDO_CMD $ENGINE ps -q -f "name=$CONTAINER_NAME" 2>/dev/null || true)
        if [ -z "$CONTAINER_ID" ]; then
            CONTAINER_ID=$($SUDO_CMD $ENGINE ps -q -f "name=tunnelsats" 2>/dev/null || true)
        fi
    fi

    if [ -n "$CONTAINER_ID" ]; then
        log_info "Detected TunnelSats container running via $ENGINE ($CONTAINER_ID)."
    else
        log_info "Running diagnostics in standalone local mode."
    fi
fi

# 2. Querying TunnelSats Gateway Status
log_step "2. Querying TunnelSats Gateway Status"
API_DATA=""
if [ "$ENGINE" != "inside" ] && [ -n "$CONTAINER_ID" ]; then
    API_DATA=$($SUDO_CMD $ENGINE exec -i $CONTAINER_NAME python3 -c "
import urllib.request, json
for path in ['/api/status', '/api/properties']:
    try:
        req = urllib.request.Request('http://127.0.0.1' + path, headers={'Host': 'localhost'})
        with urllib.request.urlopen(req, timeout=5) as r:
            print(r.read().decode('utf-8'))
            break
    except Exception:
        continue
" 2>/dev/null | tr -d '\r' || true)
else
    API_DATA=$(python3 -c "
import urllib.request, json
for path in ['/api/status', '/api/properties']:
    try:
        req = urllib.request.Request('http://127.0.0.1' + path, headers={'Host': 'localhost'})
        with urllib.request.urlopen(req, timeout=5) as r:
            print(r.read().decode('utf-8'))
            break
    except Exception:
        continue
" 2>/dev/null | tr -d '\r' || true)
fi

STATUS="unknown"
VPN_CONNECTED="unknown"
HANDSHAKE="unknown"
VPN_IP=""
VPN_PORT=""
SERVER=""
TARGET_HOST="lnd.embassy"
TARGET_PORT="9735"
ALLOW_IPV6="False"

if [ -n "$API_DATA" ]; then
    PARSED_VALUES=$(printf '%s\n' "$API_DATA" | python3 -c "
import json, sys
try:
    raw = json.load(sys.stdin)
    data = raw.get('data', raw)
    status = raw.get('status', 'running' if raw.get('enabled', False) else 'stopped')
    vpn_conn = raw.get('vpn_connected', True if raw.get('enabled', False) else False)
    handshake = raw.get('handshake', 'active' if vpn_conn else 'none')
    vpn_ip = raw.get('vpn_ip', raw.get('internal_octet', data.get('Internal IP (Last Octet)', {}).get('value', '')))
    vpn_port = raw.get('vpn_port', data.get('Forwarding Port', {}).get('value', ''))
    server = raw.get('server', raw.get('public_ip', data.get('TunnelSats Public IP', {}).get('value', '')))
    target_h = raw.get('target_host', 'lnd.embassy')
    target_p = str(raw.get('target_port', 9735))
    allow_v6 = str(raw.get('allow_ipv6', False))
    print('|'.join([str(v) for v in [status, vpn_conn, handshake, vpn_ip, vpn_port, server, target_h, target_p, allow_v6]]))
except Exception as e:
    print('ERROR||||||||' + str(e))
" 2>/dev/null | tr -d '\r' || true)
    
    IFS='|' read -r STATUS VPN_CONNECTED HANDSHAKE VPN_IP VPN_PORT SERVER TARGET_HOST TARGET_PORT ALLOW_IPV6 <<< "$PARSED_VALUES"
    
    log_info "Gateway Status Properties:"
    echo "  - Status: ${STATUS:-unknown}"
    echo "  - VPN Connected: ${VPN_CONNECTED:-unknown}"
    echo "  - Handshake: ${HANDSHAKE:-unknown}"
    echo "  - Internal VPN IP: ${VPN_IP:-unknown}"
    echo "  - Forwarded Port: ${VPN_PORT:-unknown}"
    echo "  - Server: ${SERVER:-unknown}"

    if [ "$VPN_CONNECTED" != "True" ] && [ "$VPN_CONNECTED" != "true" ]; then
        log_warn "TunnelSats gateway is not connected (status: $STATUS)."
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
    fi
else
    log_warn "Could not retrieve /api/status or /api/properties. Web server may be initializing or unconfigured."
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
fi

TARGET_PKG="lnd"
if [[ "$TARGET_HOST" =~ "c-lightning" ]] || [[ "$TARGET_HOST" =~ "cln" ]]; then
    TARGET_PKG="c-lightning"
fi

# 3. Target Lightning Node Inbound Reachability Audit
log_step "3. Target Lightning Node Inbound Reachability Audit"
log_info "Testing internal TCP reachability to target node: ${TARGET_HOST}:${TARGET_PORT}"

LN_REACHABLE="false"
if python3 -c "
import socket
s = socket.socket()
s.settimeout(3)
try:
    s.connect(('$TARGET_HOST', int('$TARGET_PORT')))
    s.close()
    exit(0)
except Exception:
    exit(1)
" 2>/dev/null; then
    LN_REACHABLE="true"
    log_info "Target Lightning node is listening on ${TARGET_HOST}:${TARGET_PORT} (Inbound Ready ✅)"
else
    log_warn "Target Lightning node (${TARGET_HOST}:${TARGET_PORT}) is currently unreachable or starting up."
fi

# 4. Tor Coexistence & SOCKS Proxy Check
log_step "4. Tor Coexistence & SOCKS Proxy Check"
TOR_FOUND=false
for tor_host in "tor.embassy" "127.0.0.1" "localhost"; do
    if python3 -c "
import socket
s = socket.socket()
s.settimeout(2)
try:
    s.connect(('$tor_host', 9050))
    s.close()
    exit(0)
except Exception:
    exit(1)
" 2>/dev/null; then
        TOR_FOUND=true
        log_info "Tor proxy accessible ($tor_host:9050). Onion routing coexistence functional."
        break
    fi
done

if [ "$TOR_FOUND" = false ]; then
    if [ -n "${BRIDGE_TOR:-}" ]; then
        log_info "Tor proxy accessible (BRIDGE_TOR). Onion routing coexistence functional."
    else
        log_info "Tor SOCKS proxy (port 9050) not detected on local network. (Expected if Tor is uninstalled)."
    fi
fi

# 5. Target Lightning Node Port Forwarding Profile
log_step "5. Target Lightning Node Port Forwarding Profile"
if [ -n "$SERVER" ] && [ "$SERVER" != "unknown" ] && [ -n "$VPN_PORT" ] && [ "$VPN_PORT" != "unknown" ]; then
    log_info "Target Node Announcement Profile: ${SERVER}:${VPN_PORT}"
    log_info "Lightning peer connection string: <your_node_pubkey>@${SERVER}:${VPN_PORT}"
    echo -e "\n  To verify announced URIs on your Lightning node (run on StartOS host):"
    if [ "$TARGET_PKG" == "lnd" ]; then
        echo "  start-cli package attach lnd -- lncli getinfo"
    else
        echo "  start-cli package attach c-lightning -- lightning-cli getinfo"
    fi
else
    log_warn "Target announcement endpoint unconfigured or missing WireGuard port metadata."
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
fi

# 6. Host-Level CLI Audit Recipes
log_step "6. Host-Level CLI Audit Recipes"
log_info "Target Lightning Node: ${TARGET_PKG} (${TARGET_HOST})"
if [ "$ALLOW_IPV6" == "True" ]; then
    log_warn "Allow Home IPv6 Coexistence is ENABLED (IPv6 connections route via home ISP)."
else
    log_info "Allow Home IPv6 Coexistence is DISABLED (default IPv6 gossip suppression)."
fi

echo -e "\n  Run these commands on the StartOS host to independently audit target node traffic:"
echo "  1. Audit Target Outbound IPv4:  start-cli package attach ${TARGET_PKG} -- curl -s https://api.ipify.org"
echo "  2. Audit Target IPv6 Isolation: start-cli package attach ${TARGET_PKG} -- curl -6 -s --connect-timeout 5 https://api6.ipify.org"

# Summary
log_step "Verification Summary"
if [ $FAILED_CHECKS -eq 0 ]; then
    log_info "TunnelSats service diagnostics and endpoint verification completed successfully."
    exit 0
else
    log_error "Diagnostic audit completed with $FAILED_CHECKS failure(s)."
    exit 1
fi
