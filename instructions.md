# TunnelSats

TunnelSats is a privacy-focused VPN gateway designed for Lightning Nodes (LND & Core Lightning). It routes node traffic through an encrypted WireGuard tunnel, preserving your home IP address while providing clearnet speed and reliability.

## Getting Started

1. **Obtain a Subscription**:
   - Go to [TunnelSats.com](https://tunnelsats.com) and purchase a subscription.
   - Download your WireGuard configuration file (`.conf`).

2. **Configure TunnelSats**:
   - Open **TunnelSats** in your StartOS Dashboard.
   - Click **Configure** in the left navigation.
   - Select your **Target Lightning Node** (`LND` or `Core Lightning`).
   - Paste the complete contents of your `.conf` file into **WireGuard Configuration** (ensure `# VPNPort: XXXXX` is present).
   - Set **Enable TunnelSats** to **ON** and click **Save**.

3. **Advertise Endpoint to Lightning Network**:
   - **For LND (StartOS 0.4.0)**:
     - Open **LND** in your StartOS Dashboard.
     - Click **Actions** &rarr; **Custom External Host**.
     - Enter your TunnelSats domain and port (e.g. `ch1.tunnelsats.com:24556`) and click **Submit**.
     - LND will automatically advertise this endpoint alongside your Tor address.
   - **For Core Lightning (CLN)**:
     - Open **Core Lightning** config and set `announce-addr=<tunnelsats_domain:port>`.

4. **Verify Health**:
   - Check the **Health Checks** tab in TunnelSats to confirm **VPN Connectivity** and **SOCKS5 Proxy** are active.
   - Open the **Web Dashboard** to monitor live tunnel statistics and subscription expiration.
