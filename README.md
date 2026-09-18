# TunnelSats for StartOS

<img src="https://raw.githubusercontent.com/Tunnelsats/tunnelsats/ffb4732328045922dc90eb5580654077e8d3f246/images/brand/logos/ts_logo_rectangle.svg" alt="TunnelSats Logo" width="400"/>

A privacy-focused companion package and routing guide for Lightning Network nodes (LND and Core Lightning) on StartOS.

## Table of Contents

- [Overview](#overview)
- [Quick Reference for AI Consumers](#quick-reference-for-ai-consumers)
- [Architecture & How It Works](#architecture--how-it-works)
- [Volumes & Mount Points](#volumes--mount-points)
- [Subcontainers](#subcontainers)
- [File Models](#file-models)
- [Actions & Tasks](#actions--tasks)
- [Network & Privacy Disclosure](#network--privacy-disclosure)
- [Development & Testing](#development--testing)
- [License](#license)

## Overview

TunnelSats provides dedicated WireGuard VPN infrastructure specifically designed for Lightning Network nodes (LND, Core Lightning, and Eclair). The package features a native storefront for 1-click subscription purchasing and renewals via the Lightning Network, in-process Curve25519 WireGuard keypair generation, on-demand bandwidth telemetry (100GB monthly allowance), and seamless integration with StartOS in-container clearnet VPN routing.

> [!NOTE]
> **Native Storefront & In-Container VPN Architecture**:
> - **In-Process Keygen**: Generates Curve25519 WireGuard keypairs in-process on your device; private keys never leave your node.
> - **Native Storefront**: Browse plans, generate BOLT11 invoices, and pay directly via WebLN or any Lightning wallet.
> - **In-Container Privacy**: In-container WireGuard routing encapsulates both inbound peer traffic and outbound egress (gossip, handshakes, ping/pong acks) with zero residential IP leakage.
> - **Bandwidth Telemetry**: 100GB monthly bandwidth limit per calendar month, fetched on-demand when the UI is opened.
> - **Sovereign Config Export**: Download or export your raw `.conf` anytime.
> - **Automated Expiration Alerts**: StartOS notification tasks raised at 7 days, 3 days, and 1 day before expiration.

## Quick Reference for AI Consumers

```yaml
package_id: tunnelsats
title: TunnelSats
description: A privacy-focused VPN storefront and manager for Lightning Nodes (LND/CLN/Eclair).
architecture:
  model: native-storefront in-container clearnet vpn
  ui_port: 80
  telemetry_daemon: python3 bridge.py
  external_services:
    - https://api.tunnelsats.com (server discovery, subscription orders, and status sync)
volumes:
  - name: main
    path: /data
subcontainers:
  - name: main
    image: tunnelsats
actions:
  - id: configure
    name: Configure
  - id: export-config
    name: Export WireGuard Configuration
tasks:
  - tunnelsats:configure (subscription expiry alert)
```

## Architecture & How It Works

1. **Native Storefront**: Users can purchase or renew subscriptions directly from the Web Dashboard. The package generates a fresh Curve25519 WireGuard keypair locally, submits an order to `api.tunnelsats.com`, and displays a BOLT11 invoice. Once settled, the active `.conf` is provisioned automatically.
2. **Bring Your Own Config**: Users with an existing TunnelSats subscription can paste their `.conf` via the **Configure** action or Web Dashboard.
3. **In-Container Clearnet VPN**: WireGuard routing operates directly inside the target node's container, encapsulating inbound and outbound clearnet P2P traffic to prevent residential IP leakage.
4. **Subscription Lifecycle & Renewal**: The background daemon monitors subscription expiration, updating the local dashboard and raising StartOS tasks when renewal is required.

## Volumes & Mount Points

| Volume Name | Container Path | Purpose |
|-------------|----------------|---------|
| `main`      | `/data`        | Stores `config.json`, `tunnelsatsv3.conf`, and synchronized metadata (`tunnelsats-meta.json`). |

## Subcontainers

| Subcontainer | Base Image | Entrypoint | Purpose |
|--------------|------------|------------|---------|
| `main`       | Debian Slim (Python 3) | `docker_entrypoint.sh` | Serves web UI on port 80 and runs the subscription synchronization daemon. |

## File Models

- **`config.json`**: Primary service configuration (`enabled`, `target-node`, `tunnelsats-conf`, `allow-ipv6`).
- **`tunnelsatsv3.conf`**: WireGuard configuration file written to disk when enabled.
- **`tunnelsats-meta.json`**: Cached subscription metadata (`expiresAt`, `lastSync`, `syncSuccess`, `serverDomain`, `vpnPort`, `bandwidth_used_gb`).

## Actions & Tasks

- **Configure (`configure`)**: Allows users to enable/disable TunnelSats, select their target Lightning node (`lnd` or `cln`), paste their WireGuard configuration, and toggle IPv6 coexistence.
- **Export Configuration (`export-config`)**: Displays the active WireGuard configuration in a masked, copyable modal with download support.
- **Automated Tasks**:
  - `tunnelsats:configure`: Raised when subscription has `<= 7 days` (Important) or `<= 3 days` / expired (Critical). Automatically cleared upon successful renewal.

## Network & Privacy Disclosure

- **Subscription API & Status**: This package queries `https://api.tunnelsats.com` for server discovery, order generation, and on-demand subscription status / bandwidth usage using your WireGuard public key.
- **IPv4 Routing & Full Egress Privacy**: TunnelSats WireGuard tunnels route IPv4 traffic. Outbound clearnet peer traffic is encapsulated within the VPN tunnel. If you enable **Allow Home IPv6 Coexistence**, raw IPv6 traffic bypasses the VPN.

## Development & Testing

```bash
# Run all tests (TypeScript, Python, BATS)
npm run test:all

# Typecheck and build bundle
npm run check && npm run build
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
