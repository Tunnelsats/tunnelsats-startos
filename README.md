<img src="https://raw.githubusercontent.com/Tunnelsats/tunnelsats/ffb4732328045922dc90eb5580654077e8d3f246/images/brand/logos/ts_logo_rectangle.svg" alt="TunnelSats Logo" width="400"/>

<br/>

<div align="center">
  <img src="https://img.shields.io/github/actions/workflow/status/Tunnelsats/tunnelsats-startos/build.yml?branch=main-0.4.0&label=Build%20Status&style=flat-square" alt="Build Status"/>
  <img src="https://img.shields.io/github/license/Tunnelsats/tunnelsats-startos?style=flat-square&color=blue" alt="License"/>
  <a href="https://tunnelsats.com/join-telegram"><img src="https://img.shields.io/badge/Telegram-Join%20Community-blue?style=flat-square&logo=telegram" alt="Telegram"/></a>
</div>

<br/>

# TunnelSats for StartOS (v0.4.0+)

This branch contains the official package of [TunnelSats](https://tunnelsats.com/) built for **[StartOS 0.4.0+](https://start9.com)** using the modern StartOS TypeScript SDK (`@start9labs/start-sdk`).

> **Looking for StartOS 0.3.5.x?** Please refer to the [`main`](https://github.com/Tunnelsats/tunnelsats-startos/tree/main) branch for 0.3.5.x compatible releases.

---

## ⚡ What it Solves
Running a Lightning Network node (LND/CLN) over Tor ensures privacy but introduces latency and routing reliability issues. Conversely, running purely on Clearnet exposes your home IP address. 

TunnelSats provides a hybrid solution: **Privacy-preserving clearnet connectivity**. 
By establishing a secure WireGuard tunnel to one of our global servers, your node's Lightning traffic is routed through our IP address. Your home IP remains hidden while you benefit from the speed and reliability of the Clearnet.

---

## 🚀 Features & StartOS 0.4.0 Enhancements
- **In-App Web Dashboard**: Manage and verify your connection, inspect subscription status, and monitor data limits via a sleek UI.
- **StartOS 0.4.0 TypeScript SDK Architecture**: Built with strongly-typed reactive file models, lifecycle handlers, and subcontainer isolation.
- **Dynamic Dependency Mapping**: Automatically updates dependency states (`lnd` or `c-lightning`) based on your selected target Lightning node.
- **Zero Sudo Host Routing**: Operates entirely in userspace using `wireproxy` inside the isolated container namespace. No modification of host-level `iptables` or system network interfaces required.

---

## 🛠 Architecture & Dataplane

StartOS strictly isolates services. TunnelSats implements a **Proxy & Forwarding Model** strictly confined to the `tunnelsats` container:

```
┌─────────────────────────────────────────────────────────────┐
│                        StartOS 0.4.0                        │
│  ┌─────────────┐     ┌──────────────────────┐               │
│  │  LND / CLN  │────▶│  TunnelSats Service  │               │
│  └─────────────┘     │  (SubContainer: main)│               │
│        │             │  ┌────────────────┐  │               │
│        │             │  │   wireproxy    │──┼──▶ Clearnet   │
│        ▼             │  │  (userspace)   │  │ (VPN Server)  │
│   Tor Daemon ───────▶│  │ SOCKS5 Proxy   │  │               │
│   (optional)         │  │ (port 1080)    │  │               │
│                      │  ├────────────────┤  │               │
│                      │  │ Inbound Port   │  │               │
│                      │  │ (port 9735)    │  │               │
│                      └──────────────────────┘               │
│                                  │                          │
│                                  ▼                          │
│                      (forward P2P to port 9735)             │
└─────────────────────────────────────────────────────────────┘
```

1. **Outbound (SOCKS5)**: `wireproxy` connects to the TunnelSats WireGuard server and exposes a local SOCKS5 proxy on port `1080`. Your Lightning Node (LND/CLN) is configured to route outbound peer-to-peer connections through this proxy.
2. **Inbound (Port Forwarding)**: Traffic arriving on your assigned TunnelSats external port is forwarded through the userspace WireGuard tunnel directly to your target Lightning service (`lnd` or `c-lightning`) on port `9735`.

---

## 📦 Installation & Configuration

### Prerequisites
1. A StartOS server running **v0.4.0+**.
2. LND or Core Lightning installed.
3. An active TunnelSats subscription from [tunnelsats.com](https://tunnelsats.com).

### Step 1: Install TunnelSats
- **Sideloading (Development / Early Access)**:
  1. Download the latest `.s9pk` from [Releases](https://github.com/Tunnelsats/tunnelsats-startos/releases) or build it locally.
  2. In your StartOS dashboard, navigate to **System** → **Sideload Service** and upload `tunnelsats_x86_64.s9pk` (or `tunnelsats_aarch64.s9pk` for ARM64).

### Step 2: Configure the Tunnel
1. Purchase a subscription at [tunnelsats.com](https://tunnelsats.com) or renew an existing one.
2. Download your WireGuard `.conf` configuration file.
3. In your StartOS dashboard, click on the **TunnelSats** service, open **Config**, and paste the content of your `.conf` file into the form.
4. Toggle **Enable TunnelSats** to `On`, choose your **Target Lightning Node** (`LND` or `Core Lightning`), and click **Save**.
5. Start the service.

### Step 3: Configure Target Lightning Node (LND / CLN)

#### Option A: LND Node Configuration (StartOS 0.4.0+)
StartOS 0.4.x natively supports external hosts:
1. Open the LND service UI, click the **Actions** menu, and select **Custom External Host**.
2. Enter your TunnelSats domain and assigned port (e.g. `your-vpn-server.com:your-vpn-port`).
3. Submit and restart LND. This writes to `store.json` and persistently merges into `lnd.conf` on every boot.

#### Option B: Core Lightning (CLN) Node Configuration
In StartOS 0.4.x, CLN configuration is rebuilt dynamically on startup. Append your TunnelSats endpoint to `announce-addr` in `/root/.lightning/config` using a container startup hook or wait for the upstream CLN UI action.

---

## 🛠 Diagnostic Verification Tool

To run container diagnostics on a StartOS 0.4.0 server:

```bash
start-cli package attach tunnelsats -n main -- /app/verify.sh
```

Example Output:
```text
[INFO] Running diagnostic checks from inside the container namespace.
[INFO] Current Properties:
  - Enabled: True
  - Public IP: ch1.tunnelsats.com
  - VPN Port: 24556
[INFO] Verifying outbound SOCKS5 proxy routing...
[INFO] Outbound SOCKS5 proxy resolves via IP: 83.228.229.56
[INFO] Datapath Verification: Outbound alignment is CORRECT (matches VPN IP).
[INFO] Testing inbound port connectivity to ch1.tunnelsats.com:24556...
[INFO] Inbound port check: SUCCESS (Port 24556 is open on ch1.tunnelsats.com).
[INFO] Diagnostics completed.
```

---

## 🏷 Versioning Strategy

TunnelSats follows StartOS SemVer versioning specifications (`<version>:<revision>`):
- Current Package Version: `0.4.0:0` (declared in [`startos/versions/current.ts`](file:///home/admin/Development/tunnelsats-startos/startos/versions/current.ts) and [`package.json`](file:///home/admin/Development/tunnelsats-startos/package.json)).
- Revisions (`:0`, `:1`) indicate packaging/wrapper updates for the same upstream release.

For detailed developer instructions, SDK file layouts, and build guidelines, refer to [`DEVELOPMENT.md`](file:///home/admin/Development/tunnelsats-startos/DEVELOPMENT.md).

---

## 💬 Support & Links
- **Official Website**: [tunnelsats.com](https://tunnelsats.com)
- **Help & FAQ**: [tunnelsats.com/faq](https://tunnelsats.com/faq)
- **Telegram Group**: [TunnelSats Community](https://tunnelsats.com/join-telegram)
