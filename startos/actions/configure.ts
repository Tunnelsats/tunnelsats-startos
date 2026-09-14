import { sdk } from '../sdk'
import { configJson } from '../fileModels/config.json'
import { tunnelsatsConf } from '../fileModels/tunnelsatsConf'
import { i18n } from '../i18n'
import { validateWireguardConfig, ensureInboundMarker } from '../utils'
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
      "Paste the content of your TunnelSats .conf file here. Required gateway markers ('# StartTunnel' & '# inbound: yes') will be automatically added for you, and a copyable configuration will be provided on save to paste into System -> Gateways.",
    ),
    required: false,
    default: null,
    placeholder: `[Interface]\n# StartTunnel\n# inbound: yes\nPrivateKey = <your_private_key>\nAddress = 10.x.x.x/32\n# VPNPort: 12345\n...`,
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
        title: 'Configuration Saved — Next Steps',
        message:
          'TunnelSats configuration has been saved with inbound gateway markers (# StartTunnel & # inbound: yes).\n\n' +
          'Complete these remaining steps in StartOS to enable full connectivity and privacy:\n' +
          '1. System -> Gateways: If adding or updating your host VPN gateway, paste the configuration below.\n' +
          '2. Target Node Announcement: Accept the automated 1-Click Task on your StartOS dashboard (or enter Custom External Host in node config).\n' +
          '3. Target Node -> Interfaces -> Peer Interface: Toggle ON the public VPN address (<VPN_IP>:9735) to open the firewall. (When StartOS displays the "Address Requirements" modal to test port 9735, click "Later" — TunnelSats maps your dedicated external port rather than generic 9735, so generic port 9735 testing is expected to fail).\n' +
          "4. Target Node -> Actions -> Set Outbound Gateway: Select your TunnelSats gateway. (Required for Full Egress Privacy: StartOS defaults outbound traffic to Auto. Setting this action pins your node's outbound peer traffic, gossip, and ping/pong acknowledgments to the VPN tunnel, preventing residential IP leaks).\n\n" +
          '⚠️ Multi-Node Notice: The target node MUST hold internal port 9735 for TunnelSats forwarding. If another node (such as Core Lightning) was installed first, it may have claimed 9735.',
        result: {
          type: 'single' as const,
          value: processedConf,
          copyable: true,
          masked: false,
          qr: false,
        },
      }
    }

    return null
  },
)
