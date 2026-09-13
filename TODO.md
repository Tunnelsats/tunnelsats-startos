# TunnelSats StartOS Package — Marketplace Submission Roadmap

## 🚀 Marketplace Submission Pipeline (Start9 Community Registry)

- [x] **Step 1: Initial Submission Email**
  - Sent email to `submissions@start9.com` requesting inclusion in the Start9 Community Registry.
  - Repository: `https://github.com/Tunnelsats/tunnelsats-startos`
  - Release Tag: `v0.4.0-beta3` (Released & Published)

- [x] **Step 2: Start9 Fork & Feedback**
  - Start9 fork created at `https://github.com/Start9-Community/tunnelsats-startos`.
  - Addressed comprehensive code review feedback from Start9 packaging engineers ([Issue #54](https://github.com/Tunnelsats/tunnelsats-startos/issues/54)):
    - [x] **Dual Gateway Markers**: Implemented automated `# StartTunnel` (for StartOS 0.4.0.1) and `# inbound: yes` (for StartOS 0.4.0.2+) marker injection for native StartOS gateway auto-classification ([Start9 PR #3893](https://github.com/Start9Labs/start-technologies/pull/3893)).
    - [x] **3-Step Setup Guidance**: Streamlined UI workflow across configure modal, instructions, README, and Web UI (System Gateways, Custom External Host, and Peer Interface firewall toggle).
    - [x] **StartOS Port Check Resolution**: Documented clicking "Later" on StartOS "Address Requirements" port test modal (since generic 9735 probe fails while assigned high port works).
    - [x] **Multi-Node Port Allocation**: Documented internal port 9735 behavior when both LND and Core Lightning are installed.
    - [x] **Full Multilingual Localization**: Full release notes and descriptions across `en_US`, `es_ES`, `de_DE`, `pl_PL`, and `fr_FR`.
    - [x] **Enhanced Fail-Closed Diagnostics**: Upgraded `verify.sh` to audit real WireGuard interfaces, host port bindings, and external WAN connectivity.
    - [x] **Version Bumps**: Released `0.4.0:4` ([PR #80](https://github.com/Tunnelsats/tunnelsats-startos/pull/80)) and `0.4.0:5` ([PR #82](https://github.com/Tunnelsats/tunnelsats-startos/pull/82)) with 5/5 Greptile confidence and 100% CI pass rates.

- [ ] **Step 3: Community Beta Deployment (`community-beta`)** 👈 **CURRENT FOCUS**
  - **Action**: Open a Pull Request from `Tunnelsats/tunnelsats-startos:main` to `Start9-Community/tunnelsats-startos:main`.
  - Merging into the fork triggers `tagAndRelease.yml`, automatically building and deploying `0.4.0:5` to `https://community-beta-registry.start9.com`.

- [ ] **Step 4: Beta Soak Period & Verification**
  - Sideload/install beta package directly from the `community-beta` registry on the live StartOS VM (`https://tunnelsats-040.local`).
  - Verify that instructions at `https://tunnelsats-040.local/services/tunnelsats/instructions` render properly with all 3-step setup flow items and Address Requirements port check guidance.
  - Verify live end-to-end inbound Lightning connectivity.

- [ ] **Step 5: Production Promotion (`community`)**
  - Notify Start9 (`submissions@start9.com` or via issue/comment on `Start9-Community/tunnelsats-startos`) giving the final go-ahead to promote the package from `community-beta` to the primary public community registry (`https://community-registry.start9.com`).

---

## 🔒 Enhancements, Dataplane & Security Track

- [x] **Issue #34: Clarify IPv6 non-support and prevent home IP leaks** ([#34](https://github.com/Tunnelsats/tunnelsats-startos/issues/34) / [PR #35](https://github.com/Tunnelsats/tunnelsats-startos/pull/35))
  - Add `allow-ipv6` toggle (`Allow Home IPv6 Coexistence`) in `configure.ts` and `config.json.ts`.
  - Filter out / reject IPv6 endpoints in `getAnnounceEndpoint` parser (`startos/dependencies.ts`).
  - Add `allow_ipv6` to `bridge.py` `/api/status` and render Option 3 Security Warning Banner in `web/index.html` and `web/script.js`.
  - Add FAQ Q9 in `web/index.html` and IPv6 privacy policy section in `instructions.md`.

- [x] **Issue #54: Address Start9 Packaging Review & Inbound Dataplane** ([#54](https://github.com/Tunnelsats/tunnelsats-startos/issues/54) / [PR #80](https://github.com/Tunnelsats/tunnelsats-startos/pull/80) / [PR #81](https://github.com/Tunnelsats/tunnelsats-startos/pull/81) / [PR #82](https://github.com/Tunnelsats/tunnelsats-startos/pull/82))
  - Support native host-managed WireGuard gateway architecture.
  - Auto-inject `# StartTunnel` and `# inbound: yes` markers under `[Interface]` in `configure` action.
  - Return copyable `ActionResultV1` guidance in `configure` modal.
  - Remove synthetic `vpn_connected` / `handshake` reporting in `bridge.py` in favor of honest subscription state.
  - Refactor `verify.sh` to eliminate Docker assumptions and dynamically audit host interfaces, port 9735 bindings, and WAN ingress.
  - Comprehensive documentation and FAQ updates explaining the Peer Interface toggle, Address Requirements "Later" bypass, and multi-node port 9735 gotchas.

- [ ] **Future Enhancement: In-App WAN Reachability Self-Test**
  - Add a dedicated "Test Inbound Connection" button inside the TunnelSats companion web dashboard (`web/index.html` / `bridge.py`).
  - Probes the live assigned public endpoint (`server.tunnelsats.com:port`) directly from the node or via an external ping service, displaying a green checkmark to provide immediate peace of mind for operators when StartOS's generic port 9735 test fails.

- [ ] **Upstream Engagement: StartOS Custom External Port Mapping RFC**
  - Submit an issue / feature proposal to `Start9Labs/startos` requesting support for custom external port mappings or test port parameters on Gateways so non-symmetric NAT port forwarding services pass the built-in reachability check.
