# Developing TunnelSats for StartOS

This document details the development workflow, testing procedures, and architectural details for developers contributing to the TunnelSats StartOS package.

## Architecture

To run securely inside StartOS's strictly unprivileged container sandbox, this package operates entirely in **userspace** using **`wireproxy`** (a userspace WireGuard client).

- **No CAP_NET_ADMIN:** We do not create kernel interfaces (`wg0`, `tunnelsatsv3`) or use `wg-quick`.
- **No iptables NAT:** Incoming/outgoing traffic rules do not modify the kernel routing tables or container network namespace.
- **Unified Tunneling:** `wireproxy` runs the WireGuard handshake in userspace, opening:
  1. A SOCKS5 proxy server bound to `0.0.0.0:1080` for outbound privacy routing.
  2. A TCP Server Tunnel (`[TCPServerTunnel]`) mapping the public assigned forwarded port directly to the target Lightning node (`c-lightning.embassy:9735` or `lnd.embassy:9735`).

---

## Local Development & Testing

### 1. Run Unit Tests
The python test suite verifies the configuration generation, validation, and orchestrator lifecycle:
```bash
python3 -m unittest discover -s tests -p "test_*.py"
```

### 2. Build the Package
Use the Makefile to build the `.s9pk` bundle. This utilizes a multi-stage Docker build to compile `wireproxy` from source inside a `golang:alpine` container:
```bash
make
```

### 3. Deploy to Test Node (Sideload)
To push and install the package on a running StartOS test node (e.g. `public-fallacy.local`), execute the sideloading script:
```bash
./deploy-sideload.sh
```

---

## Verifying the Dataplane on a Live Node

Once the service is started on a test node, you can verify connection alignment by SSHing into the node and executing container inspections.

### 1. Verify Outbound SOCKS5 Tunnel Routing
Run a request through the container's SOCKS5 proxy to verify it exits via the VPN gateway:
```bash
sudo podman exec tunnelsats.embassy curl -s --socks5-hostname 127.0.0.1:1080 https://ipinfo.io/ip
```
*Verification:* The returned IP must match the public IP address of the VPN server endpoint (e.g., `ch1.tunnelsats.com`).

### 2. Verify Internal Target Connection
Check if the TunnelSats container can talk to the target Lightning container (Core Lightning or LND) on the internal network:
```bash
sudo podman exec tunnelsats.embassy nc -z -w 3 c-lightning.embassy 9735
# or for LND:
sudo podman exec tunnelsats.embassy nc -z -w 3 lnd.embassy 9735
```
*Verification:* Returns success (exit status `0`).

### 3. Verify Inbound Port Forwarding
Test whether the inbound TCP port assigned by TunnelSats is accepting connections and routing them through the tunnel to the Lightning node:
```bash
nc -z -w 5 <vpn_server_endpoint_host> <vpn_port>
```
*Verification:* Returns success (exit status `0`).
*(Note: If the test subscription has expired or is unpaid on the server database, the server will return `Connection refused` even if the WireGuard handshake is active).*
