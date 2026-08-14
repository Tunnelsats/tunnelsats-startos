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
- Supports outbound gateway policy routing through the StartOS 0.4.0 network gateway manager (`start-cli package set-outbound-gateway`).
- Hides your residential IPv4 address while delivering low-latency Clearnet channel routing.

---

## 🚀 Key StartOS 0.4.0 Features

- **StartOS 0.4.0 Native Gateway Architecture**: Zero userspace SOCKS proxy overhead. Direct integration with StartOS 0.4.0 outbound gateway routing for target Lightning containers (`lnd` or `c-lightning`).
- **In-App Web Dashboard**: Manage and verify your connection, inspect live WireGuard handshake status, and monitor subscription duration via a sleek, responsive UI on port 80.
- **Automated 1-Click Cross-Service Tasks**: Automatically generates a native StartOS 1-Click UI Task prompting you to advertise your TunnelSats external announce endpoint on LND or Core Lightning.
- **Dynamic Dependency Management**: Dynamically mounts and requires either `lnd` or `c-lightning` based on user selection.
- **Configurable IPv6 Coexistence**: Strict IPv4-only default prevents accidental residential IPv6 gossip exposure, with an optional toggle for operators intentionally opting into dual-stack routing.

---

## 🛠 Architecture & Dataplane

StartOS 0.4.0 isolates services into subcontainers and manages network routing:

```
┌─────────────────────────────────────────────────────────────┐
│                        StartOS 0.4.0                        │
│                                                             │
│  ┌───────────────────────┐                                  │
│  │ Target Lightning Node │                                  │
│  │   (LND / CLN)         │                                  │
│  └───────────┬───────────┘                                  │
│              │ (Outbound Gateway Policy Routing)            │
│              ▼                                              │
│  ┌────────────────────────────────────────┐                 │
│  │   StartOS Kernel WireGuard Gateway     │────▶ Clearnet   │
│  │         (wg0 / Host Interface)         │    (TunnelSats) │
│  └───────────────────▲────────────────────┘                 │
│                      │                                      │
│                      │ (Inbound Port Forwarding)            │
│  ┌───────────────────┴────────────────────┐                 │
│  │      TunnelSats Service (Port 80)      │                 │
│  │  - Web Dashboard & Status Reporting    │                 │
│  │  - Gateway Health Probe & Lifecycle    │                 │
│  └────────────────────────────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

1. **Inbound Routing (Port Forwarding)**: Inbound Lightning traffic arriving on your assigned TunnelSats port is forwarded directly across the WireGuard tunnel to port `9735` on the target Lightning container.
2. **Outbound Routing (Gateway Routing)**: When configured as the Outbound Gateway for LND/CLN (`start-cli package set-outbound-gateway <lnd|c-lightning> tunnelsats`), outbound clearnet traffic from the target Lightning container routes through the TunnelSats WireGuard interface.
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

### 3. Complete the 1-Click Task & Set Outbound Gateway
1. StartOS will display a notification with an automated **1-Click Task**.
2. Accept the task to automatically populate the **Custom External Host** on your selected Lightning node (`<server>:<vpn_port>`).
3. To route outbound peer traffic through the VPN, select **TunnelSats** as the **Outbound Gateway** in your Lightning node settings.
4. Your Lightning node will now announce the TunnelSats public IP and port to the global gossip network.

---

## 🔍 Diagnostic & Verification Tool

The package includes a built-in diagnostic tool [`verify.sh`](verify.sh) to test all routing layers:

```bash
# Run verification inside the TunnelSats container namespace:
start-cli package attach tunnelsats /app/verify.sh
```

**Diagnostic Probes Performed**:
- Gateway API status & handshake verification.
- Outbound IPv4 egress verification (with privacy-preserving IP masking).
- Active IPv6 leak prevention audit.
- Tor proxy coexistence audit.
- Target Lightning node announcement verification.

---

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
