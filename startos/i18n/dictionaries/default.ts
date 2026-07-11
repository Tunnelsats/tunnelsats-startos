export const DEFAULT_LANG = 'en_US'

const dict = {
  'Starting TunnelSats!': 0,
  'Enable TunnelSats': 1,
  'Turn the TunnelSats VPN tunnel On or Off.': 2,
  'Target Lightning Node': 3,
  'Select which Lightning service on your StartOS server will receive inbound connections.': 4,
  'WireGuard Configuration': 5,
  "Paste the content of your TunnelSats .conf file here. Ensure it includes the '# VPNPort: XXXXX' metadata comment for automatic port-forwarding.": 6,
  Configure: 7,
  'Adjust TunnelSats settings and WireGuard configuration': 8,
  'Web Dashboard': 9,
  'TunnelSats Web Dashboard, connection properties, and setup instructions.': 10,
  'SOCKS5 Proxy': 11,
  'Internal SOCKS5 proxy interface for Lightning Node routing.': 12,
  'VPN Connectivity': 13,
  'TunnelSats is disabled. Enable it in configuration.': 14,
  'SOCKS5 proxy is listening for connections': 15,
  'SOCKS5 proxy is not listening': 16,
  'TunnelSats is disabled.': 17,
  'VPN disconnected': 18,
  'Failed to parse health check result': 19,
  'Proxy not ready': 20,
} as const

/**
 * Plumbing. DO NOT EDIT.
 */
export type I18nKey = keyof typeof dict
export type LangDict = Record<(typeof dict)[I18nKey], string>
export default dict
