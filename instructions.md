# TunnelSats

## Getting Started

1. **Obtain a Subscription**:
   - Go to [TunnelSats.com](https://tunnelsats.com) and purchase a subscription.
   - Download your WireGuard configuration file (`.conf`).

2. **Configure TunnelSats**:
   - Open **TunnelSats** in your StartOS Dashboard.
   - Click **Configure** in the left navigation.
   - Select your **Target Lightning Node** (`LND` or `Core Lightning`).
   - Paste the complete contents of your `.conf` file into **WireGuard Configuration** (ensure `# Port Forwarding: XXXXX` or `# VPNPort: XXXXX` is present).
   - Set **Enable TunnelSats** to **ON** and click **Save**.

3. **Advertise Endpoint to Lightning Network**:
   - **Automated 1-Click Setup**: When TunnelSats is enabled with a valid configuration, StartOS will automatically prompt you with a **1-Click UI Task** to populate the **Custom External Host** on your selected Lightning node.
   - **For LND**:
     - Open **LND** in your StartOS Dashboard.
     - Click **Actions & Config** &rarr; **Configuration** &rarr; **Custom External Host**.
     - Enter your TunnelSats domain and port (e.g. `ch1.tunnelsats.com:24556`) and click **Submit**.
     - LND will automatically advertise this endpoint alongside your Tor address.
   - **For Core Lightning (CLN)**:
     - Open **Core Lightning** in your StartOS Dashboard.
     - Click **Actions & Config** &rarr; **Configuration** &rarr; **General Settings**.
     - Enter your TunnelSats domain and port (e.g. `ch1.tunnelsats.com:24556`) into the **Custom External Host** field and click **Submit**.
     - Core Lightning will persistently advertise this endpoint alongside your Tor address.

4. **Verify Health & Route Status**:
   - Check the **Health Checks** tab in TunnelSats to confirm **Web Dashboard** and **VPN Gateway Status** are active.
   - Open the **Web Dashboard** to monitor live tunnel statistics and subscription expiration.

## Independent Verification (CLI)

To independently audit your node's outbound and inbound IP:

- **LND Outbound IPv4**: `start-cli package attach lnd -- curl -s https://api.ipify.org`
- **LND Outbound IPv6**: `start-cli package attach lnd -- curl -6 -s --connect-timeout 5 https://api6.ipify.org`
- **Core Lightning Outbound IPv4**: `start-cli package attach -i lightning c-lightning -- bash -c 'exec 3<>/dev/tcp/api.ipify.org/80; printf "GET / HTTP/1.1\r\nHost: api.ipify.org\r\nConnection: close\r\n\r\n" >&3; cat <&3 | tail -n 1'`
- **Core Lightning Outbound IPv6**: `start-cli package attach -i lightning c-lightning -- bash -c 'timeout 3 bash -c "exec 3<>/dev/tcp/api6.ipify.org/80" 2>/dev/null && echo "LEAK" || echo "BLOCKED"'`

## IPv6 & Privacy Policy

TunnelSats is an **IPv4-only** WireGuard VPN service. It does not route or tunnel IPv6 traffic.

> ⚠️ **Warning**: Do not configure or advertise an IPv6 address on your Lightning node unless you explicitly intend to expose your home ISP location to IPv6 peers. If dual-stack connectivity is desired, enable **Allow Home IPv6 Coexistence** in **Configure**.

## Documentation

- [TunnelSats Website](https://tunnelsats.com)
- [GitHub Repository](https://github.com/Tunnelsats/tunnelsats-startos)
- [Setup FAQ & Troubleshooting](https://tunnelsats.com/faq)
