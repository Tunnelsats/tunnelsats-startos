# PRD: Tunnelsats StartOS Integration

## Problem Statement

StartOS users running Lightning Nodes (LND or Core Lightning) often find themselves behind ISP CGNAT or restricted to Tor, leading to subpar routing performance, slow channel gossip, and an inability to accept inbound Clearnet connections. While TunnelSats provides premium VPN infrastructure to solve this, StartOS's strict sandboxing prevents traditional host-level network modification. Users need a native StartOS solution that provides a secure, containerized bridge to the TunnelSats network.

## Solution

A native StartOS application (`.s9pk`) that operates as a container-scoped network gateway. This application establishes a WireGuard tunnel to TunnelSats and provides two critical functions:
1.  **Outbound:** A SOCKS5 proxy (`microsocks`) allowing Lightning Nodes to route outbound gossip and peer connections through the VPN.
2.  **Inbound:** A reverse port-forwarding engine using `iptables` DNAT inside the container to funnel traffic from the WireGuard interface directly to the user's selected Lightning Node (`lnd.embassy` or `c-lightning.embassy`).

## User Stories

1.  **Native Configuration:** As a StartOS user, I want to paste my TunnelSats WireGuard config directly into the StartOS UI, so I can avoid manual SSH configuration.
2.  **Service Selection:** As a Lightning runner, I want a simple toggle to select between LND and CLN, so that the port-forwarding automatically targets the correct service.
3.  **Encapsulated Privacy:** As a node operator, I want my outbound traffic routed via SOCKS5 through a premium VPN, so that my home IP is masked and I avoid Tor latency.
4.  **Clearnet Inbound:** As a routing node operator, I want inbound peer connections on my TunnelSats IP to be forwarded to my node via `iptables`, enabling high-performance clearnet channels.
5.  **Health Transparency:** As a user, I want a health check on my dashboard showing "VPN Connected" and "Proxy Active", so I can be certain my traffic is protected.
6.  **Public Info:** As a user, I want to see my public TunnelSats IP and assigned port in the "Properties" section, making it easy to share my node URI.

## Implementation Decisions

### Core Architecture
-   **Base Image:** Alpine Linux (for minimal footprint).
-   **Security:** Container executes with `CAP_NET_ADMIN` capability via `manifest.yaml` to allow `wg-quick` and `iptables` operations.
-   **Networking:** Strictly container-scoped; no host network modification occurs.

### Modules
-   **Config Controller:** A shell/python logic in `entrypoint.sh` that parses the `tunnelsats.conf` provided in `config_spec.yaml`, specifically extracting `# VPNPort` metadata and WireGuard keys.
-   **VPN Manager:** Manages the lifecycle of the `wg0` interface using `wireguard-tools`.
-   **Traffic Engine:**
    -   **Outbound:** `microsocks` bound to `0.0.0.0:1080`.
    -   **Inbound:** `iptables` rules to DNAT traffic from `wg0:<VPNPort>` to `<TargetNode>.embassy:9735`.
-   **StartOS Integration:**
    -   `manifest.yaml`: Declares dependencies on LND or CLN (optional/required based on config).
    -   `config_spec.yaml`: Provides the UI for WG Config and Target Selection.
    -   `health-checks`: Verifies VPN handshake and SOCKS5 listener.
    -   `properties`: Reports live networking status via a shell script.

## Testing Decisions

### Automated Tests
-   **Connectivity Check:** A `bats` test suite verifying the `wg0` interface creation and reachability.
-   **Proxy Verification:** Testing the SOCKS5 proxy with `curl --socks5 tunnelsats.embassy:1080`.

### Manual / Integration Testing
-   **End-to-End:** Verification on the live test node (`public-fallacy.local`) using `start-cli` to monitor logs and properties.
-   **Inbound Proof:** Using an external machine to connect to the TunnelSats public IP and verifying the handshake arrives at the internal `lnd.embassy`.

## Out of Scope
-   **Automated Node Config:** Users must still manually enter the SOCKS5 proxy details into their LND/CLN configuration via the StartOS UI.
-   **Multiple VPNs:** Support for multiple simultaneous TunnelSats connections is not planned for V1.

## Further Notes
-   **Target Resolution:** Implementation will use stable internal DNS hostnames (`lnd.embassy` / `c-lightning.embassy`) confirmed during research.
-   **Port Metadata:** We will follow the convention established in the Umbrel app where `# VPNPort: XXXXX` in the config file automates the forwarding port selection.
