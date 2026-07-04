#!/bin/bash
# TunnelSats StartOS Diagnostic Verification Script

set -e

# Curated harmonious terminal color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# 1. Detect Container Engine
ENGINE=""
if command -v podman &>/dev/null; then
    ENGINE="podman"
elif command -v docker &>/dev/null; then
    ENGINE="docker"
else
    if [ -f "/app/bridge.py" ]; then
        ENGINE="inside"
    else
        log_error "Neither podman nor docker found on the host system. Are you running this on the StartOS host?"
        exit 1
    fi
fi

CONTAINER_NAME="tunnelsats.embassy"

# Check container state
if [ "$ENGINE" != "inside" ]; then
    log_info "Detecting container status using $ENGINE..."
    CONTAINER_ID=$(sudo $ENGINE ps -q -f name=$CONTAINER_NAME | tr -d '\r')
    if [ -z "$CONTAINER_ID" ]; then
        log_error "Container '$CONTAINER_NAME' is not running! Start the package on StartOS first."
        exit 1
    else
        log_info "Container '$CONTAINER_NAME' is active (ID: $CONTAINER_ID)."
    fi
else
    log_info "Running diagnostic checks from inside the container namespace."
fi

# 2. Query API status
log_info "Querying API status from the orchestrator..."
if [ "$ENGINE" != "inside" ]; then
    API_DATA=$(sudo $ENGINE exec -i $CONTAINER_NAME python3 -c "
import urllib.request
req = urllib.request.Request('http://127.0.0.1/api/status', headers={'Host': 'localhost'})
try:
    with urllib.request.urlopen(req, timeout=5) as r:
        print(r.read().decode('utf-8'))
except Exception:
    pass
" 2>/dev/null | tr -d '\r' || true)
else
    API_DATA=$(python3 -c "
import urllib.request
req = urllib.request.Request('http://127.0.0.1/api/status', headers={'Host': 'localhost'})
try:
    with urllib.request.urlopen(req, timeout=5) as r:
        print(r.read().decode('utf-8'))
except Exception:
    pass
" 2>/dev/null | tr -d '\r' || true)
fi

if [ -n "$API_DATA" ]; then
    # Parse properties using Python JSON parser (guaranteed to be installed) via stdin
    PARSED_VALUES=$(printf '%s\n' "$API_DATA" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    print('|'.join([str(data.get(k)) for k in ['enabled', 'public_ip', 'vpn_port', 'pubkey']]))
except Exception as e:
    print('ERROR|None|None|None|' + str(e))
" 2>/dev/null | tr -d '\r' || true)
    
    IFS='|' read -r ENABLED PUBLIC_IP VPN_PORT PUBKEY ERROR_MSG <<< "$PARSED_VALUES"
    
    if [ "$ENABLED" == "ERROR" ]; then
        log_warn "Failed to parse API JSON data. Error details: $ERROR_MSG"
    fi
else
    log_warn "Could not connect to /api/status. Web server may be offline."
fi

log_info "Current Properties:"
echo "  - Enabled: ${ENABLED:-unknown}"
echo "  - Public IP: ${PUBLIC_IP:-None}"
echo "  - VPN Port: ${VPN_PORT:-None}"
echo "  - PubKey: ${PUBKEY:-None}"

# 3. Test Outbound SOCKS5 Proxy
log_info "Verifying outbound SOCKS5 proxy routing..."
TEST_CMD="
import socket
def check_proxy():
    s = socket.socket()
    s.settimeout(5)
    try:
        s.connect(('127.0.0.1', 1080))
        s.sendall(b'\x05\x01\x00')
        resp = s.recv(2)
        if resp != b'\x05\x00':
            print('ERROR: SOCKS5 Handshake failed')
            return
        
        domain = b'ipinfo.io'
        request = b'\x05\x01\x00\x03' + bytes([len(domain)]) + domain + b'\x00\x50'
        s.sendall(request)
        resp2 = s.recv(10)
        if len(resp2) < 2 or resp2[1] != 0:
            print('ERROR: Connection through proxy rejected')
            return
        
        s.sendall(b'GET /ip HTTP/1.1\r\nHost: ipinfo.io\r\nUser-Agent: curl/7.88.1\r\nConnection: close\r\n\r\n')
        http_resp = b''
        while True:
            chunk = s.recv(4096)
            if not chunk:
                break
            http_resp += chunk
        
        parts = http_resp.split(b'\r\n\r\n')
        if len(parts) < 2:
            print('ERROR: Invalid HTTP response')
            return
        body = parts[1].decode('utf-8').strip()
        print('SUCCESS_IP:' + body)
    except Exception as e:
        print('ERROR:' + str(e))

check_proxy()
"

if [ "$ENGINE" != "inside" ]; then
    PROXY_IP=$(sudo $ENGINE exec -i $CONTAINER_NAME python3 -c "$TEST_CMD" | tr -d '\r' || true)
else
    PROXY_IP=$(python3 -c "$TEST_CMD" | tr -d '\r' || true)
fi

if [[ "$PROXY_IP" == SUCCESS_IP:* ]]; then
    ACTUAL_IP=${PROXY_IP#SUCCESS_IP:}
    log_info "Outbound SOCKS5 proxy resolves via IP: $ACTUAL_IP"
    
    # Resolve expected IP if it is a hostname (like ch1.tunnelsats.com) safely via env variable
    RESOLVED_VPN_IP=$(PUBLIC_IP="$PUBLIC_IP" python3 -c "import socket, os; ip = os.environ.get('PUBLIC_IP', ''); print(socket.gethostbyname(ip) if ip else '')" 2>/dev/null | tr -d '\r' || true)
    
    if [ "$ACTUAL_IP" == "$PUBLIC_IP" ] || [ "$ACTUAL_IP" == "$RESOLVED_VPN_IP" ]; then
        log_info "Datapath Verification: Outbound alignment is CORRECT (matches VPN IP)."
    else
        log_warn "Outbound IP ($ACTUAL_IP) does not match expected VPN IP ($PUBLIC_IP / $RESOLVED_VPN_IP). Check routing table."
    fi
else
    log_error "Outbound proxy test failed: ${PROXY_IP:-Unknown Error}"
fi

# 4. Test Inbound Port Connectivity
if [ -n "$VPN_PORT" ] && [ "$VPN_PORT" != "None" ] && [ -n "$PUBLIC_IP" ] && [ "$PUBLIC_IP" != "None" ]; then
    log_info "Testing inbound port connectivity to $PUBLIC_IP:$VPN_PORT..."
    
    if [ "$ENGINE" != "inside" ]; then
        INBOUND_TEST=$(PUBLIC_IP="$PUBLIC_IP" VPN_PORT="$VPN_PORT" python3 -c "
import socket, os
try:
    s = socket.socket()
    s.settimeout(5)
    s.connect((os.environ['PUBLIC_IP'], int(os.environ['VPN_PORT'])))
except Exception as e:
    print(e)
" 2>&1 | tr -d '\r' || true)
        if [ -z "$INBOUND_TEST" ]; then
            log_info "Inbound port check: SUCCESS (Port $VPN_PORT is open on $PUBLIC_IP)."
        else
            log_error "Inbound port check: FAILED (Port $VPN_PORT is closed/refused on $PUBLIC_IP). Details: $INBOUND_TEST"
        fi
    else
        log_warn "Inbound port test skipped when running inside container namespace."
    fi
else
    log_warn "VPN Port or Public IP missing. Skipping inbound port test."
fi

log_info "Diagnostics completed."
