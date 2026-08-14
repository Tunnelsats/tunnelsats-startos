<img src="https://raw.githubusercontent.com/Tunnelsats/tunnelsats/ffb4732328045922dc90eb5580654077e8d3f246/images/brand/logos/ts_logo_rectangle.svg" alt="TunnelSats Logo" width="400"/>

<br/>

<div align="center">
  <img src="https://img.shields.io/github/actions/workflow/status/Tunnelsats/tunnelsats-startos/build.yml?branch=main&label=Build%20Status&style=flat-square" alt="Build Status"/>
  <img src="https://img.shields.io/github/license/Tunnelsats/tunnelsats-startos?style=flat-square&color=blue" alt="License"/>
  <a href="https://tunnelsats.com/join-telegram"><img src="https://img.shields.io/badge/Telegram-Join%20Community-blue?style=flat-square&logo=telegram" alt="Telegram"/></a>
</div>

<br/>

# TunnelSats for StartOS (v0.4.0+)

The official package of [TunnelSats](https://tunnelsats.com/) built for **[StartOS 0.4.0+](https://start9.com)** using the modern StartOS TypeScript SDK (`@start9labs/start-sdk`).

---

## ⚡ What it Solves
Running a Lightning Network node (LND / Core Lightning) over Tor ensures anonymity but introduces latency and routing reliability issues. Conversely, running purely over home Clearnet exposes your residential IP address and ISP physical location.

TunnelSats provides **privacy-preserving clearnet connectivity**:
- Establishes a high-speed WireGuard tunnel to global TunnelSats servers.
- Forwards inbound Lightning peer connections from your public TunnelSats port to port 9735 on your target Lightning node.
- Gives your Lightning node a reachable, stable Clearnet identity without exposing your residential IP in global network gossip.

---

## 🚀 Key StartOS 0.4.0 Features

- **StartOS 0.4.0 TypeScript Architecture**: Built with strongly-typed reactive file models, lifecycle handlers, and subcontainer isolation.
- **In-App Web Dashboard**: Manage and verify your connection, inspect live WireGuard handshake status, and monitor subscription duration via a sleek, responsive UI on port 80.
- **Automated 1-Click Cross-Service Tasks**: Automatically generates a native StartOS 1-Click UI Task prompting you to advertise your TunnelSats external announce endpoint on LND or Core Lightning.
- **Dynamic Dependency Management**: Dynamically mounts and requires either `lnd` or `c-lightning` based on user selection.
- **IPv6 Announcement Filtering**: Suppresses IPv6 announcement endpoints by default to prevent accidental residential IP gossip exposure, with an optional toggle for operators intentionally running dual-stack node profiles.

---

## 🛠 Architecture & Dataplane

StartOS 0.4.0 isolates services into subcontainers:

```
┌─────────────────────────────────────────────────────────────┐
│                        StartOS 0.4.0                        │
│                                                             │
│  ┌───────────────────────┐                                  │
│  │ Target Lightning Node │                                  │
│  │   (LND / CLN)         │                                  │
│  └───────────▲───────────┘                                  │
│              │                                              │
│              │ (Inbound Port Forwarding: Port 9735)         │
│  ┌───────────┴────────────────────────────┐                 │
│  │   StartOS Kernel WireGuard Gateway     │◀─── Inbound P2P │
│  │         (wg0 / Host Interface)         │    (TunnelSats) │
│  └───────────────────▲────────────────────┘                 │
│                      │                                      │
│  ┌───────────────────┴────────────────────┐                 │
│  │      TunnelSats Service (Port 80)      │                 │
│  │  - Web Dashboard & Status Reporting    │                 │
│  │  - Gateway Health Probe & Lifecycle    │                 │
│  └────────────────────────────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

1. **Inbound Routing (Port Forwarding)**: Inbound Lightning traffic arriving on your assigned TunnelSats port is forwarded directly across the WireGuard tunnel to port `9735` on the target Lightning container.
2. **Lightning Gossip Announcement**: Your Lightning node advertises the public TunnelSats address (`<domain>:<vpn_port>`) as its external host, allowing peers to establish low-latency inbound channels.
3. **Web Dashboard**: An internal HTTP service on port 80 provides a management interface displaying tunnel connection state, handshake telemetry, subscription expiration, and configuration guides.

---

## 📦 Installation & User Walkthrough

### 1. Obtain a Subscription
1. Purchase a subscription from [tunnelsats.com](https://tunnelsats.com).
2. Download your WireGuard configuration file (`.conf`).

### 2. Configure TunnelSats in StartOS
1. Open **TunnelSats** from your StartOS Services list.
2. Click **Configure** in the sidebar.
3. Select your **Target Lightning Node** (`LND` or `Core Lightning`).
4. Paste the complete contents of your `.conf` file into **WireGuard Configuration**.
5. Set **Enable TunnelSats** to **ON** and click **Save**.

### 3. Complete the 1-Click Task
1. StartOS will display a notification with an automated **1-Click Task**.
2. Accept the task to automatically populate the **Custom External Host** on your selected Lightning node (`<server>:<vpn_port>`).
3. Your Lightning node will now announce the TunnelSats public IP and port to the global gossip network for inbound peer connectivity.

---

## 🔒 Independent Security & Announcement Audit (CLI)

Node operators can independently audit that their node's announced endpoints and network isolation match expectations:

### 1. Inbound Lightning Announcement Audit
```bash
# For LND:
start-cli package attach lnd -- lncli getinfo

# For Core Lightning:
start-cli package attach c-lightning -- lightning-cli getinfo
```
- **Verification**: Confirm the `uris` (LND) or `binding`/`address` (CLN) contains `<your_pubkey>@<tunnelsats_domain>:<vpn_port>`.

### 2. Outbound IPv6 Isolation Audit
```bash
# For LND:
start-cli package attach lnd -- curl -6 -s --connect-timeout 5 https://api6.ipify.org

# For Core Lightning:
start-cli package attach c-lightning -- curl -6 -s --connect-timeout 5 https://api6.ipify.org
```
- **Expected Output**: `Network unreachable` or connection timeout (when IPv6 Coexistence is OFF).
- **Verification**: Confirms IPv6 traffic cannot leak your residential ISP location.

---

## 🌐 IPv6 Privacy Note

TunnelSats provides an **IPv4-only** WireGuard VPN tunnel. It does not route IPv6 traffic through the VPN. By default, the package filters out IPv6 addresses from automated announcement tasks to ensure your residential IP is not broadcast to Lightning gossip peers. If you enable **Allow Home IPv6 Coexistence**, IPv6 endpoints can be advertised, which will connect directly over your home ISP connection rather than the VPN tunnel.

---

## 🔍 Diagnostic & Verification Tool

The package includes a built-in diagnostic tool [`verify.sh`](verify.sh) to inspect status properties:

```bash
# Run verification inside the TunnelSats container namespace:
start-cli package attach tunnelsats /app/verify.sh
```

**Diagnostic Probes Performed**:
- Gateway API status & WireGuard handshake verification.
- Target Lightning node announcement alignment.
- IPv6 coexistence policy audit.
- Tor proxy coexistence audit.

---

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
