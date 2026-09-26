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
 * StartOS does not reap tasks that are not re-raised, and it hides tasks on
 * packages that are not current dependencies, so the planner keeps every node
 * with an outstanding off-task in `pendingOff` (declared as an `exists`
 * dependency by the caller) until the node reports the off-task satisfied or
 * the node is uninstalled.
 *
 * StartOS cannot order tasks across packages either, so the new node's
 * on-task is withheld until every previous node has confirmed off (off-task
 * satisfied) or is uninstalled. The caller watches those nodes' status, so
 * accepting the off-task on a running node (which restarts it) re-runs the
 * planner and releases the on-task. Known limitation: StartOS offers no
 * change notification for task state, so an off-task accepted on a node that
 * stays stopped is only noticed on the next re-run (node started, TunnelSats
 * restarted, or subscription metadata synced). The delay is safe, never a
 * dual activation.
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
  /** Nodes that still owe us a confirmed off. */
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

export type OffTaskState = 'active' | 'satisfied' | 'unknown'

export interface ClearnetVpnPlan {
  on: { packageId: PackageId; config: string; announce: string } | null
  /** The target's on-task, withheld until these nodes are positively off. */
  held: { packageId: PackageId; waitingFor: PackageId[] } | null
  /** Nodes to raise (or keep raising) the off-task on. */
  off: PackageId[]
  /** Nodes whose off-task is done or moot; their task gets cleared. */
  retire: PackageId[]
  next: VpnHandoffState
}

function isPackageId(v: unknown): v is PackageId {
  return typeof v === 'string' && (ALL_PACKAGE_IDS as string[]).includes(v)
}

export function planClearnetVpnTasks(params: {
  desired: DesiredVpn | null
  state: VpnHandoffState | null | undefined
  installed: readonly string[]
  offTaskStates: Partial<Record<PackageId, OffTaskState>>
}): ClearnetVpnPlan {
  const { desired, installed, offTaskStates } = params
  const prev = params.state ?? EMPTY_HANDOFF_STATE

  // Only a config we can announce is handed over; the node gets no
  // half-configured tunnel.
  const onCandidate =
    desired && desired.announceEndpoint
      ? {
          packageId: desired.targetPackage,
          config: desired.wgConf,
          announce: desired.announceEndpoint,
        }
      : null
  const target = onCandidate?.packageId ?? null

  const previouslyPending = new Set((prev.pendingOff ?? []).filter(isPackageId))
  const candidates: PackageId[] = []
  for (const p of [...previouslyPending, prev.activeTarget]) {
    if (isPackageId(p) && p !== target && !candidates.includes(p)) {
      candidates.push(p)
    }
  }

  const off: PackageId[] = []
  const retire: PackageId[] = []
  for (const p of candidates) {
    if (!installed.includes(p)) {
      retire.push(p)
    } else if (
      // A satisfied entry only proves "off" for a node whose off-task we
      // raised on an earlier run. On a fresh transition the entry is still
      // our old, satisfied on-task.
      previouslyPending.has(p) &&
      offTaskStates[p] === 'satisfied'
    ) {
      retire.push(p)
    } else {
      off.push(p)
    }
  }

  // StartOS cannot order tasks across packages. If the new node's on-task
  // were raised while a previous node may still run the tunnel, accepting it
  // first would put one WireGuard key on two nodes. So it is withheld until
  // every previous node has confirmed off or is uninstalled. A stopped node
  // still holds it (fail closed): started again before accepting its
  // off-task, it would bring the tunnel back up. A target that already holds
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

/**
 * Reads a node's task entry for `clearnet-vpn` and tells whether it is our
 * off-task and whether the node has satisfied it. Anything else is unknown.
 */
export function readOffTaskState(
  entry:
    | {
        active: boolean
        task: { input?: { set?: Record<string, unknown> } | null }
      }
    | undefined
    | null,
): OffTaskState {
  const set = entry?.task?.input?.set
  if (!entry || !set || !('config' in set) || set.config !== null) {
    return 'unknown'
  }
  return entry.active ? 'active' : 'satisfied'
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
