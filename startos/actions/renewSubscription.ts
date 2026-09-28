import { T } from '@start9labs/start-sdk'
import { sdk } from '../sdk'
import { configJson } from '../fileModels/config.json'
import { tunnelsatsMeta } from '../fileModels/tunnelsatsMeta'
import { i18n } from '../i18n'
import { parseWireguardTunnelInfo } from '../utils'
import { derivePublicKey } from '../keygen'
import {
  bolt11AmountSats,
  requestRenewal,
  type RenewalOrder,
} from '../apiClient'
import {
  payTaskReplayId,
  recordThenRaise,
  runPaymentExclusive,
  type TargetNode,
} from '../settlement'
import { INVOICE_TTL_MS, VALID_DURATIONS } from './buySubscription'
import { resolvePayInvoice } from './resolvePayInvoice'

export interface PendingRenewalRecord {
  paymentHash: string
  renewalId: string
  oldExpiry: string
  newExpiry: string
  createdAt: string
  duration?: number
  invoice?: string
  amountSats?: number
  expiresAt?: string
  paymentReceivedFor?: string
  publicKey?: string
  targetNode?: TargetNode
}

export interface RenewalInput {
  duration: number
  /**
   * When true (dashboard intents), any still-payable pendingRenewal for the
   * configured key is reused regardless of duration.
   */
  reuseActive?: boolean
}

export interface RenewalOps {
  now(): Date
  readConfig(): Promise<{
    enabled?: boolean
    'target-node'?: TargetNode
    'tunnelsats-conf'?: string | null
  } | null>
  readServerMeta(): Promise<{
    publicKey?: string
    serverDomain?: string
  } | null>
  readCurrent(): Promise<{
    pending?: PendingRenewalRecord | null
    payTasksToClear?: string[]
  } | null>
  requestRenewal(params: {
    serverId: string
    duration: number
    wgPublicKey: string
  }): Promise<RenewalOrder>
  record(
    entry: PendingRenewalRecord,
    patch: { payTasksToClear?: string[] },
  ): Promise<unknown>
  raiseTask(task: {
    invoice: string
    paymentHash: string
    targetNode: TargetNode
  }): Promise<unknown>
}

export type RenewalRunResult =
  | {
      kind: 'created'
      renewal: RenewalOrder & { expiresAt: string; amountSats?: number }
      targetNode: TargetNode
    }
  | {
      kind: 'reused'
      renewal: RenewalOrder & { expiresAt: string; amountSats?: number }
      targetNode: TargetNode
    }
  | {
      kind: 'already-paid'
      paymentHash: string
      targetNode: TargetNode
    }

export function reusablePendingRenewal(
  pending: PendingRenewalRecord | null | undefined,
  publicKey: string,
  input: RenewalInput,
  targetNode: TargetNode,
  now: Date,
): (PendingRenewalRecord & { invoice: string; expiresAt: string }) | null {
  if (!pending || pending.publicKey !== publicKey) return null
  if (!pending.paymentHash || !pending.invoice) return null
  if (pending.paymentReceivedFor === pending.paymentHash) return null
  const createdMs = Date.parse(pending.createdAt)
  const expiresMs = pending.expiresAt
    ? Date.parse(pending.expiresAt)
    : Number.isFinite(createdMs)
      ? createdMs + INVOICE_TTL_MS
      : NaN
  if (!Number.isFinite(expiresMs) || expiresMs <= now.getTime()) return null
  const node = pending.targetNode ?? targetNode
  if (
    !input.reuseActive &&
    (pending.duration !== input.duration || node !== targetNode)
  ) {
    return null
  }
  return {
    ...pending,
    invoice: pending.invoice,
    expiresAt: new Date(expiresMs).toISOString(),
  }
}

export async function runRenewal(
  input: RenewalInput,
  ops: RenewalOps,
): Promise<RenewalRunResult> {
  if (!VALID_DURATIONS.includes(input.duration as 1 | 3 | 6 | 12)) {
    throw new Error(`Invalid renewal duration: ${String(input.duration)}`)
  }

  const config = await ops.readConfig()
  if (!config?.enabled || !config['tunnelsats-conf']) {
    throw new Error(
      i18n(
        'No active subscription found. Import or purchase a subscription first.',
      ),
    )
  }

  const tunnelInfo = parseWireguardTunnelInfo(config['tunnelsats-conf'])
  if (!tunnelInfo.privateKey) {
    throw new Error(i18n('Cannot read private key from stored configuration.'))
  }
  const publicKey = derivePublicKey(tunnelInfo.privateKey)
  const meta = await ops.readServerMeta()
  const serverId = meta?.serverDomain || tunnelInfo.serverDomain || 'eu-de'
  const targetNode: TargetNode = config['target-node'] || 'lnd'

  return runPaymentExclusive(async () => {
    const current = await ops.readCurrent()
    const pending = current?.pending ?? null
    if (
      pending &&
      pending.publicKey === publicKey &&
      pending.paymentReceivedFor === pending.paymentHash &&
      input.reuseActive
    ) {
      return {
        kind: 'already-paid',
        paymentHash: pending.paymentHash,
        targetNode: pending.targetNode ?? targetNode,
      }
    }

    const now = ops.now()
    const reusable = reusablePendingRenewal(
      pending,
      publicKey,
      input,
      targetNode,
      now,
    )
    if (reusable) {
      const node = reusable.targetNode ?? targetNode
      await ops.raiseTask({
        invoice: reusable.invoice,
        paymentHash: reusable.paymentHash,
        targetNode: node,
      })
      return {
        kind: 'reused',
        renewal: {
          invoice: reusable.invoice,
          paymentHash: reusable.paymentHash,
          renewalId: reusable.renewalId,
          oldExpiry: reusable.oldExpiry,
          newExpiry: reusable.newExpiry,
          amountSats: reusable.amountSats ?? bolt11AmountSats(reusable.invoice),
          expiresAt: reusable.expiresAt,
        },
        targetNode: node,
      }
    }

    const renewal = await ops.requestRenewal({
      serverId,
      duration: input.duration,
      wgPublicKey: publicKey,
    })
    const createdNow = ops.now()
    const expiresAt =
      renewal.expiresAt && !Number.isNaN(Date.parse(renewal.expiresAt))
        ? new Date(renewal.expiresAt).toISOString()
        : new Date(createdNow.getTime() + INVOICE_TTL_MS).toISOString()
    const amountSats = renewal.amountSats ?? bolt11AmountSats(renewal.invoice)

    const entry: PendingRenewalRecord = {
      paymentHash: renewal.paymentHash,
      renewalId: renewal.renewalId,
      oldExpiry: renewal.oldExpiry,
      newExpiry: renewal.newExpiry,
      createdAt: createdNow.toISOString(),
      duration: input.duration,
      invoice: renewal.invoice,
      amountSats,
      expiresAt,
      publicKey,
      targetNode,
    }

    await recordThenRaise('renewal', renewal.paymentHash, {
      readCurrent: ops.readCurrent,
      record: (patch) => ops.record(entry, patch),
      raiseTask: () =>
        ops.raiseTask({
          invoice: renewal.invoice,
          paymentHash: renewal.paymentHash,
          targetNode,
        }),
    })

    return {
      kind: 'created',
      renewal: { ...renewal, amountSats, expiresAt },
      targetNode,
    }
  })
}

