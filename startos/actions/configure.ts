import { sdk } from '../sdk'
import { configJson } from '../fileModels/config.json'
import { tunnelsatsConf } from '../fileModels/tunnelsatsConf'
import { i18n } from '../i18n'
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
})

function validateConfig(wgConf: string) {
  if (!wgConf) return
  if (!/^\s*(?!#|;)\s*PrivateKey\s*=/im.test(wgConf)) {
    throw new Error("Missing 'PrivateKey' property.")
  }
  if (!/^\s*(?!#|;)\s*Address\s*=/im.test(wgConf)) {
    throw new Error("Missing 'Address' property.")
  }
  if (!/^\s*(?!#|;)\s*Endpoint\s*=/im.test(wgConf)) {
    throw new Error("Missing 'Endpoint' routing property.")
  }
  if (!/#\s*(?:VPNPort|Port Forwarding):\s*\d+/i.test(wgConf)) {
    throw new Error(
      'Missing port-forwarding metadata (e.g., # Port Forwarding: XXXXX).',
    )
  }
}

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
    }
  },
  async ({ effects, input }) => {
    if (input.enabled) {
      if (!input['tunnelsats-conf']) {
        throw new Error('Enabled tunnels require a WireGuard configuration')
      }
      validateConfig(input['tunnelsats-conf'])
    }

    await configJson.merge(effects, {
      enabled: input.enabled,
      'target-node': input['target-node'],
      'tunnelsats-conf': input['tunnelsats-conf'] || undefined,
    })

    if (input.enabled && input['tunnelsats-conf']) {
      await tunnelsatsConf.write(effects, input['tunnelsats-conf'])
    } else {
      const confPath = sdk.volumes.main.subpath('./tunnelsatsv3.conf')
      await rm(confPath, { force: true })
    }
  },
)
