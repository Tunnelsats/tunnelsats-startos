import { isIPv6, isIPv4 } from 'node:net'
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

  // 1. Bracketed IPv6 e.g. [2001:db8::1]:51820 or [2001:db8::1]
  if (fullEndpoint.startsWith('[')) {
    const closingBracket = fullEndpoint.indexOf(']')
    if (closingBracket === -1) return null
    const ipCandidate = fullEndpoint.substring(1, closingBracket)
    if (!isIPv6(ipCandidate)) return null
    if (!allowIpv6) return null
    return `[${ipCandidate}]:${vpnPort}`
  }

  // 2. Unbracketed IPv6 without port e.g. 2001:db8::1
  if (isIPv6(fullEndpoint)) {
    if (!allowIpv6) return null
    return `[${fullEndpoint}]:${vpnPort}`
  }

  // 3. Unbracketed IPv6 with explicit port e.g. 2001:db8::1:51820
  const lastColonIndex = fullEndpoint.lastIndexOf(':')
  if (lastColonIndex !== -1) {
    const ipCandidate = fullEndpoint.substring(0, lastColonIndex)
    const portCandidate = fullEndpoint.substring(lastColonIndex + 1)
    if (isIPv6(ipCandidate) && /^\d+$/.test(portCandidate)) {
      if (!allowIpv6) return null
      return `[${ipCandidate}]:${vpnPort}`
    }
  }

  // 4. Reject any remaining malformed IPv6 strings containing colons
  if (fullEndpoint.includes(':') && !isIPv4(fullEndpoint.split(':')[0])) {
    const parts = fullEndpoint.split(':')
    if (parts.length > 2) return null
  }

  const host = fullEndpoint.split(':')[0]
  if (!host) return null

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
