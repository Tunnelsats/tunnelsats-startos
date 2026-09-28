import { T } from '@start9labs/start-sdk'
import {
  dashboardIntentResults,
  dashboardIntents,
  type DashboardBuyIntent,
  type DashboardIntentKind,
  type DashboardIntentResult,
  type DashboardIntentResultsFile,
  type DashboardIntentsFile,
  type DashboardRenewIntent,
  type DashboardResetIntent,
} from './fileModels/dashboardIntents'
import { startPurchase } from './actions/buySubscription'
import { startRenewal } from './actions/renewSubscription'
import { startBandwidthReset } from './actions/resetBandwidth'
import type { TargetNode } from './settlement'

export const INTENT_TTL_MS = 10 * 60 * 1000
const INTENT_ORDER: readonly DashboardIntentKind[] = ['renew', 'reset', 'buy']
const HEX64_RE = /\b[0-9a-fA-F]{64}\b/g

export function sanitizeIntentError(err: unknown): string {
  const raw =
    err instanceof Error ? err.message : String(err ?? 'Unknown error')
  const redacted = raw
    .replace(
      /with payment hash\s+[0-9a-fA-F]{64}/gi,
      'with the payment hash from the Reset Bandwidth action',
    )
    .replace(HEX64_RE, '[redacted]')
    .trim()
  if (!redacted) return 'Action failed'
  return redacted.length <= 300 ? redacted : `${redacted.slice(0, 299)}…`
}

export interface IntentActionOutcome {
  paymentHash: string
  targetNode: TargetNode
  reused: boolean
}

export interface IntentRunnerOps {
  now(): Date
  readIntents(): Promise<DashboardIntentsFile | null>
  readResults(): Promise<DashboardIntentResultsFile | null>
  writeResult(
    kind: DashboardIntentKind,
    result: DashboardIntentResult,
  ): Promise<unknown>
  runBuy(intent: DashboardBuyIntent): Promise<IntentActionOutcome>
  runRenew(intent: DashboardRenewIntent): Promise<IntentActionOutcome>
  runReset(intent: DashboardResetIntent): Promise<IntentActionOutcome>
}

let intentQueueTail: Promise<unknown> = Promise.resolve()

export function runIntentExclusive<T>(job: () => Promise<T>): Promise<T> {
  const run = intentQueueTail.then(job, job)
  intentQueueTail = run.catch(() => undefined)
  return run
}

export function runDashboardIntents(
  ops: IntentRunnerOps,
): Promise<DashboardIntentResult[]> {
  return runIntentExclusive(async () => {
    const intents = await ops.readIntents()
    if (!intents) return []
    const results = (await ops.readResults()) ?? {}
    const outcomes: DashboardIntentResult[] = []

    for (const kind of INTENT_ORDER) {
      const slot = intents[kind]
      if (!slot) continue

      const previous = results[kind]
      if (
        previous &&
        previous.id === slot.id &&
        previous.status !== 'processing'
      ) {
        continue
      }

      const now = ops.now()
      const createdMs = Date.parse(slot.createdAt)
      if (
        !Number.isFinite(createdMs) ||
        now.getTime() - createdMs > INTENT_TTL_MS
      ) {
        const expiredResult: DashboardIntentResult = {
          id: slot.id,
          kind,
          status: 'failed',
          createdAt: slot.createdAt,
          updatedAt: now.toISOString(),
          targetNode: slot.targetNode,
          error: 'The dashboard request expired before it could be processed.',
        }
        await ops.writeResult(kind, expiredResult)
        outcomes.push(expiredResult)
        continue
      }

      const processingResult: DashboardIntentResult = {
        id: slot.id,
        kind,
        status: 'processing',
        createdAt: slot.createdAt,
        updatedAt: now.toISOString(),
        targetNode: slot.targetNode,
      }
      await ops.writeResult(kind, processingResult)

      try {
        let actionOutcome: IntentActionOutcome
        if (kind === 'buy') {
          actionOutcome = await ops.runBuy(slot as DashboardBuyIntent)
        } else if (kind === 'renew') {
          actionOutcome = await ops.runRenew(slot as DashboardRenewIntent)
        } else {
          actionOutcome = await ops.runReset(slot as DashboardResetIntent)
        }
        const succeededResult: DashboardIntentResult = {
          id: slot.id,
          kind,
          status: 'succeeded',
          createdAt: slot.createdAt,
          updatedAt: ops.now().toISOString(),
          targetNode: actionOutcome.targetNode,
          paymentHash: actionOutcome.paymentHash,
          reused: actionOutcome.reused,
        }
        await ops.writeResult(kind, succeededResult)
        outcomes.push(succeededResult)
      } catch (e) {
        const failedResult: DashboardIntentResult = {
          id: slot.id,
          kind,
          status: 'failed',
          createdAt: slot.createdAt,
          updatedAt: ops.now().toISOString(),
          targetNode: slot.targetNode,
          error: sanitizeIntentError(e),
        }
        await ops.writeResult(kind, failedResult)
        outcomes.push(failedResult)
      }
    }

    return outcomes
  })
}

export function processDashboardIntents(
  effects: T.Effects,
  opsOverride?: Partial<IntentRunnerOps>,
): Promise<DashboardIntentResult[]> {
  const defaultOps: IntentRunnerOps = {
    now: () => new Date(),
    readIntents: () =>
      dashboardIntents
        .read()
        .once()
        .catch(() => null),
    readResults: () =>
      dashboardIntentResults
        .read()
        .once()
        .catch(() => null),
    writeResult: (kind, result) =>
      dashboardIntentResults.merge(effects, {
        [kind]: result,
      }),
    runBuy: async (intent) => {
      const res = await startPurchase(effects, {
        targetNode: intent.targetNode,
        serverRegion: intent.serverId,
        duration: intent.duration,
        reuseActive: true,
      })
      if (res.kind === 'already-paid') {
        return {
          paymentHash: res.paymentHash,
          targetNode: res.targetNode,
          reused: true,
        }
      }
      return {
        paymentHash: res.order.paymentHash,
        targetNode: res.targetNode,
        reused: res.kind === 'reused',
      }
    },
    runRenew: async (intent) => {
      const res = await startRenewal(effects, {
        duration: intent.duration,
        reuseActive: true,
      })
      if (res.kind === 'already-paid') {
        return {
          paymentHash: res.paymentHash,
          targetNode: res.targetNode,
          reused: true,
        }
      }
      return {
        paymentHash: res.renewal.paymentHash,
        targetNode: res.targetNode,
        reused: res.kind === 'reused',
      }
    },
    runReset: async () => {
      const { outcome, targetNode } = await startBandwidthReset(effects)
      if (outcome.kind === 'already-paid') {
        return {
          paymentHash: outcome.paymentHash,
          targetNode,
          reused: true,
        }
      }
      if (outcome.kind === 'reused') {
        return {
          paymentHash: outcome.pending.paymentHash,
          targetNode: outcome.pending.targetNode,
          reused: true,
        }
      }
      return {
        paymentHash: outcome.order.paymentHash,
        targetNode,
        reused: false,
      }
    },
  }
  return runDashboardIntents({ ...defaultOps, ...opsOverride })
}
