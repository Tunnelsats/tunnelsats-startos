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

- [ ] **Issue #34: Clarify IPv6 non-support and prevent home IP leaks** ([#34](https://github.com/Tunnelsats/tunnelsats-startos/issues/34))
  - Update `getAnnounceEndpoint` parser in `startos/dependencies.ts` to reject/filter out IPv6 addresses.
  - Add FAQ Q9 in `web/index.html` explicitly documenting IPv6 non-support and warning against advertising IPv6 addresses in node settings.
  - Update `instructions.md` and `README.md` to document IPv4-only tunneling policy.
