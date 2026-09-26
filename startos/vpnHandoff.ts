/**
 * Clearnet-VPN handoff between TunnelSats and the Lightning nodes.
 *
 * The node owns the tunnel (`clearnet-vpn` action in lnd/cln/eclair-startos);
 * this package only raises tasks. An empty `config` turns the node's VPN off,
 * so whenever the subscription moves to another node or is switched off, the
 * node we previously handed the tunnel to receives an "off" task. Otherwise
 * that node would keep running the same WireGuard key as the new node, and
 * the two would fight over one tunnel (handshake flapping, inbound delivered
 * to whichever node handshook last).
 *
 * Whether a node is off is read from the node itself: the current input of
 * its clearnet-vpn action (effects.action.getInput), the same value StartOS
 * compares a task against. Anything unreadable counts as on (fail closed).
 * Without a record, only a TunnelSats-looking tunnel counts (current key or
 * a tunnelsats.com endpoint); a VPN we did not configure is left alone.
 *
 * StartOS does not reap tasks that are not re-raised, and it hides tasks on
 * packages that are not current dependencies, so every node that still owes
 * an off stays in `pendingOff` (declared as an `exists` dependency by the
 * caller) until it is off or uninstalled.
 *
 * StartOS cannot order tasks across packages either, so the new node's
 * on-task is withheld until every previous node is off or uninstalled. The
 * caller watches those nodes' status, so accepting the off-task on a running
 * node (which restarts it) re-runs the planner and releases the on-task.
 * StartOS offers no change notification for action input, so an off-task
 * accepted on a node that stays stopped changes nothing the status watch
 * sees. For that case a TunnelSats health check polls pending nodes
 * (runHandoffRecheck) and requests a re-run once one of them is off.
 *
 * Without a handoff record (fresh install, upgrade from a build that had
 * none, unreadable file) every installed node other than the target is
 * checked, so a tunnel handed out before the record existed is found too.
 */

export type PackageId = 'lnd' | 'c-lightning' | 'eclair'

export const ALL_PACKAGE_IDS: readonly PackageId[] = [
  'lnd',
  'c-lightning',
  'eclair',
]

export const CLEARNET_VPN_ACTION_ID = 'clearnet-vpn'

export function clearnetVpnReplayId(packageId: PackageId): string {
  return `${packageId}:${CLEARNET_VPN_ACTION_ID}`
}

export interface VpnHandoffState {
  /** The node we last raised an on-task for. */
  activeTarget: PackageId | null
  /** Nodes that still owe us an off. */
  pendingOff: PackageId[]
}

export const EMPTY_HANDOFF_STATE: VpnHandoffState = {
  activeTarget: null,
  pendingOff: [],
}

export interface DesiredVpn {
  targetPackage: PackageId
  announceEndpoint: string | null
  wgConf: string
}

/**
 * A node's clearnet-vpn state as read from its action input: 'on' is a
 * TunnelSats tunnel, 'foreign' a VPN TunnelSats did not configure (never
 * ours to turn off), 'unknown' unreadable (treated as on).
 */
export type NodeVpnState = 'on' | 'off' | 'foreign' | 'unknown'

export interface ClearnetVpnPlan {
  on: { packageId: PackageId; config: string; announce: string } | null
  /** The target's on-task, withheld until these nodes are off. */
  held: { packageId: PackageId; waitingFor: PackageId[] } | null
  /** Nodes to raise (or keep raising) the off-task on. */
  off: PackageId[]
  /** Nodes that are off or gone; their task gets cleared. */
  retire: PackageId[]
  next: VpnHandoffState
}

function isPackageId(v: unknown): v is PackageId {
  return typeof v === 'string' && (ALL_PACKAGE_IDS as string[]).includes(v)
}

/**
 * The nodes that may still run a tunnel we handed out: those in the record,
 * or, without a record, every installed node. The target is never one.
 */
export function previousNodes(
  state: VpnHandoffState | null | undefined,
  installed: readonly string[],
  target: PackageId | null,
): PackageId[] {
  const from = state
    ? [...(state.pendingOff ?? []), state.activeTarget]
    : ALL_PACKAGE_IDS.filter((p) => installed.includes(p))
  const out: PackageId[] = []
  for (const p of from) {
    if (isPackageId(p) && p !== target && !out.includes(p)) out.push(p)
  }
  return out
}

