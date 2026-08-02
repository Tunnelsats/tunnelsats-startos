# TunnelSats StartOS Package — Marketplace Submission Roadmap

## 🚀 Marketplace Submission Pipeline (Start9 Community Registry)

- [ ] **Step 1: Initial Submission Email**
  - Send email to `submissions@start9.com` requesting inclusion in the Start9 Community Registry.
  - Repository: `https://github.com/Tunnelsats/tunnelsats-startos`
  - Release Tag: `v0.4.0-beta2`

- [ ] **Step 2: Start9 Fork & Feedback**
  - Await Start9 fork creation at `https://github.com/Start9-Community/tunnelsats-startos`.
  - Address any initial code review feedback from Start9 packaging engineers.

- [ ] **Step 3: Community Beta Deployment (`community-beta`)**
  - Open PR against the `Start9-Community/tunnelsats-startos` fork for future updates.
  - Merging into the fork automatically builds and deploys to `https://community-beta-registry.start9.com`.

- [ ] **Step 4: Beta Soak Period & Verification**
  - Test beta package directly from `community-beta` registry on StartOS 0.4.0+ devices.

- [ ] **Step 5: Production Promotion (`community`)**
  - Email `submissions@start9.com` or open issue on fork giving final go-ahead to promote to `https://community-registry.start9.com`.

---

## 🔒 Pending Enhancements & Security Fixes

- [x] **Issue #34: Clarify IPv6 non-support and prevent home IP leaks** ([#34](https://github.com/Tunnelsats/tunnelsats-startos/issues/34) / [PR #35](https://github.com/Tunnelsats/tunnelsats-startos/pull/35))
  - Add `allow-ipv6` toggle (`Allow Home IPv6 Coexistence`) in `configure.ts` and `config.json.ts`.
  - Filter out / reject IPv6 endpoints in `getAnnounceEndpoint` parser (`startos/dependencies.ts`).
  - Add `allow_ipv6` to `bridge.py` `/api/status` and render Option 3 Security Warning Banner in `web/index.html` and `web/script.js`.
  - Add FAQ Q9 in `web/index.html` and IPv6 privacy policy section in `instructions.md`.
