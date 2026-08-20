# TunnelSats

## Getting Started

1. **Obtain a Subscription**:
   - Visit [TunnelSats.com](https://tunnelsats.com) and choose a subscription plan for your Lightning node.
   - Download or copy your WireGuard configuration file (`.conf`).

2. **Add Gateway in StartOS**:
   - In StartOS, navigate to **System** &rarr; **Gateways** &rarr; click **Add Gateway**.
   - Select **WireGuard** and paste the content of your TunnelSats `.conf` file.
   - Connect the gateway.

3. **Configure TunnelSats Package**:
   - Open **TunnelSats** in your StartOS Services list.
   - Click **Configure** in the left menu.
   - Select your **Target Lightning Node** (`LND` or `Core Lightning`).
   - Paste your WireGuard configuration into **WireGuard Configuration**.
   - Set **Enable TunnelSats** to **ON** and click **Save**.

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
