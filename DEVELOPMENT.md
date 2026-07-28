# Developing TunnelSats for StartOS

This document details the development workflow, architecture, testing procedures, and release processes for developers contributing to the TunnelSats StartOS package.

---

## 🔀 Branching Strategy

- **`main`**: Maintained strictly for StartOS 0.3.5.x compatibility (uses `manifest.yaml` and legacy 0.3.x build specifications).
- **`feat/startos-0.4.0`**: Active development branch for **StartOS 0.4.0+** using the modern StartOS TypeScript SDK (`@start9labs/start-sdk`).

All new StartOS 0.4.0 features, fixes, and SDK enhancements must be submitted against `feat/startos-0.4.0`.

---

## 🏗 Package Architecture (StartOS 0.4.0 TypeScript SDK)

TunnelSats runs as an unprivileged, userspace WireGuard tunneling service (`wireproxy`) inside StartOS's container sandbox. 

```
┌─────────────────────────────────────────────────────────────┐
│                        StartOS 0.4.0                        │
│  ┌─────────────┐     ┌──────────────────────┐               │
│  │  LND / CLN  │────▶│  TunnelSats Service  │               │
│  └─────────────┘     │  (SubContainer: main)│               │
│        │             │  ┌────────────────┐  │               │
│        │             │  │   wireproxy    │──┼──▶ Clearnet   │
│        ▼             │  │  (userspace)   │  │ (VPN Server)  │
│   Tor Daemon ───────▶│  ├────────────────┤  │               │
│   (optional)         │  │ SOCKS5 Proxy   │  │               │
│                      │  │ (port 1080)    │  │               │
│                      │  ├────────────────┤  │               │
│                      │  │ Inbound Port   │  │               │
│                      │  │ (port 9735)    │  │               │
│                      └──────────────────────┘               │
│                                  │                          │
│                                  ▼                          │
│                      (forward P2P to port 9735)             │
└─────────────────────────────────────────────────────────────┘
```

### Key SDK Directory Structure (`startos/`)

- **`startos/manifest/index.ts`**: Defines package identity, title, icons (`icon.svg`), storage volumes (`main`), OCI build specs, and dependency metadata for `lnd` and `c-lightning`.
- **`startos/main.ts`**: The main entry point. Sets up the primary subcontainer named `'main'`, manages environment variables reactively, launches the container daemon (`/app/docker_entrypoint.sh`), and registers health checks (`vpn-connected` and `proxy-ready`).
- **`startos/actions/configure.ts`**: Configures the UI Action form where users upload their TunnelSats WireGuard `.conf` file, choose their Target Lightning Node (`lnd` vs `cln`), and enable/disable the service.
- **`startos/fileModels/`**: Reactive file models (`config.json.ts`, `tunnelsatsConf.ts`) for strongly-typed reading and writing of service configuration files.
- **`startos/dependencies.ts`**: Dynamically enforces dependency requirements based on user selection (requires `lnd` or `c-lightning` to be running).
- **`startos/versions/`**: Package upgrade and migration graph (`current.ts`).

---

## 🛠 Local Development & Tooling Setup

### Prerequisites
- **Node.js**: v22.x
- **npm**: v10.x+
- **Python**: v3.11+
- **BATS**: Automated bash testing framework
- **`start-cli`**: Version 1.0.1 or higher (from [Start9 Technologies Releases](https://github.com/Start9Labs/start-technologies/releases))
- **Docker**: with Buildx support

### Installation & Initialization
1. Clone the repository and checkout the 0.4.0 development branch:
   ```bash
   git clone https://github.com/Tunnelsats/tunnelsats-startos.git
   cd tunnelsats-startos
   git checkout feat/startos-0.4.0
   ```
2. Install Node dependencies:
   ```bash
   npm install
   ```

---

## 🧪 Testing & Verification

### 1. TypeScript Static Analysis
Verify that all TypeScript code in `startos/` compiles cleanly without errors:
```bash
npm run check
```

### 2. Python Unit Tests
Run the unit test suite verifying configuration generation and bridge orchestrator logic:
```bash
python3 -m unittest discover -s tests -p "test_*.py"
```

### 3. BATS Integration Tests
Execute shell integration tests:
```bash
bats tests/
```

### 4. Code Formatting & Pre-commit Hooks
Format code with Prettier:
```bash
npm run prettier
```

---

## 📦 Building the `.s9pk` Package

### 1. Compile JavaScript Bundle
Build the bundled JavaScript file (`javascript/index.js`) from TypeScript source:
```bash
npm run build
```

### 2. Build `.s9pk` Binaries
Use `make` to compile the final StartOS package bundle. This executes a multi-stage Docker build for `wireproxy` and bundles the filesystem using `start-cli`:

- **For x86_64 architecture:**
  ```bash
  make arch/x86_64
  ```
- **For ARM64 (aarch64) architecture:**
  ```bash
  make arch/aarch64
  ```
- **Build all architectures:**
  ```bash
  make
  ```

---

## 🔍 Inspecting & Testing a Running Install

To interact with a running TunnelSats installation on a StartOS 0.4.x server, use `start-cli package attach`.

> [!IMPORTANT]
> Always specify the subcontainer name using `-n main` (matching `SubContainer.of(..., 'main')` in `startos/main.ts`).

### 1. Run Container Verification Diagnostics
Execute the bundled diagnostic script inside the subcontainer:
```bash
start-cli package attach tunnelsats -n main -- /app/verify.sh
```

### 2. Verify Outbound SOCKS5 Proxy Alignment
Confirm that outbound traffic through the local SOCKS5 proxy exits via your assigned TunnelSats VPN IP:
```bash
start-cli package attach tunnelsats -n main -- curl -s --socks5-hostname 127.0.0.1:1080 https://ipinfo.io/ip
```

### 3. Check Internal Lightning Node Connectivity
Test whether the container can resolve and connect to the target Lightning node on port 9735:
```bash
start-cli package attach tunnelsats -n main -- python3 bridge.py status
```

---

## 🚀 CI/CD Pipeline & Releases

Automated workflows are located in `.github/workflows/`:

- **`build.yml`**: Triggered on pushes to `main`, `develop`, and `feat/startos-0.4.0` (and PRs). Runs Python tests, BATS tests, compiles TypeScript, and builds `.s9pk` packages for both `x86_64` and `aarch64`.
- **`release.yml`**: Triggered on `v*` tags. Runs tests, compiles release binaries, inspects StartOS package commitment signatures (`rootSighash`), generates SHA256 checksums, and publishes a draft GitHub Release.