/** Only a config we can announce is handed over; never a half-configured tunnel. */
export function handedOverTarget(desired: DesiredVpn | null): PackageId | null {
  return desired && desired.announceEndpoint ? desired.targetPackage : null
}

export function planClearnetVpnTasks(params: {
  desired: DesiredVpn | null
  /** null: no handoff record (see module doc). */
  state: VpnHandoffState | null | undefined
  installed: readonly string[]
  nodeVpn: Partial<Record<PackageId, NodeVpnState>>
}): ClearnetVpnPlan {
  const { desired, installed, nodeVpn } = params
  const prev = params.state ?? EMPTY_HANDOFF_STATE

  const target = handedOverTarget(desired)
  const onCandidate =
    desired && target
      ? {
          packageId: target,
          config: desired.wgConf,
          announce: desired.announceEndpoint as string,
        }
      : null

  // A node in the record got its tunnel from us, whatever it looks like now
  // (an older key behind a bare IP endpoint reads as foreign). Only without
  // a record does the ownership heuristic decide.
  const tracked = params.state != null
  const off: PackageId[] = []
  const retire: PackageId[] = []
  for (const p of previousNodes(params.state, installed, target)) {
    const vpn = nodeVpn[p]
    if (
      !installed.includes(p) ||
      vpn === 'off' ||
      (vpn === 'foreign' && !tracked)
    ) {
      retire.push(p)
    } else {
      off.push(p)
    }
  }

  // StartOS cannot order tasks across packages. If the new node's on-task
  // were raised while a previous node may still run the tunnel, accepting it
  // first would put one WireGuard key on two nodes. So it is withheld until
  // every previous node is off or uninstalled. A target that already holds
  // the tunnel is never withheld.
  const hold =
    onCandidate !== null && prev.activeTarget !== target && off.length > 0
  const on = hold ? null : onCandidate

  return {
    on,
    held: hold && target ? { packageId: target, waitingFor: [...off] } : null,
    off,
    retire,
    next: { activeTarget: on ? target : null, pendingOff: off },
  }
}

export function buildOnTaskInput(config: string, announce: string) {
  return {
    kind: 'partial' as const,
    accept: [{ config, announce }],
    set: { config, announce },
  }
}

export function buildOffTaskInput() {
  return {
    kind: 'partial' as const,
    accept: [{ config: null }],
    set: { config: null, announce: null },
  }
}

const PRIVATE_KEY_LINE = /^[ \t]*PrivateKey[ \t]*=[ \t]*(\S+)/im
const ENDPOINT_LINE = /^[ \t]*Endpoint[ \t]*=[ \t]*(\S+)/im

function endpointHost(endpoint: string): string {
  if (endpoint.startsWith('[')) {
    const end = endpoint.indexOf(']')
    return end === -1 ? endpoint : endpoint.slice(1, end)
  }
  return endpoint.replace(/:\d+$/, '')
}

/**
 * A tunnel TunnelSats handed out: it uses our current WireGuard key, or it
 * peers with a TunnelSats server (covers a previous subscription's key).
 */
export function isTunnelsatsTunnel(
  config: string,
  ownConf: string | null | undefined,
): boolean {
  const ownKey = ownConf?.match(PRIVATE_KEY_LINE)?.[1]
  if (ownKey && config.match(PRIVATE_KEY_LINE)?.[1] === ownKey) return true
  const endpoint = config.match(ENDPOINT_LINE)?.[1]
  if (!endpoint) return false
  const host = endpointHost(endpoint).toLowerCase()
  return host === 'tunnelsats.com' || host.endsWith('.tunnelsats.com')
}

/**
 * A node's clearnet-vpn state from its current action input
 * (`{ config, announce }`). `ownConf` is the WireGuard config TunnelSats
 * holds. Unreadable or unexpected input is unknown.
 */
export function readNodeVpnState(
  value: Record<string, unknown> | null | undefined,
  ownConf: string | null | undefined,
): NodeVpnState {
  if (!value) return 'unknown'
  const config = value.config
  if (config === null || config === undefined) return 'off'
  if (typeof config !== 'string') return 'unknown'
  if (!config.trim()) return 'off'
  return isTunnelsatsTunnel(config, ownConf) ? 'on' : 'foreign'
}

export interface ClearnetVpnOps {
  raiseOn: (on: NonNullable<ClearnetVpnPlan['on']>) => Promise<unknown>
  raiseOff: (packageId: PackageId) => Promise<unknown>
  clear: (packageId: PackageId) => Promise<unknown>
}

