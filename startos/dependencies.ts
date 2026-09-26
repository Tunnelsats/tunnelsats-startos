import { sdk } from './sdk'
import { configJson } from './fileModels/config.json'
import { tunnelsatsMeta } from './fileModels/tunnelsatsMeta'
import { i18n } from './i18n'
import { getAnnounceEndpoint } from './utils'
export { getAnnounceEndpoint } from './utils'
import { importSubscription } from './actions/importSubscription'
import { clearnetVpn as lndClearnetVpn } from 'lnd-startos/startos/actions/clearnetVpn'
import { clearnetVpn as clnClearnetVpn } from 'cln-startos/startos/actions/clearnetVpn'
import { clearnetVpn as eclairClearnetVpn } from 'eclair-startos/startos/actions/clearnetVpn'

export type TargetNode = 'lnd' | 'cln' | 'eclair'
export type PackageId = 'lnd' | 'c-lightning' | 'eclair'

/** All three clearnet-vpn actions share the same input shape */
const clearnetVpnActions = {
  lnd: { packageId: 'lnd' as PackageId, action: lndClearnetVpn },
  'c-lightning': {
    packageId: 'c-lightning' as PackageId,
    action: clnClearnetVpn,
  },
  eclair: { packageId: 'eclair' as PackageId, action: eclairClearnetVpn },
}

/** All possible clearnet-vpn task keys that we might create, used for cleanup */
const ALL_CLEARNET_VPN_TASK_KEYS = [
  'lnd:clearnet-vpn',
  'c-lightning:clearnet-vpn',
  'eclair:clearnet-vpn',
]

export interface TargetVpnConfig {
  targetPackage: PackageId
  clearPackages: PackageId[]
  announceEndpoint: string | null
  wgConf: string
}

export interface SubscriptionMeta {
  expiresAt?: string
  lastSync?: string
  syncSuccess?: boolean
  syncError?: string | null
  serverDomain?: string
  vpnPort?: number
  bandwidth_used_gb?: number
}

export interface SubscriptionExpiryTask {
  shouldCreateTask: boolean
  severity?: 'critical' | 'important'
  reason?: string
  clearTaskKey: string
}

/**
 * Maps a config target-node value to the StartOS package ID.
 */
export function resolvePackageId(targetNode: TargetNode): PackageId {
  switch (targetNode) {
    case 'cln':
      return 'c-lightning'
    case 'eclair':
      return 'eclair'
    case 'lnd':
    default:
      return 'lnd'
  }
}

/**
 * Returns all package IDs except the active one (for clearing stale tasks).
 */
export function getInactivePackageIds(active: PackageId): PackageId[] {
  return (['lnd', 'c-lightning', 'eclair'] as PackageId[]).filter(
    (id) => id !== active,
  )
}

export function getTargetVpnConfig(
  config:
    | {
        enabled?: boolean
        'target-node'?: TargetNode
        'tunnelsats-conf'?: string | null
        'allow-ipv6'?: boolean
      }
    | null
    | undefined,
): TargetVpnConfig | null {
  if (!config?.enabled || !config['tunnelsats-conf']) return null

  const targetPackage = resolvePackageId(config['target-node'] ?? 'lnd')
  const clearPackages = getInactivePackageIds(targetPackage)
  const announceEndpoint = getAnnounceEndpoint(
    config['tunnelsats-conf'],
    config['allow-ipv6'],
  )

  return {
    targetPackage,
    clearPackages,
    announceEndpoint,
    wgConf: config['tunnelsats-conf'],
  }
}

/** Compatibility shim for legacy gateway routing tests */
export function getTargetGatewayConfig(config: any) {
  const vpn = getTargetVpnConfig(config)
  if (!vpn) return null
  return {
    targetPackage: vpn.targetPackage,
    clearPackage: vpn.clearPackages[0],
    gatewayName: 'tunnelsats',
    announceEndpoint: vpn.announceEndpoint,
  }
}

/** Compatibility shim for legacy gateway task details */
export function getGatewayTaskDetails(
  targetPackage: 'lnd' | 'c-lightning',
  announceEndpoint: string,
) {
  const isLnd = targetPackage === 'lnd'
  return {
    targetPackage,
    clearTaskKey: isLnd
      ? 'c-lightning:config'
      : 'lnd:custom-external-host-config',
    reason: i18n('Advertise TunnelSats VPN endpoint to the Lightning Network'),
    input: {
      kind: 'partial' as const,
      accept: [{ 'custom-external-host': announceEndpoint }],
      set: { 'custom-external-host': announceEndpoint },
    },
  }
}

