# TunnelSats

## Getting Started

1. **Obtain a Subscription**:
   - Visit [TunnelSats.com](https://tunnelsats.com) and choose a subscription plan for your Lightning node.
   - Download or copy your WireGuard configuration file (`.conf`).

2. **Configure TunnelSats Companion Service**:
   - In StartOS, navigate to **Services** &rarr; **TunnelSats** &rarr; **Configure**.
   - Select your **Target Lightning Node** (`LND` or `Core Lightning`).
   - Paste your WireGuard configuration into **WireGuard Configuration**.
   - Set **Enable TunnelSats** to **ON** and click **Save**.
   - The package validates your configuration, automatically injects the `# inbound: yes` marker under `[Interface]`, and displays the ready-to-copy configuration.

3. **Add Gateway in StartOS**:
   - In StartOS, navigate to **System** &rarr; **Gateways** &rarr; click **Add Gateway** (or edit an existing TunnelSats gateway).
   - Select **WireGuard** and paste the configuration carrying `# inbound: yes` (as provided by the Configure action result or dashboard).
   - StartOS auto-classifies the gateway as **Inbound/Outbound**, enabling public port forwarding to port 9735 on your node.
   - Connect the gateway.

4. **1-Click Lightning Host Announcement**:
   - Once saved, StartOS will present a **1-Click Task** on your dashboard to configure the external host on your Lightning service.
   - Click the task and confirm to automatically advertise your TunnelSats public IP and port to the Lightning Network.

5. **Set Outbound Policy Routing**:
   - In StartOS, open your target node (**LND** or **Core Lightning**).
   - Go to **Actions** &rarr; **Set Outbound Gateway** &rarr; select your TunnelSats gateway to ensure all outbound peer traffic routes through the VPN.

6. **Monitor & Manage**:
   - Open the **Web Dashboard** to monitor subscription expiration, time remaining, and connection properties.

## Network & Privacy Notice

- **Outbound Synchronization**: The TunnelSats background daemon periodically checks `https://tunnelsats.com/api/public/v1/subscription/status` using your WireGuard public key to synchronize expiration status and alert you before your subscription expires.
- **IPv4 vs IPv6**: TunnelSats routes IPv4 traffic. Outbound IPv6 traffic is blackholed by default under StartOS gateway policy routing to prevent home ISP leaks.

## Documentation

- [TunnelSats Website](https://tunnelsats.com)
- [StartOS Gateway Documentation](https://docs.start9.com)
- [TunnelSats FAQ & Setup Guides](https://tunnelsats.com/faq)
- [GitHub Repository](https://github.com/Tunnelsats/tunnelsats-startos)
