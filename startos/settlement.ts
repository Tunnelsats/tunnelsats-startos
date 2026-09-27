/**
 * The settlement tick: finishes paid Buy/Renew payments on-device.
 *
 * bridge.py `settle` does the work (claim, assemble, save, confirm; see the
 * settlement section there). This module runs it, clears the Pay Invoice
 * tasks of settled or expired payments and maps the result to a health
 * status. It is free of SDK imports so the tests run the real code; main.ts
 * injects the exec and clearTask effects.
 */

export type TargetNode = 'lnd' | 'cln' | 'eclair'
export type PaymentKind = 'order' | 'renewal'

const TARGET_NODES: readonly string[] = ['lnd', 'cln', 'eclair']

/**
 * Replay ID of the Pay Invoice task a Buy (order) or Renew (renewal) raises
 * on `node` for one payment. Unique per payment, so clearing a settled
 * payment's task can never remove a newer payment's task. Must match
 * pay_task_replay_id() in bridge.py, which queues these IDs for clearing.
 */
export function payTaskReplayId(
  kind: PaymentKind,
  node: TargetNode,
  paymentHash: string,
): string {
  return `tunnelsats-${kind}:${node}:${paymentHash.slice(0, 16)}`
}

/**
 * The pay task of the pending entry that a new payment (`newHash`) is about
 * to replace, or null. A Buy/Renew clears it: the replaced payment is no
 * longer tracked, so its invoice must not stay on the node as a task.
 */
export function replacedPayTaskId(
  kind: PaymentKind,
  previous: { paymentHash?: string; targetNode?: string } | null | undefined,
  newHash: string,
): string | null {
  if (
    !previous?.paymentHash ||
    previous.paymentHash === newHash ||
    !previous.targetNode ||
    !TARGET_NODES.includes(previous.targetNode)
  ) {
    return null
  }
  return payTaskReplayId(
    kind,
    previous.targetNode as TargetNode,
    previous.paymentHash,
  )
}

/**
 * Records a payment whose pay task was already raised. If recording fails,
 * the task is retracted so the node is never asked to pay an invoice the
 * settlement watcher cannot track; the record error is rethrown either way.
 * A failed retract is logged, as it must not mask the record error.
 */
export async function recordPaymentOrRetractTask(
  record: () => Promise<unknown>,
  retractTask: () => Promise<unknown>,
): Promise<void> {
  try {
    await record()
  } catch (recordError) {
    try {
      await retractTask()
    } catch (retractError) {
      console.warn(
        `Could not retract the untracked pay task: ${
          retractError instanceof Error
            ? retractError.message
            : String(retractError)
        }`,
      )
    }
    throw recordError
  }
}

const TERMINAL_RESULTS = [
  'provisioned',
  'renewed',
  'superseded',
  'expired',
] as const
const RESULTS = [...TERMINAL_RESULTS, 'waiting', 'failed'] as const

export interface SettlementOutcome {
  kind: PaymentKind
  result: (typeof RESULTS)[number]
  message: string
  paymentHash: string
}

export interface SettlementReport {
  outcomes: SettlementOutcome[]
  clearPayTasks: string[]
  busy: boolean
}

export interface ExecResult {
  exitCode: number | null
  stdout: string | Buffer
  stderr: string | Buffer
}

export interface SettlementOps {
  /** Runs `bridge.py settle`. */
  settle(): Promise<ExecResult>
  /** Runs `bridge.py settle-ack <ids...>`. */
  ack(replayIds: string[]): Promise<ExecResult>
  /** Clears this package's task with that replay ID (a no-op if absent). */
  clearTask(replayId: string): Promise<unknown>
}

/**
 * Most severe first: `failed` (a payment could not be finished, or the tick
 * itself failed), `clearing-failed` (a paid invoice's task is still on the
 * node), `waiting`, `settled`, then `idle`/`busy`.
 */
export type SettlementStatus =
  | { state: 'idle' }
  | { state: 'busy' }
  | { state: 'failed'; error: string }
  | { state: 'clearing-failed'; error: string }
  | { state: 'waiting'; message: string }
  | { state: 'settled'; message: string }

const text = (value: string | Buffer) => value.toString()

function lastLine(value: string | Buffer): string {
  const lines = text(value).trim().split('\n')
  return lines[lines.length - 1]?.trim() ?? ''
}

const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : String(e)

function isOutcome(value: unknown): value is SettlementOutcome {
  if (typeof value !== 'object' || value === null) return false
  const o = value as Record<string, unknown>
  return (
    (o.kind === 'order' || o.kind === 'renewal') &&
    RESULTS.includes(o.result as SettlementOutcome['result']) &&
    typeof o.message === 'string' &&
    typeof o.paymentHash === 'string'
  )
}

/** Parses `bridge.py settle` output; throws on anything unexpected. */
export function parseSettlementReport(stdout: string): SettlementReport {
  const data: unknown = JSON.parse(stdout)
  if (typeof data !== 'object' || data === null) {
    throw new Error('settle printed no report')
  }
  const { outcomes, clearPayTasks, busy } = data as Record<string, unknown>
  if (
    !Array.isArray(outcomes) ||
    !outcomes.every(isOutcome) ||
    !Array.isArray(clearPayTasks) ||
    !clearPayTasks.every((t) => typeof t === 'string') ||
    typeof busy !== 'boolean'
  ) {
    throw new Error('settle printed an unexpected report')
  }
  return { outcomes, clearPayTasks, busy }
}

/**
 * Clears each queued pay task, then acknowledges the cleared ones so
 * bridge.py stops listing them. Returns the first error, if any; anything
 * not acknowledged is listed (and cleared, a no-op) again next tick.
 */
async function clearPayTasks(
  ops: SettlementOps,
  replayIds: string[],
): Promise<string | null> {
  const cleared: string[] = []
  let error: string | null = null
  for (const id of replayIds) {
    try {
      await ops.clearTask(id)
      cleared.push(id)
    } catch (e) {
      error ??= errorMessage(e)
    }
  }
  if (cleared.length > 0) {
    try {
      const res = await ops.ack(cleared)
      if (res.exitCode !== 0) {
        error ??= lastLine(res.stderr) || 'settle-ack failed'
      }
    } catch (e) {
      error ??= errorMessage(e)
    }
  }
  return error
}

export async function runSettlementTick(
  ops: SettlementOps,
): Promise<SettlementStatus> {
  let report: SettlementReport
  try {
    const res = await ops.settle()
    if (res.exitCode !== 0) {
      return {
        state: 'failed',
        error: lastLine(res.stderr) || lastLine(res.stdout) || 'settle failed',
      }
    }
    report = parseSettlementReport(text(res.stdout))
  } catch (e) {
    return { state: 'failed', error: errorMessage(e) }
  }
  if (report.busy) return { state: 'busy' }

  const clearError = await clearPayTasks(ops, report.clearPayTasks)

  const failed = report.outcomes.find((o) => o.result === 'failed')
  if (failed) return { state: 'failed', error: failed.message }
  if (clearError) return { state: 'clearing-failed', error: clearError }
  const waiting = report.outcomes.filter((o) => o.result === 'waiting')
  if (waiting.length > 0) {
    return {
      state: 'waiting',
      message: waiting.map((o) => o.message).join(' '),
    }
  }
  if (report.outcomes.length > 0) {
    return {
      state: 'settled',
      message: report.outcomes.map((o) => o.message).join(' '),
    }
  }
  return { state: 'idle' }
}
