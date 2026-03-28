## Problem Statement
StartOS users running Lightning Nodes (LND/CLN) are often trapped behind ISP CGNATs or limited to Tor, resulting in poor routing, slow channel gossip, and an inability to accept inbound Clearnet connections. They need a way to route their Lightning traffic through Tunnelsats' premium VPN infrastructure. However, StartOS's strict sandboxing prevents the automated host-level network hijacking we utilize on Umbrel.

## Solution
A native StartOS application (`.s9pk`) that acts as a secure, container-scoped network gateway. It establishes a WireGuard tunnel to Tunnelsats and exposes two primary functions to the StartOS internal network:
1. A SOCKS5 proxy for LND/CLN outbound traffic.
2. A reverse port-forwarder utilizing `iptables` that catches inbound peer connections on the WireGuard interface and funnels them directly to the chosen LND/CLN container.
The user configuration is handled natively through the StartOS UI, including a toggle to target either LND or CLN.

## User Stories
1. As a StartOS user, I want to paste my Tunnelsats WireGuard configuration into a native UI, so that I don't have to SSH into the server to configure it.
2. As a Lightning Node runner, I want a UI toggle to select whether I am routing LND or CLN, so that the VPN forwards traffic to the correct internal service.
3. As a Lightning Node runner, I want to route my outbound peer connections through Tunnelsats, so that my node's IP is hidden and Tor latency is bypassed.
4. As a Lightning Node runner, I want inbound traffic arriving at my Tunnelsats IP to be automatically forwarded via `iptables` to my chosen node, so that I can establish clearnet channels.
5. As a StartOS user, I want a health check widget on my dashboard to show "VPN Connected", so I know my node isn't leaking traffic.
6. As a user, I want to see my current public Tunnelsats IP and port in the "Properties" section of the app, so I can share my node URI easily.

## Implementation Decisions
* **Core Image:** Alpine Linux base.
* **VPN Engine:** `wireguard-tools`.
* **Outbound Engine:** `microsocks` bound to `0.0.0.0:1080` inside the container. Exposed as a StartOS Interface in `manifest.yaml`.
* **Inbound Engine:** Container-scoped `iptables` (DNAT and MASQUERADE). The script will parse the user's choice (LND vs CLN) and apply rules forwarding `WG_IP:<VPNPort>` to `<Target_Node>.embassy:<P2P_Port>`.
* **Config Handling:** `config_spec.yaml` will request the `[Interface]` details, `[Peer]` details, and the Target Node toggle. 
* **Runtime Logic:** `entrypoint.sh` will parse `/data/startos_config.yaml`, generate `/etc/wireguard/wg0.conf`, apply the `iptables` rules, and launch the services.
* **Network Discovery:** The IDE Agent will use SSH access to `public-fallacy.local` to determine the exact internal hostnames and exposed ports for LND and CLN within the StartOS Docker network to ensure the `iptables` rules target the correct destinations.

## Testing Decisions
* **VPN Connectivity:** A `health_check.sh` script that validates the WireGuard interface is up and can ping the Tunnelsats gateway.
* **Outbound Proxy Integrity:** Execution of `curl --socks5 tunnelsats.embassy:1080 ifconfig.me` from the test node to verify external IP masking.
* **Inbound Routing:** Using `nc` (netcat) from an external machine to the Tunnelsats public IP/Port to verify the connection successfully traverses the VPN and reaches the internal Lightning node on the test server.

## Out of Scope (but please validate and challenge this statement if you find different ways)
* Automated modification of the StartOS LND/CLN configurations. Users must manually configure their node to use the SOCKS5 proxy via the StartOS UI.
* Dynamic container discovery via `/var/run/docker.sock` (prohibited by StartOS).