export interface ClearnetVpnOutcome {
  raised: PackageId[]
  cleared: PackageId[]
  failures: {
    packageId: PackageId
    op: 'on' | 'off' | 'clear'
    error: string
  }[]
}

/**
 * Applies a plan. Every operation is idempotent, and a failed one is retried
 * on the next run because the plan's `next` state keeps it pending. Failures
 * are returned rather than thrown, so one unreachable node cannot block the
 * handoff on the others.
 */
export async function executeClearnetVpnPlan(
  plan: ClearnetVpnPlan,
  ops: ClearnetVpnOps,
): Promise<ClearnetVpnOutcome> {
  const outcome: ClearnetVpnOutcome = { raised: [], cleared: [], failures: [] }
  const attempt = async (
    packageId: PackageId,
    op: 'on' | 'off' | 'clear',
    fn: () => Promise<unknown>,
  ) => {
    try {
      await fn()
      ;(op === 'clear' ? outcome.cleared : outcome.raised).push(packageId)
    } catch (e) {
      outcome.failures.push({
        packageId,
        op,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  if (plan.on) {
    const on = plan.on
    await attempt(on.packageId, 'on', () => ops.raiseOn(on))
  }
  for (const p of plan.off) await attempt(p, 'off', () => ops.raiseOff(p))
  for (const p of plan.retire) await attempt(p, 'clear', () => ops.clear(p))
  return outcome
}

/**
 * The state to persist after a plan ran. A node whose task clear failed stays
 * in `pendingOff`, so the next run retries the clear instead of stranding an
 * obsolete prompt. Failed raises need nothing extra: the node is already
 * pending (off) or the target (on), so the next run raises it again.
 */
export function nextStateAfter(
  plan: ClearnetVpnPlan,
  outcome: ClearnetVpnOutcome,
): VpnHandoffState {
  const pendingOff = [...plan.next.pendingOff]
  for (const f of outcome.failures) {
    if (f.op === 'clear' && !pendingOff.includes(f.packageId)) {
      pendingOff.push(f.packageId)
    }
  }
  return { activeTarget: plan.next.activeTarget, pendingOff }
}

/** Display names for operator-facing messages. */
export const NODE_TITLES: Record<PackageId, string> = {
  lnd: 'LND',
  'c-lightning': 'Core Lightning',
  eclair: 'Eclair',
}

export interface HandoffProgress {
  /** Pending nodes that may still run the tunnel. */
  waitingFor: PackageId[]
  /** Pending nodes that are off or uninstalled; the next run retires them. */
  resolved: PackageId[]
}

/** Classifies the recorded pending nodes the same way the planner does. */
export function handoffProgress(
  state: VpnHandoffState | null | undefined,
  installed: readonly string[],
  nodeVpn: Partial<Record<PackageId, NodeVpnState>>,
): HandoffProgress {
  const progress: HandoffProgress = { waitingFor: [], resolved: [] }
  for (const p of new Set((state?.pendingOff ?? []).filter(isPackageId))) {
    if (!installed.includes(p) || nodeVpn[p] === 'off') {
      progress.resolved.push(p)
    } else {
      progress.waitingFor.push(p)
    }
  }
  return progress
}

export interface HandoffRecheckOps {
  readState: () => Promise<VpnHandoffState | null>
  readInstalled: () => Promise<readonly string[]>
  readNodeVpn: (
    nodes: readonly PackageId[],
  ) => Promise<Partial<Record<PackageId, NodeVpnState>>>
  /** Makes setupDependencies re-run (it watches the recheck file). */
  requestRecheck: () => Promise<unknown>
}

/**
 * Polled by a health check. Reports handoff progress and, when a pending
 * node turned off without a status change (off-task accepted on a stopped
 * node), requests a setupDependencies re-run so the held on-task is
 * released.
 */
export async function runHandoffRecheck(
  ops: HandoffRecheckOps,
): Promise<HandoffProgress> {
  const state = await ops.readState()
  const pending = (state?.pendingOff ?? []).filter(isPackageId)
  if (pending.length === 0) return { waitingFor: [], resolved: [] }
  const installed = await ops.readInstalled()
  const nodeVpn = await ops.readNodeVpn(
    pending.filter((p) => installed.includes(p)),
  )
  const progress = handoffProgress(state, installed, nodeVpn)
  if (progress.resolved.length > 0) await ops.requestRecheck()
  return progress
}
