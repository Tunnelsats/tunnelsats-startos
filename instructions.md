# TunnelSats

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

4. **Verify Health**:
   - Check the **Health Checks** tab in TunnelSats to confirm **VPN Connectivity** and **SOCKS5 Proxy** are active.
   - Open the **Web Dashboard** to monitor live tunnel statistics and subscription expiration.

## Documentation

- [TunnelSats Website](https://tunnelsats.com)
- [GitHub Repository](https://github.com/Tunnelsats/tunnelsats-startos)
- [Setup FAQ & Troubleshooting](https://tunnelsats.com/faq)
