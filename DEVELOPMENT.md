# Developing TunnelSats for StartOS

This document details the development workflow, architecture, testing procedures, and release processes for developers contributing to the TunnelSats StartOS package.

---

## 🏗 Package Architecture (StartOS 0.4.0 TypeScript SDK)

TunnelSats is built using the StartOS 0.4.0 TypeScript SDK (`@start9labs/start-sdk` 2.0.9).

### Core Components (`startos/`)

- **`startos/manifest/index.ts`**: Defines package identity, versioning, container images, volume mounts, and dynamic dependencies.
- **`startos/main.ts`**: Sets up the primary daemon, readiness probes for the Web Dashboard on port 80, and registers background health checks (`vpn-connected`).
- **`startos/actions/configure.ts`**: Strongly-typed UI configuration action where users input WireGuard configs, choose their target Lightning node (`lnd` vs `cln`), and configure IPv6 coexistence settings.
- **`startos/dependencies.ts`**: Dynamic dependency management and automated 1-Click UI Task generation for target node external host announcements.
- **`bridge.py`**: Python orchestrator managing the Web Dashboard, `/api/status`, `/api/properties`, and live network transport probes.
- **`verify.sh`**: Standalone diagnostic script auditing container namespace routing, IPv6 leak prevention, Tor coexistence, and node announcement alignment.

---

## 🛠 Local Development & Testing

### Prerequisites
- **Node.js**: v22.x / npm v10+
- **Python**: v3.11+
- **StartOS CLI**: `start-cli 1.0.1+` (from [Start9 Technologies Releases](https://github.com/Start9Labs/start-technologies/releases))
- **Docker**: For multi-arch package compilation (`docker buildx`)

### Running the Test Suites

```bash
# 1. TypeScript Unit Tests (TSX / Node test runner)
npm test

# 2. TypeScript Typecheck
npm run check

# 3. Python Unit Tests (unittest)
python3 -m unittest discover -s tests -p "test_*.py"

# 4. BATS Diagnostic & Config Tests
npx -y bats tests/*.bats
```

### Compiling & Packaging `.s9pk`

```bash
# Build the TypeScript JavaScript bundle
npm run build

# Pack for x86_64 architecture
make arch/x86_64

# Pack for aarch64 (ARM64) architecture
make arch/aarch64
```

### Sideloading into a Local StartOS 0.4.0 Node

```bash
# Sideload package via deploy script
./deploy-sideload.sh

# Inspect live container logs
ssh start9@<startos_ip> "start-cli package logs tunnelsats"

# Run diagnostic verification
ssh start9@<startos_ip> "start-cli package attach tunnelsats /app/verify.sh"
```

---

## 🔒 Security & Privacy Guidelines

1. **Zero Secret Leaks**: Test fixtures and code examples must strictly use dummy test keys (`DUMMY_TEST_PRIVATE_KEY_...`). Active WireGuard private keys and residential IP addresses must never be committed or logged.
2. **Zero Dependencies on Host Sudo / Userspace SOCKS Proxies**: All inbound forwarding is handled cleanly through StartOS kernel WireGuard interfaces.
3. **IPv6 Leak Protection**: Ensure IPv6 WAN routes remain blocked or unadvertised unless the user explicitly opts into dual-stack coexistence.
