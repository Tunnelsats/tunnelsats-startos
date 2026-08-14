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

FAILED_CHECKS=0

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

if [ -n "$API_DATA" ]; then
    PARSED_VALUES=$(printf '%s\n' "$API_DATA" | python3 -c "
import json, sys
try:
    raw = json.load(sys.stdin)
    # Handle both /api/status dict and StartOS properties dict format
    data = raw.get('data', raw)
    status = raw.get('status', 'running' if raw.get('enabled', False) else 'stopped')
    vpn_conn = raw.get('vpn_connected', True if raw.get('enabled', False) else False)
    handshake = raw.get('handshake', 'active' if vpn_conn else 'none')
    vpn_ip = raw.get('vpn_ip', data.get('Internal IP (Last Octet)', {}).get('value', ''))
    vpn_port = raw.get('vpn_port', data.get('Forwarding Port', {}).get('value', ''))
    server = raw.get('server', data.get('TunnelSats Public IP', {}).get('value', ''))
    print('|'.join([str(v) for v in [status, vpn_conn, handshake, vpn_ip, vpn_port, server]]))
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
    log_warn "Could not retrieve /api/status or /api/properties. Web server may be initializing or unconfigured."
fi

# 3. Outbound Egress Verification
log_step "3. Verifying Outbound Gateway Routing"
PROBE_CODE="
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
"

EGRESS_INFO=""
if [ "$ENGINE" != "inside" ] && [ -n "$CONTAINER_ID" ]; then
    EGRESS_INFO=$($SUDO_CMD $ENGINE exec -i $CONTAINER_NAME python3 -c "$PROBE_CODE" 2>/dev/null | tr -d '\r' || true)
else
    EGRESS_INFO=$(python3 -c "$PROBE_CODE" 2>/dev/null | tr -d '\r' || true)
fi

RAW_EGRESS_IP=""
MASKED_EGRESS_IP=""
if [ -n "$EGRESS_INFO" ]; then
    IFS='|' read -r RAW_EGRESS_IP MASKED_EGRESS_IP <<< "$EGRESS_INFO"
    log_info "Current Egress IPv4: $MASKED_EGRESS_IP"
    
    if [ -n "$SERVER" ] && [ "$SERVER" != "unknown" ]; then
        RESOLVED_SERVER_IP=$(python3 -c "import socket; print(socket.gethostbyname('$SERVER'))" 2>/dev/null || true)
        if [ "$RAW_EGRESS_IP" == "$SERVER" ] || [ "$RAW_EGRESS_IP" == "$RESOLVED_SERVER_IP" ]; then
            log_info "Datapath Verification: Outbound alignment is CORRECT (matches VPN gateway IP ✅)."
        else
            log_warn "Outbound IP ($MASKED_EGRESS_IP) differs from configured TunnelSats server ($SERVER)."
            FAILED_CHECKS=$((FAILED_CHECKS + 1))
        fi
    fi
else
    log_warn "Outbound IPv4 probe timed out or network offline."
    if [ "$ENGINE" == "inside" ] || [ -n "$CONTAINER_ID" ]; then
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
    fi
fi

# 4. IPv6 Leak Prevention Test
log_step "4. IPv6 Leak Prevention Test"
IPV6_PROBE_CODE="
import socket, urllib.request, urllib.error
# 1. Test IPv6 socket route existence
has_ipv6_route = False
try:
    s = socket.socket(socket.AF_INET6, socket.SOCK_DGRAM)
    s.connect(('2606:4700:4700::1111', 53)) # Cloudflare DNS IPv6
    has_ipv6_route = True
    s.close()
except OSError:
    pass

if not has_ipv6_route:
    print('UNROUTABLE')
else:
    # 2. Test IPv6-only WAN probe
    try:
        req = urllib.request.Request('https://api6.ipify.org', headers={'User-Agent': 'curl/8.0'})
        with urllib.request.urlopen(req, timeout=3) as resp:
            ip = resp.read().decode('utf-8').strip()
            if ':' in ip:
                print('LEAK')
            else:
                print('UNVERIFIED')
    except Exception:
        print('UNVERIFIED')
"

IPV6_STATUS=""
if [ "$ENGINE" != "inside" ] && [ -n "$CONTAINER_ID" ]; then
    IPV6_STATUS=$($SUDO_CMD $ENGINE exec -i $CONTAINER_NAME python3 -c "$IPV6_PROBE_CODE" 2>/dev/null | tr -d '\r' || echo "UNVERIFIED")
else
    IPV6_STATUS=$(python3 -c "$IPV6_PROBE_CODE" 2>/dev/null | tr -d '\r' || echo "UNVERIFIED")
fi

if [ "$IPV6_STATUS" == "LEAK" ]; then
    log_warn "IPv6 WAN egress is ACTIVE."
    log_warn "Ensure 'Allow Home IPv6 Coexistence' is disabled in TunnelSats config if you want zero ISP IP exposure."
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
elif [ "$IPV6_STATUS" == "UNROUTABLE" ]; then
    log_info "IPv6 WAN egress is blocked/unroutable. (Zero residential IPv6 leak verified ✅)"
else
    log_warn "IPv6 connectivity check was unverified (IPv6 endpoint unreachable or probe timed out)."
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
if [ "$FAILED_CHECKS" -gt 0 ]; then
    log_error "Diagnostic audit completed with $FAILED_CHECKS failure(s)."
    exit 1
else
    log_info "All diagnostic probes finished successfully."
fi
