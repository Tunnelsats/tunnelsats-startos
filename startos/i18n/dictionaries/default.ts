export const DEFAULT_LANG = 'en_US'

const dict = {
  'Starting TunnelSats!': 0,
  'Enable TunnelSats': 1,
  'Enable subscription monitoring and automated external host announcement for TunnelSats.': 2,
  'Target Lightning Node': 3,
  'Select which Lightning service on your StartOS server will receive inbound connections.': 4,
  'WireGuard Configuration': 5,
  "Paste the content of your TunnelSats .conf file here. Required gateway markers ('# StartTunnel' & '# inbound: yes') will be automatically added for you, and a copyable configuration will be provided on save to paste into System -> Gateways.": 6,
  Configure: 7,
  'Adjust TunnelSats settings and WireGuard configuration': 8,
  'Web Dashboard': 9,
  'TunnelSats Web Dashboard, connection properties, and setup instructions.': 10,
  'TunnelSats is disabled.': 11,
  'Subscription verification failed': 12,
  'Failed to parse health check result': 13,
  'Advertise TunnelSats VPN endpoint to the Lightning Network': 14,
  'Allow Home IPv6 Coexistence': 15,
  'Allow announcing an IPv6 TunnelSats endpoint to your Lightning node if specified in your configuration. (TunnelSats provides IPv4 tunneling; leave disabled unless using an IPv6 tunnel endpoint).': 16,
  'Web Dashboard is accessible': 17,
  'Web Dashboard is not accessible': 18,
  'Subscription Status': 19,
  'Subscription is active': 20,
  'TunnelSats WireGuard subscription has expired. Paste a renewed configuration in settings to restore inbound connectivity.': 21,
  'TunnelSats subscription expires in <= 3 days. Renew subscription to avoid connection disruption.': 22,
  'TunnelSats subscription expires in <= 7 days. Plan your renewal to maintain uptime.': 23,
  'Configuration Saved': 24,
  "Add this as a new gateway under System → Gateways (delete any existing TunnelSats gateway first). Then open your node's Peer interface to enable the address and assign the Outbound Gateway (see Instructions).": 25,
} as const

/**
 * Plumbing. DO NOT EDIT.
 */
export type I18nKey = keyof typeof dict
export type LangDict = Record<(typeof dict)[I18nKey], string>
export default dict
