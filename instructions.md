# TunnelSats for StartOS

Privacy-preserving VPN tunnel for Lightning Network nodes. Route your clearnet traffic through TunnelSats infrastructure while keeping your real IP hidden.

## Quick Start

### 1. Get a Subscription

1. Visit [tunnelsats.com](https://tunnelsats.com)
2. Select a server region close to you
3. Choose subscription duration (1-12 months)
4. Pay with Lightning ⚡
5. Download your WireGuard configuration file

### 2. Configure TunnelSats

1. Go to TunnelSats → Config in your StartOS dashboard
2. Paste your **entire** configuration file (including comments)
3. Save configuration
4. Start the service

### 3. Configure LND

Add these settings to your LND configuration:

```ini
[Application Options]
externalhosts=YOUR_SERVER.tunnelsats.com:YOUR_PORT

[tor]
tor.skip-proxy-for-clearnet-targets=true
tor.streamisolation=false
```

Replace:
- `YOUR_SERVER` with your server (e.g., `us3`)
- `YOUR_PORT` with your Port Forwarding number from the config

**Restart LND** after making these changes.

## Verifying Your Connection

Once running, check the health status in your StartOS dashboard. A healthy connection shows:
- ✓ VPN Connection: "Connected to TunnelSats VPN"
- Your exit IP (different from your home IP)

## Renewing Your Subscription

1. Go to [tunnelsats.com](https://tunnelsats.com) → Renew Subscription
2. Enter your public key (shown in your config as `# myPubKey:`)
3. Select extension duration
4. Pay the invoice

No reconfiguration needed - your existing config remains valid!

## Troubleshooting

### Service won't start
- Verify your configuration was pasted correctly
- Check all fields are present (PrivateKey, PublicKey, Endpoint, etc.)

### Health check failing
- Ensure your subscription hasn't expired
- Check the Valid Until date in your config
- Try restarting the service

### LND not using clearnet
- Verify LND config has `externalhosts` set correctly
- Ensure `tor.skip-proxy-for-clearnet-targets=true` is set
- Restart LND after config changes

## Support

- 📖 [FAQ](https://tunnelsats.com/faq)
- 💬 [Telegram](https://t.me/tunnelsats)
- 🐛 [GitHub Issues](https://github.com/Tunnelsats/tunnelsats-startos/issues)
