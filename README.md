# TunnelSats for StartOS

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Privacy-preserving VPN tunnel for Lightning Network nodes on [StartOS](https://start9.com). Route your clearnet traffic through TunnelSats infrastructure while keeping your real IP hidden.

## Features

- 🔒 **Hybrid Mode**: Run Tor + Clearnet simultaneously for better routing performance
- ⚡ **Lightning Optimized**: Pre-configured for LND/CLN nodes
- 🌍 **Global Infrastructure**: Multiple VPN regions available
- 🧅 **Privacy First**: No KYC, pay with Lightning

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                        StartOS                               │
│  ┌─────────────┐     ┌──────────────────────┐               │
│  │     LND     │────▶│  TunnelSats Service  │               │
│  └─────────────┘     │  ┌────────────────┐  │               │
│        │             │  │   WireGuard    │──┼──▶ Clearnet   │
│        │             │  │   (ts0)        │  │               │
│        ▼             │  ├────────────────┤  │               │
│   Tor Daemon ───────▶│  │ SOCKS5 Proxy   │  │               │
│        │             │  │ (outbound)     │  │               │
│        ▼             │  ├────────────────┤  │               │
│   Tor Network        │  │ socat          │  │               │
│                      │  │ (inbound)      │  │               │
│                      └──────────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

1. A StartOS server (v0.3.5.x or later)
2. LND or Core Lightning installed
3. A TunnelSats subscription from [tunnelsats.com](https://tunnelsats.com)

## Installation

### From StartOS Marketplace
*Coming soon*

### Sideload (Development)
1. Download the latest `.s9pk` from [Releases](https://github.com/Tunnelsats/tunnelsats-startos/releases)
2. Go to StartOS Dashboard → System → Sideload Service
3. Upload the `.s9pk` file

## Configuration

1. Purchase a subscription at [tunnelsats.com](https://tunnelsats.com)
2. Download your WireGuard configuration file
3. In StartOS, go to TunnelSats → Config
4. Paste your entire configuration file
5. Start the service

### LND Configuration

Add these settings to your LND config:

```ini
[Application Options]
externalhosts=<your-vpn-server>:<your-vpn-port>

[tor]
tor.skip-proxy-for-clearnet-targets=true
tor.streamisolation=false
```

## Building from Source

### Requirements
- Docker with buildx
- [start-sdk](https://github.com/Start9Labs/start-os/tree/master/core)
- Make

### Build
```bash
git clone https://github.com/Tunnelsats/tunnelsats-startos.git
cd tunnelsats-startos
make
```

The resulting `tunnelsats.s9pk` can be sideloaded into StartOS.

## Testing

```bash
# Run unit tests
make test

# Build and smoke test
make test-docker
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup
1. Fork the repository
2. Clone your fork
3. Create a feature branch
4. Make your changes
5. Run tests
6. Submit a pull request

## Support

- 📖 [FAQ](https://tunnelsats.com/faq)
- 💬 [Telegram](https://tunnelsats.com/join-telegram)
- 🐛 [GitHub Issues](https://github.com/Tunnelsats/tunnelsats-startos/issues)

## License

MIT License - see [LICENSE](LICENSE) for details.

---

Made with ⚡ by the [TunnelSats](https://tunnelsats.com) team
