import { sdk } from './sdk'
import { configJson } from './fileModels/config.json'
import { tunnelsatsMeta } from './fileModels/tunnelsatsMeta'
import { vpnHandoff } from './fileModels/vpnHandoff'
import { i18n } from './i18n'
import { getAnnounceEndpoint, parseWireguardTunnelInfo } from './utils'
export { getAnnounceEndpoint } from './utils'
import { derivePublicKey } from './keygen'
import { renewSubscription } from './actions/renewSubscription'
import {
  type PackageId,
  type OffTaskState,
  planClearnetVpnTasks,
  executeClearnetVpnPlan,
  readOffTaskState,
  buildOnTaskInput,
  buildOffTaskInput,
  clearnetVpnReplayId,
} from './vpnHandoff'
import { clearnetVpn as lndClearnetVpn } from 'lnd-startos/startos/actions/clearnetVpn'
import { clearnetVpn as clnClearnetVpn } from 'cln-startos/startos/actions/clearnetVpn'
import { clearnetVpn as eclairClearnetVpn } from 'eclair-startos/startos/actions/clearnetVpn'

export type { PackageId } from './vpnHandoff'
export type TargetNode = 'lnd' | 'cln' | 'eclair'

/** All three clearnet-vpn actions share the same input shape */
const clearnetVpnActions = {
  lnd: lndClearnetVpn,
  'c-lightning': clnClearnetVpn,
  eclair: eclairClearnetVpn,
} as const

/** Replay key of the expiry task. */
export const EXPIRY_TASK_KEY = 'tunnelsats:renew-subscription'
/**
 * Expiry tasks used to point at Import Subscription. StartOS never reaps a
 * replay key that is no longer written, so the retired key is cleared here.
 */
export const RETIRED_EXPIRY_TASK_KEY = 'tunnelsats:import-subscription'

export interface TargetVpnConfig {
  targetPackage: PackageId
  clearPackages: PackageId[]
  announceEndpoint: string | null
  wgConf: string
}

export interface SubscriptionMeta {
  expiresAt?: string
  expirySource?: 'api'
  publicKey?: string
  lastSync?: string
  syncSuccess?: boolean
  syncError?: string | null
  serverDomain?: string
  vpnPort?: number
  bandwidth_used_gb?: number
}

export interface SubscriptionExpiryTask {
  shouldCreateTask: boolean
  severity?: 'important'
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

/**
 * The subscription expiry this package may act on: the value the TunnelSats
 * API returned for the key in the stored config. The `# Valid Until` comment
 * is a hint only and never counts, and neither does an expiry that was
 * confirmed for a different key (e.g. before a new config was imported).
 */
export function getConfirmedExpiry(
  wgConf: string | null | undefined,
  meta: SubscriptionMeta | null | undefined,
): Date | null {
  if (!meta?.expiresAt || meta.expirySource !== 'api' || !meta.publicKey) {
    return null
  }
  const privateKey = parseWireguardTunnelInfo(wgConf).privateKey
  if (!privateKey) return null
  let currentPublicKey: string
  try {
    currentPublicKey = derivePublicKey(privateKey)
  } catch {
    return null
  }
  if (currentPublicKey !== meta.publicKey) return null
  const expiry = new Date(meta.expiresAt.trim())
  return isNaN(expiry.getTime()) ? null : expiry
}

/**
 * Every expiry task is 'important'. An expiry task is an own task, and
 * StartOS stops the owning service while an own task is active and critical.
 * That would halt the subscription sync that confirms a renewal and clears
 * the task, which is a deadlock.
 */
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
  const clearTaskKey = EXPIRY_TASK_KEY

  if (!config?.enabled || !config['tunnelsats-conf']) {
    return { shouldCreateTask: false, clearTaskKey }
  }

  const expiryDate = getConfirmedExpiry(config['tunnelsats-conf'], meta)
  if (!expiryDate) {
    return { shouldCreateTask: false, clearTaskKey }
  }

  const timeDiffMs = expiryDate.getTime() - currentDate.getTime()
  const daysRemaining = Math.floor(timeDiffMs / (1000 * 60 * 60 * 24))

  if (timeDiffMs <= 0) {
    return {
      shouldCreateTask: true,
      severity: 'important',
      reason: i18n(
        'Your TunnelSats subscription has expired, and your node holds its clearnet traffic until it is renewed. Run Renew Subscription to restore it.',
      ),
      clearTaskKey,
    }
  }

  if (daysRemaining <= 3) {
    return {
      shouldCreateTask: true,
      severity: 'important',
      reason: i18n(
        'Your TunnelSats subscription expires in 3 days or less. Run Renew Subscription to keep your node reachable over clearnet.',
      ),
      clearTaskKey,
    }
  }

  if (daysRemaining <= 7) {
    return {
      shouldCreateTask: true,
      severity: 'important',
      reason: i18n(
        'Your TunnelSats subscription expires in 7 days or less. Run Renew Subscription to keep your node reachable over clearnet.',
      ),
      clearTaskKey,
    }
  }

  return { shouldCreateTask: false, clearTaskKey }
}

const NODE_VERSION_RANGES = {
  lnd: '>=0.15.5:0',
  'c-lightning': '>=23.2.2:0',
  eclair: '>=0.10.0:0',
} as const

const NODE_HEALTH_CHECKS = {
  lnd: 'lnd',
  'c-lightning': 'lightningd',
  eclair: 'eclair',
} as const

/**
 * The target node is a running dependency. Nodes that still owe us a
 * confirmed "off" stay declared (as `exists`), because StartOS hides tasks on
 * packages that are not current dependencies.
 */
