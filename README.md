<img src="https://raw.githubusercontent.com/Tunnelsats/tunnelsats/ffb4732328045922dc90eb5580654077e8d3f246/images/brand/logos/ts_logo_rectangle.svg" alt="TunnelSats Logo" width="400"/>

<br/>

<div align="center">
  <img src="https://img.shields.io/badge/Status-Under%20Architectural%20Rework-critical?style=flat-square" alt="Status"/>
  <img src="https://img.shields.io/github/license/Tunnelsats/tunnelsats-startos?style=flat-square&color=blue" alt="License"/>
  <a href="https://tunnelsats.com/join-telegram"><img src="https://img.shields.io/badge/Telegram-Join%20Community-blue?style=flat-square&logo=telegram" alt="Telegram"/></a>
</div>

<br/>

> [!CAUTION]
> # ⚠️ EXPERIMENTAL — NOT PRODUCTION READY / NOT FOR PRIVACY USE
> **DO NOT USE THIS PACKAGE ON A PRODUCTION LIGHTNING NODE.**
> 
> Following our intake review with the Start9 core team ([Issue #54](https://github.com/Tunnelsats/tunnelsats-startos/issues/54)), this repository is currently under **active architectural overhaul**:
> - **No Active VPN Dataplane**: The current package does **not** establish a kernel WireGuard tunnel and does **not** route Lightning traffic.
> - **Privacy Hazard**: Outbound Lightning connections and ping-pong acknowledgments will originate from your residential ISP IP, completely exposing your home IP address and location to peers.
> - **Releases Pulled**: All pre-release binaries (`v0.4.0-beta1` through `v0.4.0-beta4`) have been **retracted and deleted**.
> 
> Track progress on the remediation plan and architectural discussions in [Issue #54](https://github.com/Tunnelsats/tunnelsats-startos/issues/54) and the [Phase 1–6 Tracking Issues](https://github.com/Tunnelsats/tunnelsats-startos/issues/58).

---

# TunnelSats for StartOS (Under Construction)

This repository contains the packaging source for [TunnelSats](https://tunnelsats.com/) on **[StartOS 0.4.0+](https://start9.com)** using `@start9labs/start-sdk`.

## 🚧 Status & Remediation Roadmap

The package is being redesigned to operate within the StartOS 0.4.0 LXC subcontainer security model:

1. **Phase 1 (Dataplane)**: Implement in-container WireGuard via `virtualNetworking: true` and `wg-quick` ([#58](https://github.com/Tunnelsats/tunnelsats-startos/issues/58)).
2. **Phase 2 (Health Checks)**: Implement fail-closed health checks based on `wg show` interface and handshake queries ([#59](https://github.com/Tunnelsats/tunnelsats-startos/issues/59)).
3. **Phase 3 (1-Click Gating)**: Gate `custom-external-host` advertisement tasks strictly behind verified tunnel connectivity ([#60](https://github.com/Tunnelsats/tunnelsats-startos/issues/60)).
4. **Phase 4 (Cleanup)**: Remove legacy StartOS 0.3.x carry-over, dead proxy code, and normalize User-Agent strings ([#61](https://github.com/Tunnelsats/tunnelsats-startos/issues/61)).
5. **Phase 5 (Docs Alignment)**: Standardize documentation to adhere to Start9 packaging guidelines ([#62](https://github.com/Tunnelsats/tunnelsats-startos/issues/62)).
6. **Phase 6 (CI / Pipeline)**: Adopt Start9 shared reusable workflows ([#63](https://github.com/Tunnelsats/tunnelsats-startos/issues/63)).

For questions and technical discussions, see [Issue #54](https://github.com/Tunnelsats/tunnelsats-startos/issues/54).

---

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