export function startRenewal(
  effects: T.Effects,
  input: RenewalInput,
  opsOverride?: Partial<RenewalOps>,
): Promise<RenewalRunResult> {
  const defaultOps: RenewalOps = {
    now: () => new Date(),
    readConfig: () =>
      configJson
        .read()
        .once()
        .catch(() => null),
    readServerMeta: () =>
      tunnelsatsMeta
        .read()
        .once()
        .catch(() => null),
    readCurrent: async () => {
      const current = await tunnelsatsMeta.read().once()
      return (
        current && {
          pending: current.pendingRenewal,
          payTasksToClear: current.payTasksToClear,
        }
      )
    },
    requestRenewal: (params) => requestRenewal(params),
    record: (entry, patch) =>
      tunnelsatsMeta.merge(effects, {
        pendingRenewal: {
          ...entry,
          // merge() is a deep merge: without these, a backoff or received
          // marker left by an earlier renewal would carry over to this one.
          paymentReceivedFor: undefined,
          lastError: undefined,
          nextAttemptAt: undefined,
        },
        ...patch,
      }),
    raiseTask: ({ invoice, paymentHash, targetNode }) => {
      const { packageId, payInvoiceAction } = resolvePayInvoice(targetNode)
      return sdk.action.createTask(
        effects,
        packageId,
        payInvoiceAction,
        'important',
        {
          replayId: payTaskReplayId('renewal', targetNode, paymentHash),
          input: {
            kind: 'partial',
            accept: [],
            set: {
              invoice,
              amount: { selection: 'invoice', value: {} },
              'max-fee-percent': 1,
              confirmed: false,
            },
          },
          reason: i18n('Pay TunnelSats VPN subscription renewal invoice'),
        },
      )
    },
  }
  return runRenewal(input, { ...defaultOps, ...opsOverride })
}

const { InputSpec, Value } = sdk

const inputSpec = InputSpec.of({
  duration: Value.select({
    name: i18n('Renewal Duration'),
    description: i18n('Choose how long to extend the subscription.'),
    default: '1',
    values: {
      '1': '1 Month',
      '3': '3 Months',
      '6': '6 Months',
      '12': '12 Months',
    },
  }),
})

export const renewSubscription = sdk.Action.withInput(
  'renew-subscription',
  {
    name: i18n('Renew Subscription'),
    description: i18n(
      'Extend your existing TunnelSats VPN subscription. Requires an active configuration with a valid private key.',
    ),
    warning: null,
    allowedStatuses: 'only-running',
    group: i18n('Subscription'),
    visibility: 'enabled',
  },
  inputSpec,
  async ({ effects }) => ({}),
  async ({ effects, input }) => {
    const outcome = await startRenewal(effects, {
      duration: parseInt(input.duration, 10),
    })

    if (outcome.kind === 'already-paid') {
      return {
        version: '1' as const,
        title: i18n('Renewal Invoice Created'),
        message: i18n('No payment pending'),
        result: {
          name: i18n('Payment Hash'),
          description: null,
          type: 'single' as const,
          value: outcome.paymentHash,
          copyable: true,
          masked: false,
          qr: false,
        },
      }
    }

    const { renewal } = outcome
    return {
      version: '1' as const,
      title: i18n('Renewal Invoice Created'),
      message: i18n(
        'A payment task has been raised on your Lightning node. Once paid, your subscription will be extended. Current expiry: ${oldExpiry}. New expiry after payment: ${newExpiry}.',
        {
          oldExpiry: renewal.oldExpiry,
          newExpiry: renewal.newExpiry,
        },
      ),
      result: {
        type: 'group' as const,
        value: [
          {
            name: i18n('BOLT11 Invoice'),
            description: null,
            type: 'single' as const,
            value: renewal.invoice,
            copyable: true,
            masked: false,
            qr: true,
          },
          {
            name: i18n('Payment Hash'),
            description: null,
            type: 'single' as const,
            value: renewal.paymentHash,
            copyable: true,
            masked: false,
            qr: false,
          },
        ],
      },
    }
  },
)
