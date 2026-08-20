# Developing TunnelSats for StartOS

This document details the development workflow, architecture, testing procedures, and release processes for developers contributing to the TunnelSats StartOS package.

---

## 🏗 Package Architecture (StartOS TypeScript SDK)

TunnelSats is built using the StartOS TypeScript SDK (`@start9labs/start-sdk`).

### Core Components (`startos/`)

- **`startos/manifest/index.ts`**: Defines package identity, container images, volume mounts, and dynamic dependencies.
- **`startos/main.ts`**: Sets up the primary daemon, readiness probes for the Web Dashboard on port 80, and registers background subscription health checks.
- **`startos/actions/configure.ts`**: Strongly-typed UI configuration action where users input WireGuard configs, choose their target Lightning node (`lnd` vs `cln`), and configure IPv6 coexistence settings.
- **`startos/dependencies.ts`**: Dynamic dependency management and automated 1-Click UI Task generation for target node external host announcements and subscription expiry alerts.
- **`bridge.py`**: Python orchestrator managing the Web Dashboard, `/api/status`, `/api/properties`, and telemetry synchronization.
- **`verify.sh`**: Standalone diagnostic script auditing container namespace routing, IPv6 leak prevention, Tor coexistence, and node announcement alignment.

---

## 🛠 Local Development & Testing

### Prerequisites
- **Node.js**: v22.x / npm v10+
- **Python**: v3.11+
- **StartOS CLI**: `start-cli` (from [Start9 Technologies Releases](https://github.com/Start9Labs/start-technologies/releases))
- **Docker**: For multi-arch package compilation (`docker buildx`)

### Running the Test Suites

```bash
# 1. Complete Test Suite (TypeScript, Python, BATS)
npm run test:all

# 2. TypeScript Typecheck
npm run check

# 3. TypeScript Build
npm run build

# 4. Python Unit Tests (unittest)
python3 -m unittest discover -s tests -p "test_*.py"

# 5. BATS Diagnostic & Config Tests
npm run test:bats
```

---

## 🔒 Security & Privacy Guidelines

1. **Zero Secret Leaks**: Test fixtures and code examples must strictly use dummy test keys (`DUMMY_TEST_PRIVATE_KEY_...`). Active WireGuard private keys and residential IP addresses must never be committed or logged.
2. **Fail-Closed Verification**: Health checks and status probes must fail closed on unverified network state.
3. **IPv6 Leak Protection**: Ensure IPv6 WAN routes remain blocked or unadvertised unless the user explicitly opts into dual-stack coexistence.
