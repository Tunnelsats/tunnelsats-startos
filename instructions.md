# TunnelSats

## Getting Started

TunnelSats provides dedicated, privacy-focused WireGuard VPN infrastructure specifically designed for Lightning Network nodes (LND, Core Lightning, and Eclair).

### Option 1: Native Storefront (Recommended)
1. In StartOS, open the **TunnelSats Web Dashboard**.
2. Select your target Lightning node (`LND`, `Core Lightning`, or `Eclair`) and your preferred plan duration (1, 3, 6, or 12 months).
3. The package generates a fresh Curve25519 WireGuard keypair locally in-process on your device (your private key never leaves your server).
4. Pay the Lightning invoice directly using WebLN or scan the BOLT11 QR code with any Lightning wallet.
5. Once settled, TunnelSats automatically activates your subscription and routes clearnet peer traffic through the dedicated tunnel.

### Option 2: Bring Your Own Configuration
1. If you already have an active TunnelSats WireGuard configuration, open **Services** &rarr; **TunnelSats** &rarr; **Configure** (or click "Bring Your Own Config" in the Web Dashboard).
2. Select your **Target Lightning Node** and paste your `.conf` file.
3. Toggle **Enable TunnelSats** to **ON** and save.

---

## In-Container Routing & Fail-Closed Privacy

- **Full Egress Encapsulation**: Clearnet Lightning P2P traffic is routed directly inside your node's container over the WireGuard interface. Both inbound connections and outbound peer packets (gossip, handshakes, ping/pong acks) traverse the encrypted tunnel.
- **Zero Residential IP Leakage**: Your home ISP IP address is never exposed to the clearnet Lightning Network.
- **Tor Hybrid Coexistence**: Onion peer connections continue to route normally over the Tor network, while clearnet peer traffic is routed through TunnelSats.
- **IPv4 Routing**: TunnelSats routes IPv4 traffic. Residential IPv6 traffic is disabled by default to prevent clearnet ISP address leaks.

---

## Bandwidth & Renewals

- **Monthly Allowance**: Subscriptions include 100 GB of transfer bandwidth per calendar month. Bandwidth counters reset automatically on the 1st of every month.
- **On-Demand Telemetry**: Current bandwidth usage and subscription validity are fetched on-demand when opening the Web Dashboard.
- **Proactive Renewal Alerts**: StartOS generates proactive notification tasks 7 days, 3 days, and 1 day before expiration. You can renew at any time via the Web Dashboard.

---

## Sovereign Config Export

You retain full ownership and sovereignty over your cryptographic keys and WireGuard tunnel:
- Download or copy your active `.conf` anytime via the **Web Dashboard** or the **Export WireGuard Configuration** action.
- WireGuard configurations and subscription metadata are securely preserved in encrypted StartOS system backups.

---

## Documentation

- [TunnelSats Documentation](https://tunnelsats.com/guide)
