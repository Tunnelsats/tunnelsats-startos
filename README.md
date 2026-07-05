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

### Step 3: Configure LND or Core Lightning (Persistence Workarounds)

On StartOS, manual changes to configuration files (like `lnd.conf` or CLN's `config`) are normally overwritten on restarts or updates. Use the following methods to ensure your TunnelSats VPN address remains persistent.

#### Option A: LND Node Configuration

##### On StartOS 0.3.5.x (Active version)
The LND wrapper runs a `configurator` utility on startup that rewrites `lnd.conf` based on LND's `config.yaml` values, wiping manual edits. You can permanently inject your TunnelSats external host by utilizing a newline injection in LND's `peer-tor-address` field:
1. SSH into your StartOS host:
   ```bash
   ssh start9@<your-node-ip>
   ```
2. Open LND's configuration YAML:
   ```bash
   sudo nano /embassy-data/package-data/volumes/lnd/data/main/start9/config.yaml
   ```
3. Locate the `peer-tor-address` line and wrap it in quotes, appending a newline (`\n`) and your custom external host parameter:
   ```yaml
   peer-tor-address: "yournodeaddress.onion\nexternalhosts=your-vpn-server.com:your-vpn-port"
   ```
4. Save and exit (`Ctrl+O`, `Ctrl+X`), then restart the LND service in the StartOS dashboard. The configurator will generate two valid `externalhosts` entries in `lnd.conf`, advertising both Tor and your clearnet tunnel.

##### On StartOS 0.4.0+ (TypeScript SDK)
StartOS 0.4.x natively supports external hosts:
1. In the LND service UI under the **Actions** menu, select **Custom External Host**.
2. Enter your TunnelSats domain and port (e.g. `your-vpn-server.com:your-vpn-port`).
3. Click submit and restart LND. This writes to `store.json` and is persistently merged into `lnd.conf` on every boot.

---

#### Option B: Core Lightning (CLN) Node Configuration

##### On StartOS 0.3.5.x (Active version)
CLN's entrypoint script generates `/root/.lightning/config` from `/root/.lightning/config.main` on container start, wiping manual edits. We can hook into the persistent startup script `waitForStart.sh` to automatically re-append the settings on every container boot:
1. SSH into your StartOS host:
   ```bash
   ssh start9@<your-node-ip>
   ```
2. Open the persistent startup script:
   ```bash
   sudo nano /embassy-data/package-data/volumes/c-lightning/data/main/start9/waitForStart.sh
   ```
3. Add the following lines at the very end of the file (before the script exits):
   ```bash
   # Append TunnelSats VPN announce-addr if missing from config.main
   VPN_ADDR="your-vpn-server.com:your-vpn-port"
   if ! grep -q "announce-addr=$VPN_ADDR" /root/.lightning/config.main; then
     echo "announce-addr=$VPN_ADDR" >> /root/.lightning/config.main
   fi
   ```
4. Save and exit, then restart the Core Lightning service in the StartOS dashboard. This dynamically reapplies the clearnet settings even if the GUI configuration is changed or saved.

##### On StartOS 0.4.0+ (TypeScript SDK)
In StartOS 0.4.x, the CLN configuration is rebuilt dynamically by `watchHosts.ts` on startup. To announce your TunnelSats endpoint permanently:
- A future enhancement PR has been proposed to the official `cln-startos` repository to introduce a "Custom External Host" UI action identical to LND.
- Until natively merged, you can implement this by appending the TunnelSats endpoint directly to the `announce-addr` list in `/root/.lightning/config` using a container startup hook.

---

## 🛠 Diagnostic Tool (`verify.sh`)

We bundle a secure diagnostic tool inside the container that you can run on your StartOS host to verify that your tunnel and ports are aligned:

```bash
# Run the verification script inside the container namespace from your host
sudo podman exec -it tunnelsats.embassy /app/verify.sh
```

Example Output:
```text
[INFO] Running diagnostic checks from inside the container namespace.
[INFO] Querying API status from the orchestrator...
[INFO] Current Properties:
  - Enabled: True
  - Public IP: ch1.tunnelsats.com
  - VPN Port: 24556
  - PubKey: Wh+WdZHLty4p3BHbeWZioeEVbhFLlS1H/5dj/++QmSw=
[INFO] Verifying outbound SOCKS5 proxy routing...
[INFO] Outbound SOCKS5 proxy resolves via IP: 83.228.229.56
[INFO] Datapath Verification: Outbound alignment is CORRECT (matches VPN IP).
[INFO] Testing inbound port connectivity to ch1.tunnelsats.com:24556...
[INFO] Inbound port check: SUCCESS (Port 24556 is open on ch1.tunnelsats.com).
[INFO] Diagnostics completed.
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
