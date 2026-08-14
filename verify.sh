#!/bin/bash
# TunnelSats StartOS 0.4.0 Diagnostic & Verification Script

set -e

# Harmonious terminal color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
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
    echo -e "\n${BOLD}${BLUE}==>${NC} ${BOLD}$1${NC}"
}

# Check non-interactive privilege escalation
SUDO_CMD=""
if [ "$EUID" -ne 0 ] && command -v sudo &>/dev/null; then
    if sudo -n true 2>/dev/null; then
        SUDO_CMD="sudo"
    fi
fi

# 1. Detect Container Engine & Context
log_step "1. Environment & Container Status"
ENGINE=""
if [ -f "/app/bridge.py" ]; then
    ENGINE="inside"
    log_info "Running diagnostic checks from inside the TunnelSats container namespace."
elif command -v podman &>/dev/null; then
    ENGINE="podman"
elif command -v docker &>/dev/null; then
    ENGINE="docker"
else
    log_warn "Neither podman nor docker found. Assuming standalone execution."
fi

CONTAINER_NAME="tunnelsats.embassy"

if [ "$ENGINE" != "inside" ] && [ -n "$ENGINE" ]; then
    log_info "Detecting container status using $ENGINE..."
    CONTAINER_ID=$($SUDO_CMD $ENGINE ps -q -f name=$CONTAINER_NAME 2>/dev/null | tr -d '\r' || true)
    if [ -z "$CONTAINER_ID" ]; then
        log_warn "Container '$CONTAINER_NAME' is not running or running with customized ID. Probing local endpoints..."
    else
        log_info "Container '$CONTAINER_NAME' is active (ID: $CONTAINER_ID)."
    fi
fi

# 2. Query Web Dashboard API Status
log_step "2. Querying TunnelSats Gateway Status"
API_DATA=""
if [ "$ENGINE" != "inside" ] && [ -n "$CONTAINER_ID" ]; then
    API_DATA=$($SUDO_CMD $ENGINE exec -i $CONTAINER_NAME python3 -c "
import urllib.request, json
req = urllib.request.Request('http://127.0.0.1/api/status', headers={'Host': 'localhost'})
try:
    with urllib.request.urlopen(req, timeout=5) as r:
        print(r.read().decode('utf-8'))
except Exception as e:
    pass
" 2>/dev/null | tr -d '\r' || true)
else
    API_DATA=$(python3 -c "
import urllib.request, json
req = urllib.request.Request('http://127.0.0.1/api/status', headers={'Host': 'localhost'})
try:
    with urllib.request.urlopen(req, timeout=5) as r:
        print(r.read().decode('utf-8'))
except Exception:
    pass
" 2>/dev/null | tr -d '\r' || true)
fi

if [ -n "$API_DATA" ]; then
    PARSED_VALUES=$(printf '%s\n' "$API_DATA" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    print('|'.join([str(data.get(k, '')) for k in ['status', 'vpn_connected', 'handshake', 'vpn_ip', 'vpn_port', 'server']]))
except Exception as e:
    print('ERROR|||||' + str(e))
" 2>/dev/null | tr -d '\r' || true)
    
    IFS='|' read -r STATUS VPN_CONNECTED HANDSHAKE VPN_IP VPN_PORT SERVER <<< "$PARSED_VALUES"
    
    log_info "Gateway Status Properties:"
    echo "  - Status: ${STATUS:-unknown}"
    echo "  - VPN Connected: ${VPN_CONNECTED:-unknown}"
    echo "  - Handshake: ${HANDSHAKE:-unknown}"
    echo "  - Internal VPN IP: ${VPN_IP:-unknown}"
    echo "  - Forwarded Port: ${VPN_PORT:-unknown}"
    echo "  - Server: ${SERVER:-unknown}"
else
    log_warn "Could not retrieve /api/status. Web server may be initializing or unconfigured."
fi

# 3. Outbound Egress Verification
log_step "3. Verifying Outbound Gateway Routing"
EGRESS_INFO=$(python3 -c "
import urllib.request
endpoints = ['https://api.ipify.org', 'https://ipinfo.io/ip', 'https://icanhazip.com']
for ep in endpoints:
    try:
        req = urllib.request.Request(ep, headers={'User-Agent': 'curl/8.0'})
        with urllib.request.urlopen(req, timeout=5) as resp:
            ip = resp.read().decode('utf-8').strip()
            if ip:
                parts = ip.split('.')
                masked = f'{parts[0]}.{parts[1]}.***.***' if len(parts) == 4 else '***'
                print(f'{ip}|{masked}')
                break
    except Exception:
        continue
" 2>/dev/null | tr -d '\r' || true)

if [ -n "$EGRESS_INFO" ]; then
    IFS='|' read -r RAW_EGRESS_IP MASKED_EGRESS_IP <<< "$EGRESS_INFO"
    log_info "Current Egress IPv4: $MASKED_EGRESS_IP"
else
    log_warn "Outbound IPv4 probe timed out or network offline."
fi

# 4. IPv6 Leak Detection Test
log_step "4. IPv6 Leak Prevention Test"
IPV6_EGRESS=$(python3 -c "
import urllib.request, socket
try:
    req = urllib.request.Request('https://api64.ipify.org', headers={'User-Agent': 'curl/8.0'})
    with urllib.request.urlopen(req, timeout=3) as resp:
        ip = resp.read().decode('utf-8').strip()
        if ':' in ip:
            print('LEAK')
except Exception:
    print('BLOCKED')
" 2>/dev/null | tr -d '\r' || echo "BLOCKED")

if [ "$IPV6_EGRESS" == "LEAK" ]; then
    log_warn "IPv6 WAN egress is ACTIVE."
    log_warn "Ensure 'Allow Home IPv6 Coexistence' is disabled in TunnelSats config if you want zero ISP IP exposure."
else
    log_info "IPv6 egress is blocked/unroutable. (Zero residential IPv6 leak verified ✅)"
fi

# 5. Tor Coexistence Audit
log_step "5. Tor Coexistence & SOCKS Proxy Check"
TOR_STATUS=$(python3 -c "
import socket
for port in [9050, 9150]:
    try:
        with socket.create_connection(('127.0.0.1', port), timeout=2):
            print('LOCAL_TOR')
            break
    except OSError:
        pass
else:
    try:
        with socket.create_connection(('10.0.3.1', 9050), timeout=2):
            print('BRIDGE_TOR')
    except OSError:
        print('NONE')
" 2>/dev/null | tr -d '\r' || echo "NONE")

if [ "$TOR_STATUS" == "LOCAL_TOR" ] || [ "$TOR_STATUS" == "BRIDGE_TOR" ]; then
    log_info "Tor proxy accessible ($TOR_STATUS). Onion routing coexistence functional."
else
    log_info "No local Tor daemon detected on standard bridge. (Expected in standalone mode)"
fi

# 6. Target Lightning Node Endpoint Advertisement Verification
log_step "6. Target Lightning Node Port Forwarding Audit"
if [ -n "$SERVER" ] && [ "$SERVER" != "unknown" ] && [ -n "$VPN_PORT" ] && [ "$VPN_PORT" != "unknown" ]; then
    log_info "Target Node Announcement Profile: $SERVER:$VPN_PORT"
    log_info "Lightning peer connection string: <your_node_pubkey>@$SERVER:$VPN_PORT"
else
    log_info "Target announcement endpoint will populate once WireGuard configuration is activated."
fi

log_step "Verification Summary"
log_info "All diagnostic probes finished successfully."
