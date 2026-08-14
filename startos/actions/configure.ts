import { sdk } from '../sdk'
import { configJson } from '../fileModels/config.json'
import { tunnelsatsConf } from '../fileModels/tunnelsatsConf'
import { i18n } from '../i18n'
import { validateWireguardConfig } from '../utils'
import { rm } from 'node:fs/promises'

const { InputSpec, Value } = sdk

export const inputSpec = InputSpec.of({
  enabled: Value.toggle({
    name: i18n('Enable TunnelSats'),
    description: i18n('Turn the TunnelSats VPN tunnel On or Off.'),
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
    description: i18n(
      "Paste the content of your TunnelSats .conf file here. Ensure it includes the '# VPNPort: XXXXX' metadata comment for automatic port-forwarding.",
    ),
    required: false,
    default: null,
    placeholder: `[Interface]\nPrivateKey = <your_private_key>\nAddress = 10.x.x.x/32\n# VPNPort: 12345\n...`,
  }),
  'allow-ipv6': Value.toggle({
    name: i18n('Allow Home IPv6 Coexistence'),
    description: i18n(
      'Allow advertising raw IPv6 addresses on your node. WARNING: TunnelSats VPN tunnels IPv4 traffic only. IPv6 connections bypass the VPN tunnel and expose your real home ISP IP address.',
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
    if (input.enabled) {
      if (!input['tunnelsats-conf']) {
        throw new Error('Enabled tunnels require a WireGuard configuration')
      }
      const validation = validateWireguardConfig(input['tunnelsats-conf'])
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid WireGuard configuration')
      }
    }

    await configJson.merge(effects, {
      enabled: input.enabled,
      'target-node': input['target-node'],
      'tunnelsats-conf': input['tunnelsats-conf'] || undefined,
      'allow-ipv6': input['allow-ipv6'],
    })

    if (input.enabled && input['tunnelsats-conf']) {
      await tunnelsatsConf.write(effects, input['tunnelsats-conf'])
    } else {
      const confPath = sdk.volumes.main.subpath('./tunnelsatsv3.conf')
      await rm(confPath, { force: true })
    }
  },
)
