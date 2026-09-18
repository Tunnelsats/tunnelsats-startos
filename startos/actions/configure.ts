import { sdk } from '../sdk'
import { configJson } from '../fileModels/config.json'
import { tunnelsatsConf } from '../fileModels/tunnelsatsConf'
import { validateWireguardConfig, ensureInboundMarker } from '../utils'
import { i18n } from '../i18n'
import { rm } from 'node:fs/promises'

const { InputSpec, Value } = sdk

export const inputSpec = InputSpec.of({
  enabled: Value.toggle({
    name: i18n('Enable TunnelSats'),
    description: i18n(
      'Enable subscription monitoring and automated external host announcement for TunnelSats.',
    ),
    default: false,
  }),
  'target-node': Value.select({
    name: i18n('Target Lightning Node'),
    description: i18n(
      'Select which Lightning service on your StartOS server will receive inbound connections.',
    ),
    default: 'lnd',
    values: {
      lnd: 'LND (lnd.embassy)',
      cln: 'Core Lightning (c-lightning.embassy)',
    },
  }),
  'tunnelsats-conf': Value.textarea({
    name: i18n('WireGuard Configuration'),
    description: i18n('Paste the content of your TunnelSats .conf file here.'),
    required: false,
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

export const configure = sdk.Action.withInput(
  'configure',
  {
    name: i18n('Configure'),
    description: i18n('Adjust TunnelSats settings and WireGuard configuration'),
    warning: null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  },
  inputSpec,
  async ({ effects }) => {
    const current = await configJson.read().once()
    return {
      enabled: current?.enabled ?? false,
      'target-node': current?.['target-node'] ?? 'lnd',
      'tunnelsats-conf': current?.['tunnelsats-conf'] ?? null,
      'allow-ipv6': current?.['allow-ipv6'] ?? false,
    }
  },
  async ({ effects, input }) => {
    let processedConf = input['tunnelsats-conf']?.trim()
      ? input['tunnelsats-conf']
      : undefined
    if (input.enabled && !processedConf) {
      throw new Error('Enabled tunnels require a WireGuard configuration')
    }

    if (processedConf) {
      const validation = validateWireguardConfig(processedConf)
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid WireGuard configuration')
      }
      processedConf = ensureInboundMarker(processedConf)
    }

    await configJson.merge(effects, {
      enabled: input.enabled,
      'target-node': input['target-node'],
      'tunnelsats-conf': processedConf || undefined,
      'allow-ipv6': input['allow-ipv6'],
    })

    if (input.enabled && processedConf) {
      await tunnelsatsConf.write(effects, processedConf)
    } else {
      const confPath = sdk.volumes.main.subpath('./tunnelsatsv3.conf')
      await rm(confPath, { force: true })
    }

    if (processedConf) {
      return {
        version: '1' as const,
        title: i18n('Configuration Saved'),
        message: i18n(
          "Add this as a new gateway under System → Gateways (delete any existing TunnelSats gateway first). Then open your node's Peer interface to enable the address and assign the Outbound Gateway (see Instructions).",
        ),
        result: {
          type: 'single' as const,
          value: processedConf,
          copyable: true,
          masked: true,
          qr: false,
        },
      }
    }

    return null
  },
)