export function getDependenciesForConfig(
  config: { enabled?: boolean; 'target-node'?: TargetNode } | null | undefined,
  pendingOff: readonly PackageId[] = [],
) {
  const deps: Partial<
    Record<
      PackageId,
      | {
          kind: 'running'
          versionRange: (typeof NODE_VERSION_RANGES)[PackageId]
          healthChecks: string[]
        }
      | {
          kind: 'exists'
          versionRange: (typeof NODE_VERSION_RANGES)[PackageId]
        }
    >
  > = {}

  if (config?.enabled) {
    const target = resolvePackageId(config['target-node'] ?? 'lnd')
    deps[target] = {
      kind: 'running',
      versionRange: NODE_VERSION_RANGES[target],
      healthChecks: [NODE_HEALTH_CHECKS[target]],
    }
  }

  for (const p of pendingOff) {
    if (!deps[p]) {
      deps[p] = { kind: 'exists', versionRange: NODE_VERSION_RANGES[p] }
    }
  }

  return deps
}

/**
 * setupDependencies re-runs whenever a watched file changes. Runs can
 * overlap, and the handoff reads its previous state and writes the next one,
 * so runs are serialized. Otherwise a quick lnd→cln→eclair switch could lose
 * the off-task for lnd.
 */
let handoffQueue: Promise<unknown> = Promise.resolve()
function serializeHandoff<T>(fn: () => Promise<T>): Promise<T> {
  const run = handoffQueue.then(fn, fn)
  handoffQueue = run.catch(() => undefined)
  return run
}

async function readOffTaskStates(
  effects: Parameters<typeof sdk.checkDependencies>[0],
  pending: readonly PackageId[],
): Promise<Partial<Record<PackageId, OffTaskState>>> {
  const states: Partial<Record<PackageId, OffTaskState>> = {}
  if (pending.length === 0) return states
  try {
    const check = await sdk.checkDependencies(effects, [...pending])
    for (const p of pending) {
      try {
        states[p] = readOffTaskState(
          check.infoFor(p).result.tasks[clearnetVpnReplayId(p)],
        )
      } catch {
        states[p] = 'unknown'
      }
    }
  } catch (e) {
    console.warn(
      'TunnelSats: could not read clearnet-vpn task state; keeping off-tasks raised:',
      e,
    )
  }
  return states
}

async function handOffClearnetVpn(
  effects: Parameters<typeof sdk.checkDependencies>[0],
  config: Parameters<typeof getTargetVpnConfig>[0],
): Promise<PackageId[]> {
  const state = await vpnHandoff
    .read()
    .once()
    .catch((e) => {
      console.error(
        'TunnelSats: could not read vpn-handoff.json; previous off-task targets are unknown:',
        e,
      )
      return null
    })
  const installed = await effects.getInstalledPackages()
  const offTaskStates = await readOffTaskStates(
    effects,
    state?.pendingOff ?? [],
  )

  const plan = planClearnetVpnTasks({
    desired: getTargetVpnConfig(config),
    state,
    installed,
    offTaskStates,
  })

  const outcome = await executeClearnetVpnPlan(plan, {
    raiseOn: (on) =>
      sdk.action.createTask(
        effects,
        on.packageId,
        clearnetVpnActions[on.packageId],
        'important',
        {
          input: buildOnTaskInput(on.config, on.announce),
          when: { condition: 'input-not-matches', once: false },
          reason: i18n(
            'Activate TunnelSats VPN tunnel and advertise clearnet endpoint to the Lightning Network',
          ),
        },
      ),
    raiseOff: (packageId) =>
      sdk.action.createTask(
        effects,
        packageId,
        clearnetVpnActions[packageId],
        'important',
        {
          input: buildOffTaskInput(),
          when: { condition: 'input-not-matches', once: false },
          reason: i18n(
            'Turn off the TunnelSats tunnel on this node. TunnelSats now routes a different node or has been switched off.',
          ),
        },
      ),
    clear: (packageId) =>
      sdk.action.clearTask(effects, clearnetVpnReplayId(packageId)),
  })
  for (const f of outcome.failures) {
    console.error(
      `TunnelSats: clearnet-vpn ${f.op} task on ${f.packageId} failed (will retry): ${f.error}`,
    )
  }

  const prevPending = state?.pendingOff ?? []
  if (
    (state?.activeTarget ?? null) !== plan.next.activeTarget ||
    prevPending.length !== plan.next.pendingOff.length ||
    prevPending.some((p, i) => p !== plan.next.pendingOff[i])
  ) {
    await vpnHandoff.write(effects, plan.next)
  }

  return plan.next.pendingOff
}

export const setDependencies = sdk.setupDependencies(async ({ effects }) => {
  const config = await configJson.read().const(effects)
  const meta = await tunnelsatsMeta
    .read()
    .const(effects)
    .catch(() => null)

  // 1. Expiry task, driven only by the API-confirmed expiry
  const expiryTask = getSubscriptionExpiryTask(config, meta)
  if (expiryTask.shouldCreateTask && expiryTask.severity && expiryTask.reason) {
    await sdk.action.createOwnTask(
      effects,
      renewSubscription,
      expiryTask.severity,
      {
        reason: expiryTask.reason,
      },
    )
  } else {
    await sdk.action.clearTask(effects, expiryTask.clearTaskKey)
  }
  await sdk.action.clearTask(effects, RETIRED_EXPIRY_TASK_KEY)

  // 2. Clearnet-VPN handoff: on-task for the target, off-task for the rest
  const pendingOff = await serializeHandoff(() =>
    handOffClearnetVpn(effects, config),
  )

  return getDependenciesForConfig(config, pendingOff)
})
