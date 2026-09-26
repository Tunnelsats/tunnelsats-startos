import { sdk } from '../sdk'
import { configJson } from '../fileModels/config.json'
import { tunnelsatsConf } from '../fileModels/tunnelsatsConf'
import {
  validateWireguardConfig,
  parseWireguardTunnelInfo,
  getAnnounceEndpoint,
} from '../utils'
import { i18n } from '../i18n'
import { derivePublicKey } from '../keygen'

const { InputSpec, Value } = sdk

const inputSpec = InputSpec.of({
  'target-node': Value.select({
    name: i18n('Target Lightning Node'),
    description: i18n(
      'Select which Lightning node will receive inbound connections through the VPN tunnel.',
    ),
    default: 'lnd',
    values: {
      lnd: 'LND',
      cln: 'Core Lightning',
      eclair: 'Eclair',
    },
  }),
  'tunnelsats-conf': Value.textarea({
    name: i18n('WireGuard Configuration'),
    description: i18n(
      'Paste the full contents of your TunnelSats .conf file here.',
    ),
    required: true,
    default: null,
    placeholder: `[Interface]\nPrivateKey = <your_private_key>\nAddress = 10.x.x.x/32\n# VPNPort: 12345\n...`,
  }),
  'allow-ipv6': Value.toggle({
    name: i18n('Allow Home IPv6 Coexistence'),
    description: i18n(
      'Allow announcing an IPv6 endpoint to your Lightning node if specified in your configuration. WARNING: TunnelSats VPN tunnels IPv4 traffic only. IPv6 connections bypass the VPN tunnel and expose your real home ISP IP address.',
    ),
    default: false,
  }),
})

export const importSubscription = sdk.Action.withInput(
  'import-subscription',
  {
    name: i18n('Import Subscription'),
    description: i18n(
      'Import an existing TunnelSats WireGuard configuration file (.conf) and activate it on a Lightning node.',
    ),
    warning: null,
    allowedStatuses: 'any',
    group: i18n('Subscription'),
    visibility: 'enabled',
  },
  inputSpec,
  async ({ effects }) => {
    const current = await configJson
      .read()
      .once()
      .catch(() => null)
    return {
      'target-node': current?.['target-node'] ?? 'lnd',
      'tunnelsats-conf': current?.['tunnelsats-conf'] ?? undefined,
      'allow-ipv6': current?.['allow-ipv6'] ?? false,
    }
  },
  async ({ effects, input }) => {
    const validation = validateWireguardConfig(input['tunnelsats-conf'])
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid WireGuard configuration')
    }

    const tunnelInfo = parseWireguardTunnelInfo(input['tunnelsats-conf'])
    if (!tunnelInfo.privateKey) {
      throw new Error('WireGuard configuration is missing a PrivateKey')
    }

    let publicKey = i18n('Unknown')
    try {
      publicKey = derivePublicKey(tunnelInfo.privateKey)
    } catch (e) {
      console.warn('Failed to derive public key:', e)
    }

    const announceEndpoint = getAnnounceEndpoint(
      input['tunnelsats-conf'],
      input['allow-ipv6'],
    )
    if (!announceEndpoint) {
      throw new Error(
        i18n(
          'This configuration has no endpoint that can be announced to the Lightning Network (an IPv6 endpoint needs Allow Home IPv6 Coexistence).',
        ),
      )
    }

    await configJson.merge(effects, {
      enabled: true,
      'target-node': input['target-node'],
      'tunnelsats-conf': input['tunnelsats-conf'],
      'allow-ipv6': input['allow-ipv6'],
    })
    await tunnelsatsConf.write(effects, input['tunnelsats-conf'])

    // The clearnet-vpn task (and the off-task for a previously targeted
    // node) is raised by setDependencies, which reacts to this config write.

    return {
      version: '1' as const,
      title: i18n('Subscription Imported'),
      message: i18n(
        'WireGuard configuration saved. A task has been raised on your Lightning node to activate the VPN tunnel.',
      ),
      result: {
        type: 'group' as const,
        value: [
          {
            name: i18n('Public Key'),
            description: null,
            type: 'single' as const,
            value: publicKey,
            copyable: true,
            masked: false,
            qr: false,
          },
          {
            name: i18n('Announce Endpoint'),
            description: null,
            type: 'single' as const,
            value: announceEndpoint || i18n('Not available'),
            copyable: true,
            masked: false,
            qr: false,
          },
        ],
      },
    }
  },
)
