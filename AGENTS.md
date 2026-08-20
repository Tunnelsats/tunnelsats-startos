# Agent & Developer Guidelines for TunnelSats StartOS

This document defines architecture, conventions, testing, and contribution standards for developers and AI agents working on the TunnelSats StartOS package.

## Architecture Overview

- **Host-Managed Privacy & Gateway Model**: Under StartOS 0.4.0, kernel WireGuard interfaces and policy routing tables are managed at the host OS level under **System > Gateways**. Lightning services (LND / Core Lightning) route outbound traffic via host policy routing.
- **Companion Package**: The `tunnelsats` container runs as a companion service providing:
  - Web UI Dashboard on port 80 (monitoring subscription status and connection properties).
  - Background daemon (`subscription_sync_loop`) synchronizing metadata from `https://tunnelsats.com/api/public/v1/subscription/status`.
  - StartOS 0.4.0 Actions & Tasks (`sdk.action.createTask`, `sdk.action.createOwnTask`, `sdk.action.clearTask`) for automated node announcement and subscription renewal alerts.
  - Fail-closed health checks monitoring subscription validity.

## Project Structure

```
├── startos/                # StartOS TypeScript SDK package definition
│   ├── actions/            # User-facing StartOS actions (configure)
│   ├── fileModels/         # Typed filesystem bindings (config.json, tunnelsatsConf, tunnelsatsMeta)
│   ├── i18n/               # Multi-language dictionaries (en_US, es_ES, de_DE, pl_PL, fr_FR)
│   ├── manifest/           # Package metadata, icons, and descriptions
│   ├── versions/           # Version graph and migration history
│   ├── dependencies.ts     # Dynamic dependency and task management
│   ├── interfaces.ts       # Service interface bindings
│   ├── main.ts             # Service process and health check definitions
│   └── utils.ts            # WireGuard parsing and validation utilities
├── web/                    # Dashboard UI (HTML, CSS, Vanilla JS)
├── tests/                  # Unit and integration test suites
├── bridge.py               # Python service bridge, telemetry sync daemon, and HTTP server
└── docker_entrypoint.sh    # Container entrypoint
```

## Development & Test Commands

```bash
# Run complete test suite (TypeScript, Python, BATS)
npm run test:all

# TypeScript typecheck
npm run check

# Bundle JavaScript package
npm run build

# Python unit tests
python3 -m unittest discover -s tests -p 'test_*.py'

# BATS integration tests
npm run test:bats
```

## Coding & Security Standards

- **Zero Mocked Dataplanes**: Never mock or stub network dataplanes. Health checks and telemetry must be honest and fail-closed.
- **Outbound Disclosure**: Explicitly document outbound network calls to `https://tunnelsats.com/api/public/v1/subscription/status` for subscription telemetry.
- **Commit Conventions**: Use Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`).
