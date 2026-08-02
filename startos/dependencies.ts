import { sdk } from './sdk'
import { configJson } from './fileModels/config.json'
import { i18n } from './i18n'
import { customExternalHostConfig } from 'lnd-startos/startos/actions/config/customExternalHost'
import { config as clnConfigAction } from 'cln-startos/startos/actions/config/config'

export function getAnnounceEndpoint(
  wgConf: string | null | undefined,
  allowIpv6 = false,
): string | null {
  if (!wgConf) return null

  const endpointMatch = wgConf.match(/^\s*(?!#|;)\s*Endpoint\s*=\s*([^\s#]+)/im)
  if (!endpointMatch) return null
  const fullEndpoint = endpointMatch[1].trim()

  const portMatch = wgConf.match(/#\s*(?:VPNPort|Port Forwarding):\s*(\d+)/i)
  if (!portMatch) return null
  const vpnPort = portMatch[1].trim()

  let host: string

  if (fullEndpoint.startsWith('[')) {
    const closingBracket = fullEndpoint.indexOf(']')
    if (closingBracket === -1) return null
    host = fullEndpoint.substring(1, closingBracket)
    if (!allowIpv6) return null
    return `[${host}]:${vpnPort}`
  }

  const parts = fullEndpoint.split(':')
  if (parts.length > 2) {
    // Raw IPv6 address with multiple colons
    if (!allowIpv6) return null
    const rawIp = parts.slice(0, -1).join(':')
    return `[${rawIp}]:${vpnPort}`
  }

  host = parts[0]
  if (host.includes(':')) {
    if (!allowIpv6) return null
    return `[${host}]:${vpnPort}`
  }

  return `${host}:${vpnPort}`
}

export function getDependenciesForConfig(
  config: { enabled?: boolean; 'target-node'?: 'lnd' | 'cln' } | null | undefined,
) {
  if (!config?.enabled) {
    return {}
  }

  if (config['target-node'] === 'cln') {
    return {
      'c-lightning': {
        kind: 'running' as const,
        versionRange: '>=23.2.2:0',
        healthChecks: ['lightningd'],
      },
    }
  }

  return {
    lnd: {
      kind: 'running' as const,
      versionRange: '>=0.15.5:0',
      healthChecks: ['lnd'],
    },
  }
}

export const setDependencies = sdk.setupDependencies(async ({ effects }) => {
  const config = await configJson.read().const(effects)

  const announceEndpoint = getAnnounceEndpoint(
    config?.['tunnelsats-conf'],
    config?.['allow-ipv6'],
  )

  if (config?.enabled && announceEndpoint) {
    if (config['target-node'] === 'lnd') {
      await sdk.action.createTask(
        effects,
        'lnd',
        customExternalHostConfig,
        'important',
        {
          input: {
            kind: 'partial',
            accept: [{ 'custom-external-host': announceEndpoint }],
            set: { 'custom-external-host': announceEndpoint },
          },
          when: { condition: 'input-not-matches', once: false },
          reason: i18n('Advertise TunnelSats VPN endpoint to the Lightning Network'),
        },
      )
      await sdk.action.clearTask(effects, 'c-lightning:config')
    } else if (config['target-node'] === 'cln') {
      await sdk.action.createTask(
        effects,
        'c-lightning',
        clnConfigAction,
        'important',
        {
          input: {
            kind: 'partial',
            accept: [{ 'custom-external-host': announceEndpoint }],
            set: { 'custom-external-host': announceEndpoint },
          },
          when: { condition: 'input-not-matches', once: false },
          reason: i18n('Advertise TunnelSats VPN endpoint to the Lightning Network'),
        },
      )
      await sdk.action.clearTask(effects, 'lnd:custom-external-host-config')
    }
  } else {
    await sdk.action.clearTask(effects, 'lnd:custom-external-host-config')
    await sdk.action.clearTask(effects, 'c-lightning:config')
  }

  return getDependenciesForConfig(config)
})
