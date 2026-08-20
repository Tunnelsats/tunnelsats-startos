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
  'TunnelSats is disabled.': 11,
  'Subscription verification failed': 12,
  'Failed to parse health check result': 13,
  'Advertise TunnelSats VPN endpoint to the Lightning Network': 14,
  'Allow Home IPv6 Coexistence': 15,
  'Allow advertising raw IPv6 addresses on your node. WARNING: TunnelSats VPN tunnels IPv4 traffic only. IPv6 connections bypass the VPN tunnel and expose your real home ISP IP address.': 16,
  'Web Dashboard is accessible': 17,
  'Web Dashboard is not accessible': 18,
  'Subscription Status': 19,
  'Subscription is active': 20,
} as const

/**
 * Plumbing. DO NOT EDIT.
 */
export type I18nKey = keyof typeof dict
export type LangDict = Record<(typeof dict)[I18nKey], string>
export default dict
