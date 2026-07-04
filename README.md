<img src="https://raw.githubusercontent.com/Tunnelsats/tunnelsats/ffb4732328045922dc90eb5580654077e8d3f246/images/brand/logos/ts_logo_rectangle.svg" alt="TunnelSats Logo" width="400"/>

<br/>

<div align="center">
  <img src="https://img.shields.io/github/actions/workflow/status/Tunnelsats/tunnelsats-startos/build.yml?branch=main&label=Build%20Status&style=flat-square" alt="Build Status"/>
  <img src="https://img.shields.io/github/license/Tunnelsats/tunnelsats-startos?style=flat-square&color=blue" alt="License"/>
  <a href="https://tunnelsats.com/join-telegram"><img src="https://img.shields.io/badge/Telegram-Join%20Community-blue?style=flat-square&logo=telegram" alt="Telegram"/></a>
</div>

<br/>

# TunnelSats for StartOS

This repository contains the containerized version of [TunnelSats](https://tunnelsats.com/) optimized for [StartOS](https://start9.com) (fully compatible with v0.3.5.x and later).

## ⚡ What it Solves
Running a Lightning Network node (LND/CLN) over Tor ensures privacy but introduces latency and routing reliability issues. Conversely, running purely on Clearnet exposes your home IP address. 

TunnelSats provides a hybrid solution: **Privacy-preserving clearnet connectivity**. 
By establishing a secure WireGuard tunnel to one of our global servers, your node's Lightning traffic is routed through our IP address. Your home IP remains hidden while you benefit from the speed and reliability of the Clearnet.

---

## 🚀 Features
- **In-App Web Dashboard**: Manage and verify your connection, inspect subscription status, and monitor data limits via a sleek, dark-themed responsive UI.
- **Dynamic Dependency Mapping**: Automatically configured and integrated into StartOS's service manager. The system dynamically updates dependency states (LND or Core Lightning) based on your selected target.
- **Zero Sudo Host Routing**: Operates entirely in userspace using `wireproxy` inside the isolated container namespace. No modification of host-level `iptables` or system network interfaces is required.

---

## 🛠 Architecture & Dataplane

StartOS strictly isolates services. Apps cannot manipulate host-level routing or run in host network mode. TunnelSats implements a **Proxy & Forwarding Model** strictly confined to the `tunnelsats` container:

```
┌─────────────────────────────────────────────────────────────┐
│                        StartOS                              │
│  ┌─────────────┐     ┌──────────────────────┐               │
│  │  LND / CLN  │────▶│  TunnelSats Service  │               │
│  └─────────────┘     │  ┌────────────────┐  │               │
│        │             │  │   wireproxy    │──┼──▶ Clearnet   │
│        │             │  │  (userspace)   │  │ (VPN Server)  │
│        ▼             │  ├────────────────┤  │               │
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
2. **Inbound (Port Forwarding)**: Traffic arriving on your assigned TunnelSats external port is forwarded through the userspace WireGuard tunnel directly to your target Lightning service (`lnd.embassy` or `c-lightning.embassy`) on port `9735`.

---

## 📦 Installation & Configuration

### Prerequisites
1. A StartOS server (v0.3.5.x or later).
2. LND or Core Lightning installed.
3. An active TunnelSats subscription from [tunnelsats.com](https://tunnelsats.com).

### Step 1: Install TunnelSats
- **Sideload (Development)**:
  1. Download the latest `.s9pk` from [Releases](https://github.com/Tunnelsats/tunnelsats-startos/releases) or build it from source.
  2. In your StartOS dashboard, navigate to **System** → **Sideload Service** and upload the package.

### Step 2: Configure the Tunnel
1. Purchase a subscription at [tunnelsats.com](https://tunnelsats.com) or renew an existing one.
2. Download your WireGuard `.conf` configuration file.
3. In your StartOS dashboard, click on the **TunnelSats** service, open **Config**, and paste the entire content of the `.conf` file.
4. Toggle **Enable TunnelSats** to `On`, choose your **Target Lightning Node** (LND or CLN), and click **Save**.
5. Start the service.

### Step 3: Configure LND or Core Lightning

#### LND Config Changes
Add the following options to your LND configuration (`lnd.conf`):
```ini
[Application Options]
externalhosts=<your-vpn-server>:<your-vpn-port>

[tor]
tor.skip-proxy-for-clearnet-targets=true
tor.streamisolation=false
```

#### Core Lightning (CLN) Config Changes
Add the following options to your Core Lightning configuration (`config`):
```ini
bind-addr=0.0.0.0:9735
announceto=<your-vpn-server>:<your-vpn-port>
```

---

## 🛠 Diagnostic Tool (`verify.sh`)

We bundle a secure python-powered test suite inside the container that you can run to verify that your tunnel and ports are aligned:

```bash
# Run the verification script on your StartOS host
sudo start-cli package action tunnelsats verify
```

Example Output:
```text
=== TunnelSats Dataplane Verification ===
Target: ch1.tunnelsats.com (198.51.100.1) : 24556
----------------------------------------------------------------
[0/3] Discovering Home IP...                    PASS (82.165.12.34)
[1/3] Testing Outbound Tunnel Alignment...      PASS (Verified via 198.51.100.1)
[2/3] Testing Inbound Port (via IP)...          PASS (Connected to 198.51.100.1:24556)
[3/3] Testing Inbound Port (via Hostname)...    PASS (Connected to ch1.tunnelsats.com:24556)
----------------------------------------------------------------
Verification Successful! Your node is routing securely.
```

---

## 💻 Developer Guide

### Requirements
- Docker (with buildx support)
- [start-sdk](https://github.com/Start9Labs/start-os/tree/master/core)
- Make

### Building the Package
```bash
git clone https://github.com/Tunnelsats/tunnelsats-startos.git
cd tunnelsats-startos
make
```
This produces `tunnelsats.s9pk`, which you can sideload directly onto your server.

### Running Unit Tests
```bash
python3 -m unittest discover -s tests -p "test_*.py"
```

---

## 💬 Support & Links
- **Official Website**: [tunnelsats.com](https://tunnelsats.com)
- **Help & FAQ**: [tunnelsats.com/faq](https://tunnelsats.com/faq)
- **Telegram Group**: [TunnelSats Community](https://tunnelsats.com/join-telegram)
