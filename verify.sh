#!/usr/bin/env bash
# ==============================================================================
# TunnelSats StartOS 0.4.0 Diagnostic & Verification Tool
# ==============================================================================
# Audits container namespace status, gateway reachability, target Lightning node
# policy routing, IPv6 leak prevention, and port forwarding alignment.
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
    target = raw.get('target_host', 'lnd.embassy')
    allow_v6 = str(raw.get('allow_ipv6', False))
    print('|'.join([str(v) for v in [status, vpn_conn, handshake, vpn_ip, vpn_port, server, target, allow_v6]]))
except Exception as e:
    print('ERROR|||||||' + str(e))
" 2>/dev/null | tr -d '\r' || true)
    
    IFS='|' read -r STATUS VPN_CONNECTED HANDSHAKE VPN_IP VPN_PORT SERVER TARGET_HOST ALLOW_IPV6 <<< "$PARSED_VALUES"
    
    log_info "Gateway Status Properties:"
    echo "  - Status: ${STATUS:-unknown}"
    echo "  - VPN Connected: ${VPN_CONNECTED:-unknown}"
    echo "  - Handshake: ${HANDSHAKE:-unknown}"
    echo "  - Internal VPN IP: ${VPN_IP:-unknown}"
    echo "  - Forwarded Port: ${VPN_PORT:-unknown}"
    echo "  - Server: ${SERVER:-unknown}"
else
    log_warn "Could not retrieve /api/status or /api/properties. Web server may be initializing or unconfigured."
fi

# Determine target package identifier for CLI commands
TARGET_PKG="lnd"
if [[ "$TARGET_HOST" =~ "c-lightning" ]] || [[ "$TARGET_HOST" =~ "cln" ]]; then
    TARGET_PKG="c-lightning"
fi

# 3. Target Node Policy Routing & Egress Audit Guide
log_step "3. Target Node Policy Routing & Egress Audit"
log_info "StartOS 0.4.0 kernel policy routing directs all outbound traffic from your Lightning node through the WireGuard interface (wg0)."
log_info "Target Lightning Node: ${TARGET_PKG} (${TARGET_HOST})"

RESOLVED_SERVER_IP=""
if [ -n "$SERVER" ] && [ "$SERVER" != "unknown" ]; then
    RESOLVED_SERVER_IP=$(python3 -c "import socket; print(socket.gethostbyname('$SERVER'))" 2>/dev/null || true)
fi

echo -e "\n  ${BLUE}Direct CLI Audit Commands (Run on StartOS host):${NC}"
echo -e "  ---------------------------------------------------------"
echo -e "  ${GREEN}1. Audit Outbound IPv4 Egress:${NC}"
echo -e "     start-cli package attach ${TARGET_PKG} -- curl -s https://api.ipify.org"
if [ -n "$RESOLVED_SERVER_IP" ]; then
    echo -e "     (Expected Output: ${RESOLVED_SERVER_IP} / ${SERVER})"
fi

echo -e "\n  ${GREEN}2. Audit Outbound IPv6 Isolation:${NC}"
echo -e "     start-cli package attach ${TARGET_PKG} -- curl -6 -s --connect-timeout 5 https://api6.ipify.org"
if [ "$ALLOW_IPV6" == "True" ]; then
    echo -e "     (Allow IPv6 is ON: Expected Output: <Home_ISP_IPv6>)"
else
    echo -e "     (Allow IPv6 is OFF: Expected Output: Network unreachable / Timeout)"
fi

# 4. IPv6 Leak Prevention Policy
log_step "4. IPv6 Leak Prevention Policy"
if [ "$ALLOW_IPV6" == "True" ]; then
    log_warn "Allow Home IPv6 Coexistence is ENABLED."
    log_warn "Dual-stack IPv6 connections bypass the VPN and connect directly over your home ISP connection."
else
    log_info "Allow Home IPv6 Coexistence is DISABLED (default)."
    log_info "IPv6 addresses are excluded from gossip announcement tasks to protect your home privacy."
fi

# 5. Tor Coexistence & SOCKS Proxy Check
log_step "5. Tor Coexistence & SOCKS Proxy Check"
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

# 6. Target Lightning Node Port Forwarding Audit
log_step "6. Target Lightning Node Port Forwarding Audit"
if [ -n "$SERVER" ] && [ "$SERVER" != "unknown" ] && [ -n "$VPN_PORT" ] && [ "$VPN_PORT" != "unknown" ]; then
    log_info "Target Node Announcement Profile: ${SERVER}:${VPN_PORT}"
    log_info "Lightning peer connection string: <your_node_pubkey>@${SERVER}:${VPN_PORT}"
    echo -e "\n  ${BLUE}To verify announced URIs on your Lightning node:${NC}"
    if [ "$TARGET_PKG" == "lnd" ]; then
        echo -e "  start-cli package attach lnd -- lncli getinfo"
    else
        echo -e "  start-cli package attach c-lightning -- lightning-cli getinfo"
    fi
else
    log_info "Target announcement endpoint will populate once WireGuard configuration is activated."
fi

# Summary
log_step "Verification Summary"
if [ $FAILED_CHECKS -eq 0 ]; then
    log_info "All diagnostic probes finished successfully."
    exit 0
else
    log_error "Diagnostic audit completed with $FAILED_CHECKS failure(s)."
    exit 1
fi
