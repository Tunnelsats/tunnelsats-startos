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
   - The package validates your configuration, automatically ensures gateway markers (`# StartTunnel` and `# inbound: yes`) under `[Interface]`, and displays the ready-to-copy configuration.

3. **Add Gateway in StartOS**:
   - In StartOS, navigate to **System** &rarr; **Gateways** &rarr; click **Add Gateway** (or edit an existing TunnelSats gateway).
   - Select **WireGuard** and paste the configuration carrying the inbound markers.
   - StartOS auto-classifies the gateway as **Inbound/Outbound**, enabling public port forwarding to port 9735 on your node.
   - Connect the gateway.

4. **Target Node Host Announcement**:
   - **Option A: 1-Click Automated Task (Recommended)**: When TunnelSats is enabled with a valid WireGuard configuration, StartOS automatically generates an **important** 1-Click task prompt on your server dashboard. Simply click and accept the prompt to populate your node's external host setting automatically.
   - **Option B: Manual Configuration (Fallback)**: Alternatively, navigate to your target node (**Services** &rarr; **LND** or **Core Lightning**), open **Config** &rarr; **Custom External Host** (or **General Settings** for Core Lightning), and enter your TunnelSats endpoint (e.g. `ch1.tunnelsats.com:24556`).

5. **Enable Public Address Firewall Toggle**:
   - In StartOS, open your target node (**LND** or **Core Lightning**).
   - Go to **Interfaces** &rarr; **Peer Interface** &rarr; find your TunnelSats public IP (`<VPN_IP>:9735`).
   - Toggle the switch to **ON**.
   - 💡 **StartOS Port Check Prompt ("Address Requirements")**: StartOS will display an "Address Requirements" modal prompting to test port forwarding on port `9735:9735`. Because TunnelSats maps your dedicated external port (e.g. `24556`) rather than generic `9735`, clicking **"Test"** will fail. Simply **click "Later"** to save and proceed. This directs StartOS nftables to open the firewall and forward incoming peer connections from the VPN tunnel to your node.

6. **Set Outbound Policy Routing**:
   - In StartOS, open your target node (**LND** or **Core Lightning**).
   - Go to **Actions** &rarr; **Set Outbound Gateway** &rarr; select your TunnelSats gateway to ensure all outbound peer traffic routes through the VPN.

7. **Monitor & Manage**:
   - Open the **Web Dashboard** to monitor subscription expiration, time remaining, and connection properties.

## ⚠️ Important Note on Multiple Lightning Nodes

StartOS assigns internal listening ports on a first-come, first-served basis:
- The standard Lightning P2P port is **9735**. TunnelSats WireGuard gateways forward incoming peer traffic specifically to internal port 9735.
- If multiple Lightning implementations are installed (e.g. both Core Lightning and LND), the first installed node receives internal port 9735, while subsequent nodes are assigned arbitrary high ports (e.g. 63989).
- **Inbound TunnelSats traffic will only reach the node holding internal port 9735.** To switch the forwarding target or resolve port conflicts, ensure the desired node holds port 9735 (uninstalling or clearing the binding of the previous holder if necessary).

## Network & Privacy Notice

- **Outbound Synchronization**: The TunnelSats background daemon periodically checks `https://tunnelsats.com/api/public/v1/subscription/status` using your WireGuard public key to synchronize expiration status and alert you before your subscription expires.
- **IPv4 vs IPv6**: TunnelSats routes IPv4 traffic. Outbound IPv6 traffic is blackholed by default under StartOS gateway policy routing to prevent home ISP leaks.

## Documentation

- [TunnelSats Website](https://tunnelsats.com)
- [StartOS Gateway Documentation](https://docs.start9.com)
- [TunnelSats FAQ & Setup Guides](https://tunnelsats.com/faq)
- [GitHub Repository](https://github.com/Tunnelsats/tunnelsats-startos)
