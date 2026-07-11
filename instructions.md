# TunnelSats Instructions

TunnelSats provides premium VPN infrastructure specifically for Lightning Nodes (LND/CLN), enabling clearnet inbound connections and masking outbound peer-to-peer traffic.

## Getting Started

1. **Obtain a Subscription**: Visit [TunnelSats](https://tunnelsats.com) to select a plan and generate your WireGuard configuration file.
2. **Configure the Service**:
   - Go to the **Configure** tab in the TunnelSats service.
   - Choose your **Target Lightning Node** (LND or Core Lightning).
   - Paste the contents of your generated `.conf` file into the **WireGuard Configuration** field. Ensure it includes the `# VPNPort: XXXXX` metadata comment.
   - Toggle **Enable TunnelSats** to ON and click **Save**.
3. **Verify Connection**:
   - Go to the **Interfaces** or **Health Checks** page to verify the SOCKS5 proxy and VPN Connectivity are green and active.
4. **Configure your Lightning Node**:
   - Configure LND or CLN to use the TunnelSats SOCKS5 proxy (port 1080) for outbound traffic, and route inbound traffic via the assigned VPN port.
    - Refer to the FAQ & Help section on the TunnelSats Web Dashboard or the project README on GitHub for the exact configuration options.