export function getSubscriptionExpiryTask(
  config:
    | {
        enabled?: boolean
        'tunnelsats-conf'?: string | null
      }
    | null
    | undefined,
  meta?: SubscriptionMeta | null,
  currentDate = new Date(),
): SubscriptionExpiryTask {
  const clearTaskKey = 'tunnelsats:import-subscription'

  if (!config?.enabled || !config['tunnelsats-conf']) {
    return { shouldCreateTask: false, clearTaskKey }
  }

  const candidateDates: Date[] = []

  if (meta?.expiresAt) {
    const metaDate = new Date(meta.expiresAt.trim())
    if (!isNaN(metaDate.getTime())) {
      candidateDates.push(metaDate)
    }
  }

  const wgConf = config['tunnelsats-conf']
  const validUntilMatch = wgConf.match(
    /#\s*(?:Valid Until|Expires At|Expiry):\s*(.+)/i,
  )
  if (validUntilMatch) {
    const commentDate = new Date(validUntilMatch[1].trim())
    if (!isNaN(commentDate.getTime())) {
      candidateDates.push(commentDate)
    }
  }

  if (candidateDates.length === 0) {
    return { shouldCreateTask: false, clearTaskKey }
  }

  // Use the latest known valid expiration date between live synchronization and user configuration
  const expiryDate = new Date(
    Math.max(...candidateDates.map((d) => d.getTime())),
  )

  const timeDiffMs = expiryDate.getTime() - currentDate.getTime()
  const daysRemaining = Math.floor(timeDiffMs / (1000 * 60 * 60 * 24))

  if (timeDiffMs <= 0) {
    return {
      shouldCreateTask: true,
      severity: 'critical',
      reason: i18n(
        'TunnelSats WireGuard subscription has expired. Paste a renewed configuration in settings to restore inbound connectivity.',
      ),
      clearTaskKey,
    }
  }

  if (daysRemaining <= 3) {
    return {
      shouldCreateTask: true,
      severity: 'critical',
      reason: i18n(
        'TunnelSats subscription expires in <= 3 days. Renew subscription to avoid connection disruption.',
      ),
      clearTaskKey,
    }
  }

  if (daysRemaining <= 7) {
    return {
      shouldCreateTask: true,
      severity: 'important',
      reason: i18n(
        'TunnelSats subscription expires in <= 7 days. Plan your renewal to maintain uptime.',
      ),
      clearTaskKey,
    }
  }

  return { shouldCreateTask: false, clearTaskKey }
}

export function getDependenciesForConfig(
  config: { enabled?: boolean; 'target-node'?: TargetNode } | null | undefined,
) {
  if (!config?.enabled) {
    return {}
  }

  const targetNode = config['target-node'] ?? 'lnd'

  if (targetNode === 'cln') {
    return {
      'c-lightning': {
        kind: 'running' as const,
        versionRange: '>=23.2.2:0',
        healthChecks: ['lightningd'],
      },
    }
  }

  if (targetNode === 'eclair') {
    return {
      eclair: {
        kind: 'running' as const,
        versionRange: '>=0.10.0:0',
        healthChecks: ['eclair'],
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
  const meta = await tunnelsatsMeta
    .read()
    .const(effects)
    .catch(() => null)

  // 1. Proactive Subscription Expiry Alert Task
  const expiryTask = getSubscriptionExpiryTask(config, meta)
  if (expiryTask.shouldCreateTask && expiryTask.severity && expiryTask.reason) {
    await sdk.action.createOwnTask(
      effects,
      importSubscription,
      expiryTask.severity,
      {
        reason: expiryTask.reason,
      },
    )
  } else {
    await sdk.action.clearTask(effects, expiryTask.clearTaskKey)
  }

  // 2. In-Container Clearnet VPN Task on Target Lightning Node
  const vpnConfig = getTargetVpnConfig(config)
  if (vpnConfig && vpnConfig.announceEndpoint) {
    const target = clearnetVpnActions[vpnConfig.targetPackage]

    // Raise clearnet-vpn task on the active target node
    await sdk.action.createTask(
      effects,
      target.packageId,
      target.action,
      'important',
      {
        input: {
          kind: 'partial',
          accept: [
            {
              config: vpnConfig.wgConf,
              announce: vpnConfig.announceEndpoint,
            },
          ],
          set: {
            config: vpnConfig.wgConf,
            announce: vpnConfig.announceEndpoint,
          },
        },
        when: { condition: 'input-not-matches', once: false },
        reason: i18n(
          'Activate TunnelSats VPN tunnel and advertise clearnet endpoint to the Lightning Network',
        ),
      },
    )

    // Clear stale clearnet-vpn tasks on inactive nodes
    for (const pkg of vpnConfig.clearPackages) {
      await sdk.action.clearTask(effects, `${pkg}:clearnet-vpn`)
    }
  } else {
    // No active VPN config — clear all clearnet-vpn tasks
    for (const key of ALL_CLEARNET_VPN_TASK_KEYS) {
      await sdk.action.clearTask(effects, key)
    }
  }

  return getDependenciesForConfig(config)
})
