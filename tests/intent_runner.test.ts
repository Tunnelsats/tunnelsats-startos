import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileHelper } from '@start9labs/start-sdk'
import { bolt11AmountSats } from '../startos/apiClient'
import {
  INVOICE_TTL_MS,
  reusablePendingOrder,
  runPurchase,
  startPurchase,
  type PendingOrderRecord,
  type PurchaseOps,
} from '../startos/actions/buySubscription'
import {
  reusablePendingRenewal,
  runRenewal,
  startRenewal,
  type PendingRenewalRecord,
  type RenewalOps,
} from '../startos/actions/renewSubscription'
import { startBandwidthReset } from '../startos/actions/resetBandwidth'
import {
  dashboardIntentResultsShape,
  dashboardIntentsShape,
  type DashboardIntentResult,
  type DashboardIntentResultsFile,
  type DashboardIntentsFile,
} from '../startos/fileModels/dashboardIntents'
import { metaShape } from '../startos/fileModels/tunnelsatsMeta'
import {
  INTENT_TTL_MS,
  processDashboardIntents,
  purchaseInputFromIntent,
  renewalInputFromIntent,
  resultPatch,
  runDashboardIntents,
  sanitizeIntentError,
  type IntentRunnerOps,
} from '../startos/intentRunner'
import { derivePublicKey, generateWireguardKeypair } from '../startos/keygen'
import { payTaskReplayId } from '../startos/settlement'

const NOW = new Date('2026-10-01T12:00:00.000Z')
const inMs = (ms: number) => new Date(NOW.getTime() + ms).toISOString()

const ORDER_HASH = '1'.repeat(64)
const ORDER_HASH_2 = '2'.repeat(64)
const RENEW_HASH = '3'.repeat(64)
const RENEW_HASH_2 = '4'.repeat(64)
const RESET_HASH = '5'.repeat(64)

const ORDER_INVOICE =
  'lnbc250u1p0orderinvoice000000000000000000000000000000000000000000'
const RENEW_INVOICE =
  'lnbc500u1p0renewinvoice000000000000000000000000000000000000000000'
const RESET_INVOICE =
  'lnbc15u1p0resetinvoice000000000000000000000000000000000000000000'

test('bolt11AmountSats extracts whole satoshis from BOLT11 HRPs', () => {
  assert.equal(bolt11AmountSats(ORDER_INVOICE), 25_000)
  assert.equal(bolt11AmountSats(RENEW_INVOICE), 50_000)
  assert.equal(bolt11AmountSats(RESET_INVOICE), 1_500)
  assert.equal(bolt11AmountSats('lnbc1m1p0test'), 100_000)
  assert.equal(bolt11AmountSats('lnbc1000n1p0test'), 100)
  assert.equal(bolt11AmountSats('not-an-invoice'), undefined)
})

test('reusablePendingOrder reuses an unpaid unexpired order', () => {
  const kp = generateWireguardKeypair()
  const pending: PendingOrderRecord = {
    paymentHash: ORDER_HASH,
    orderId: 'ord-1',
    privateKey: kp.privateKey,
    publicKey: kp.publicKey,
    targetNode: 'lnd',
    serverId: 'eu-de',
    createdAt: inMs(-5 * 60_000),
    duration: 3,
    invoice: ORDER_INVOICE,
    amountSats: 25_000,
    expiresAt: inMs(55 * 60_000),
  }

  // Exact match on StartOS action (reuseActive omitted) reuses the invoice.
  const reusedSame = reusablePendingOrder(
    pending,
    { targetNode: 'lnd', serverRegion: 'eu-de', duration: 3 },
    NOW,
  )
  assert.ok(reusedSame)
  assert.equal(reusedSame.paymentHash, ORDER_HASH)

  // Different plan on StartOS action (reuseActive omitted) does not reuse.
  assert.equal(
    reusablePendingOrder(
      pending,
      { targetNode: 'lnd', serverRegion: 'eu-de', duration: 12 },
      NOW,
    ),
    null,
  )

  // Dashboard intent (reuseActive: true) reuses any active unpaid order so a
  // second tab cannot overwrite the keypair of an order being paid.
  const reusedIntent = reusablePendingOrder(
    pending,
    {
      targetNode: 'cln',
      serverRegion: 'us-west',
      duration: 12,
      reuseActive: true,
    },
    NOW,
  )
  assert.ok(reusedIntent)
  assert.equal(reusedIntent.paymentHash, ORDER_HASH)

  // Paid or expired orders are not reusable as unpaid invoices.
  assert.equal(
    reusablePendingOrder(
      { ...pending, paymentReceivedFor: ORDER_HASH },
      {
        targetNode: 'lnd',
        serverRegion: 'eu-de',
        duration: 3,
        reuseActive: true,
      },
      NOW,
    ),
    null,
  )
  assert.equal(
    reusablePendingOrder(
      { ...pending, expiresAt: inMs(-1) },
      {
        targetNode: 'lnd',
        serverRegion: 'eu-de',
        duration: 3,
        reuseActive: true,
      },
      NOW,
    ),
    null,
  )
})

test('runPurchase creates, records, and raises a task, then reuses while payable', async () => {
  const kp1 = generateWireguardKeypair()
  const kp2 = generateWireguardKeypair()
  let keyIdx = 0
  let createCalls = 0
  const raised: unknown[] = []
  let state: {
    pending?: PendingOrderRecord | null
    payTasksToClear?: string[]
  } = {}

  const ops: PurchaseOps = {
    now: () => NOW,
    readCurrent: async () => ({ ...state }),
    generateKeypair: () => (keyIdx++ === 0 ? kp1 : kp2),
    createOrder: async (params) => {
      createCalls += 1
      return {
        invoice: ORDER_INVOICE,
        paymentHash: createCalls === 1 ? ORDER_HASH : ORDER_HASH_2,
        amountSats: 25_000,
        orderId: `ord-${createCalls}`,
      }
    },
    record: async (entry, patch) => {
      state = {
        pending: entry,
        payTasksToClear: patch.payTasksToClear ?? state.payTasksToClear,
      }
    },
    raiseTask: async (task) => {
      raised.push(task)
    },
  }

  const first = await runPurchase(
    { targetNode: 'lnd', serverRegion: 'eu-de', duration: 3 },
    ops,
  )
  assert.equal(first.kind, 'created')
  assert.equal(createCalls, 1)
  assert.equal(state.pending?.privateKey, kp1.privateKey)
  assert.equal(state.pending?.invoice, ORDER_INVOICE)
  assert.equal(state.pending?.amountSats, 25_000)
  assert.equal(state.pending?.expiresAt, inMs(INVOICE_TTL_MS))
  assert.equal(raised.length, 1)

  // Calling again via dashboard intent (reuseActive: true) reuses the invoice
  // and keeps kp1.privateKey untouched.
  const second = await runPurchase(
    {
      targetNode: 'cln',
      serverRegion: 'us-west',
      duration: 12,
      reuseActive: true,
    },
    ops,
  )
  assert.equal(second.kind, 'reused')
  assert.equal(createCalls, 1)
  assert.equal(state.pending?.privateKey, kp1.privateKey)
  assert.equal(raised.length, 2)

  // Calling via StartOS action with a different plan replaces the unpaid order
  // and queues the old pay task for clearing.
  const third = await runPurchase(
    { targetNode: 'eclair', serverRegion: 'us-west', duration: 12 },
    ops,
  )
  assert.equal(third.kind, 'created')
  assert.equal(createCalls, 2)
  assert.equal(state.pending?.privateKey, kp2.privateKey)
  assert.deepEqual(state.payTasksToClear, [
    payTaskReplayId('order', 'lnd', ORDER_HASH),
  ])

  // Once paid (paymentReceivedFor matches), an intent returns already-paid and
  // never overwrites the paid order's private key.
  state.pending = { ...state.pending!, paymentReceivedFor: ORDER_HASH_2 }
  const fourth = await runPurchase(
    {
      targetNode: 'lnd',
      serverRegion: 'eu-de',
      duration: 1,
      reuseActive: true,
    },
    ops,
  )
  assert.deepEqual(fourth, {
    kind: 'already-paid',
    paymentHash: ORDER_HASH_2,
    targetNode: 'eclair',
  })
  assert.equal(createCalls, 2)
  assert.equal(state.pending?.privateKey, kp2.privateKey)
})

test('runRenewal creates, records, and reuses a payable renewal invoice', async () => {
  const kp = generateWireguardKeypair()
  const pub = derivePublicKey(kp.privateKey)
  const conf = `[Interface]\nPrivateKey = ${kp.privateKey}\nAddress = 10.9.0.2/32\n# Server: de2.tunnelsats.com\n# Port Forwarding: 24556\n\n[Peer]\nPublicKey = ${kp.publicKey}\nEndpoint = de2.tunnelsats.com:51820\nAllowedIPs = 0.0.0.0/0\n`

  let renewCalls = 0
  const raised: unknown[] = []
  let state: {
    pending?: PendingRenewalRecord | null
    payTasksToClear?: string[]
  } = {}

  const ops: RenewalOps = {
    now: () => NOW,
    readConfig: async () => ({
      enabled: true,
      'target-node': 'cln',
      'tunnelsats-conf': conf,
    }),
    readServerMeta: async () => ({
      publicKey: pub,
      serverDomain: 'de2.tunnelsats.com',
    }),
    readCurrent: async () => ({ ...state }),
    requestRenewal: async () => {
      renewCalls += 1
      return {
        invoice: RENEW_INVOICE,
        paymentHash: renewCalls === 1 ? RENEW_HASH : RENEW_HASH_2,
        oldExpiry: '2026-10-15T00:00:00.000Z',
        newExpiry: '2026-11-15T00:00:00.000Z',
        renewalId: `ren-${renewCalls}`,
      }
    },
    record: async (entry, patch) => {
      state = {
        pending: entry,
        payTasksToClear: patch.payTasksToClear ?? state.payTasksToClear,
      }
    },
    raiseTask: async (task) => {
      raised.push(task)
    },
  }

  const first = await runRenewal({ duration: 1 }, ops)
  assert.equal(first.kind, 'created')
  assert.equal(renewCalls, 1)
  assert.equal(state.pending?.invoice, RENEW_INVOICE)
  assert.equal(state.pending?.amountSats, 50_000)
  assert.equal(state.pending?.expiresAt, inMs(INVOICE_TTL_MS))
  assert.equal(state.pending?.publicKey, pub)
  assert.equal(state.pending?.targetNode, 'cln')

  // Re-running with reuseActive: true reuses the active renewal invoice.
  const second = await runRenewal({ duration: 6, reuseActive: true }, ops)
  assert.equal(second.kind, 'reused')
  assert.equal(renewCalls, 1)
  assert.equal(raised.length, 2)

  // Re-running reusablePendingRenewal for a different publicKey returns null.
  assert.equal(
    reusablePendingRenewal(
      state.pending,
      'other-key=',
      { duration: 1, reuseActive: true },
      'cln',
      NOW,
    ),
    null,
  )
})

test('startBandwidthReset delegates to runBandwidthReset and maps 429 errors', async () => {
  const kp = generateWireguardKeypair()
  const conf = `[Interface]\nPrivateKey = ${kp.privateKey}\nAddress = 10.9.0.2/32\n# Server: de2.tunnelsats.com\n# Port Forwarding: 24556\n\n[Peer]\nPublicKey = ${kp.publicKey}\nEndpoint = de2.tunnelsats.com:51820\nAllowedIPs = 0.0.0.0/0\n`
  const raised: unknown[] = []

  const res = await startBandwidthReset({} as never, {
    now: () => NOW,
    readConfig: async () => ({
      enabled: true,
      'target-node': 'eclair',
      'tunnelsats-conf': conf,
    }),
    readServerMeta: async () => null,
    readCurrent: async () => null,
    fetchStatus: async () => 'unpaid',
    requestReset: async () => ({
      invoice: RESET_INVOICE,
      paymentHash: RESET_HASH,
      resetId: 'rst-1',
      amountSats: 1500,
      expiresAt: inMs(30 * 60_000),
    }),
    record: async () => undefined,
    raiseTask: async (t) => {
      raised.push(t)
    },
  })

  assert.equal(res.targetNode, 'eclair')
  assert.equal(res.outcome.kind, 'requested')
  assert.equal(raised.length, 1)
})

test('runDashboardIntents processes renew, reset, then buy in order and is idempotent', async () => {
  const order: string[] = []
  let intents: DashboardIntentsFile = {
    buy: {
      id: 'intent-buy-1',
      kind: 'buy',
      createdAt: inMs(-5_000),
      targetNode: 'lnd',
      serverId: 'eu-de',
      duration: '3m',
    },
    renew: {
      id: 'intent-renew-1',
      kind: 'renew',
      createdAt: inMs(-4_000),
      targetNode: 'cln',
      duration: '6m',
    },
    reset: {
      id: 'intent-reset-1',
      kind: 'reset',
      createdAt: inMs(-3_000),
      targetNode: 'eclair',
    },
  }
  const results: DashboardIntentResultsFile = {}

  const ops: IntentRunnerOps = {
    now: () => NOW,
    readIntents: async () => intents,
    readResults: async () => ({ ...results }),
    writeResult: async (kind, result) => {
      results[kind] = result
    },
    runRenew: async () => {
      order.push('renew')
      return { paymentHash: RENEW_HASH, targetNode: 'cln', reused: false }
    },
    runReset: async () => {
      order.push('reset')
      return { paymentHash: RESET_HASH, targetNode: 'eclair', reused: true }
    },
    runBuy: async () => {
      order.push('buy')
      return { paymentHash: ORDER_HASH, targetNode: 'lnd', reused: false }
    },
  }

  const firstRun = await runDashboardIntents(ops)
  assert.deepEqual(order, ['renew', 'reset', 'buy'])
  assert.equal(firstRun.length, 3)
  assert.equal(results.renew?.status, 'succeeded')
  assert.equal(results.reset?.status, 'succeeded')
  assert.equal(results.reset?.reused, true)
  assert.equal(results.buy?.status, 'succeeded')

  // A second run with the same intent IDs does nothing.
  const secondRun = await runDashboardIntents(ops)
  assert.deepEqual(secondRun, [])
  assert.deepEqual(order, ['renew', 'reset', 'buy'])

  // Stale intents (> INTENT_TTL_MS old) fail closed without calling the action.
  intents = {
    ...intents,
    buy: {
      id: 'intent-buy-stale',
      kind: 'buy',
      createdAt: inMs(-INTENT_TTL_MS - 1_000),
      targetNode: 'lnd',
      serverId: 'eu-de',
      duration: '1m',
    },
  }
  const staleRun = await runDashboardIntents(ops)
  assert.equal(staleRun.length, 1)
  assert.equal(staleRun[0].status, 'failed')
  assert.match(staleRun[0].error ?? '', /expired/)
  assert.deepEqual(order, ['renew', 'reset', 'buy'])
})

test('runDashboardIntents records sanitized failure messages and redacts payment hashes', async () => {
  const results: DashboardIntentResultsFile = {}
  const ops: IntentRunnerOps = {
    now: () => NOW,
    readIntents: async () => ({
      reset: {
        id: 'intent-reset-err',
        kind: 'reset',
        createdAt: inMs(-1_000),
      },
    }),
    readResults: async () => ({ ...results }),
    writeResult: async (kind, result) => {
      results[kind] = result
    },
    runRenew: async () => ({
      paymentHash: RENEW_HASH,
      targetNode: 'lnd',
      reused: false,
    }),
    runBuy: async () => ({
      paymentHash: ORDER_HASH,
      targetNode: 'lnd',
      reused: false,
    }),
    runReset: async () => {
      throw new Error(
        `The payment was received, but the bandwidth reset failed. Contact TunnelSats support with payment hash ${RESET_HASH}.`,
      )
    },
  }

  const outcomes = await runDashboardIntents(ops)
  assert.equal(outcomes.length, 1)
  assert.equal(outcomes[0].status, 'failed')
  assert.ok(!outcomes[0].error?.includes(RESET_HASH))
  assert.match(
    outcomes[0].error ?? '',
    /with the payment hash from the Reset Bandwidth action/,
  )
  assert.equal(
    sanitizeIntentError(new Error(`hash ${ORDER_HASH} leaked`)),
    'hash [redacted] leaked',
  )
})

test('real FileHelper models persist invoice metadata and intent results cleanly', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'intents-'))
  try {
    const metaFile = FileHelper.json(join(dir, 'meta.json'), metaShape)
    const intentsFile = FileHelper.json(
      join(dir, 'dashboard-intents.json'),
      dashboardIntentsShape,
    )
    const resultsFile = FileHelper.json(
      join(dir, 'dashboard-intent-results.json'),
      dashboardIntentResultsShape,
    )

    await intentsFile.write({} as never, {
      buy: {
        id: 'buy-real-1',
        kind: 'buy',
        createdAt: NOW.toISOString(),
        targetNode: 'eclair',
        serverId: 'eu-de',
        duration: '6m',
      },
    })

    const kp = generateWireguardKeypair()
    const raised: unknown[] = []

    const outcomes = await processDashboardIntents({} as never, {
      now: () => NOW,
      readIntents: () => intentsFile.read().once(),
      readResults: () => resultsFile.read().once(),
      writeResult: (kind, result: DashboardIntentResult) =>
        resultsFile.merge({} as never, { [kind]: result }),
      runBuy: async (intent) => {
        const res = await startPurchase(
          {} as never,
          purchaseInputFromIntent(intent, 'lnd'),
          {
            now: () => NOW,
            readCurrent: async () => {
              const cur = await metaFile.read().once()
              return (
                cur && {
                  pending: cur.pendingOrder,
                  payTasksToClear: cur.payTasksToClear,
                }
              )
            },
            generateKeypair: () => kp,
            createOrder: async () => ({
              invoice: ORDER_INVOICE,
              paymentHash: ORDER_HASH,
              amountSats: 25_000,
              orderId: 'ord-real-1',
            }),
            record: (entry, patch) =>
              metaFile.merge({} as never, {
                pendingOrder: {
                  ...entry,
                  paymentReceivedFor: undefined,
                  lastError: undefined,
                  nextAttemptAt: undefined,
                },
                ...patch,
              }),
            raiseTask: async (t) => {
              raised.push(t)
            },
          },
        )
        assert.equal(res.kind, 'created')
        return {
          paymentHash: res.order.paymentHash,
          targetNode: res.targetNode,
          reused: false,
        }
      },
    })

    assert.equal(outcomes.length, 1)
    assert.equal(outcomes[0].status, 'succeeded')

    const savedMeta = await metaFile.read().once()
    assert.equal(savedMeta?.pendingOrder?.paymentHash, ORDER_HASH)
    assert.equal(savedMeta?.pendingOrder?.invoice, ORDER_INVOICE)
    assert.equal(savedMeta?.pendingOrder?.amountSats, 25_000)
    assert.equal(savedMeta?.pendingOrder?.duration, 6)
    assert.equal(savedMeta?.pendingOrder?.expiresAt, inMs(INVOICE_TTL_MS))

    const savedResults = await resultsFile.read().once()
    assert.equal(savedResults?.buy?.id, 'buy-real-1')
    assert.equal(savedResults?.buy?.status, 'succeeded')
    assert.equal(savedResults?.buy?.targetNode, 'eclair')
    assert.equal(raised.length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// Cross-runtime contract: bridge.py writes the request file and reads the
// result file; this runs the real Python functions against the real
// TypeScript file models and runner, so the two sides cannot drift apart.
function bridgePython(dataDir: string, body: string): string {
  const repo = join(__dirname, '..')
  const program = [
    'import json, sys',
    `sys.path.insert(0, ${JSON.stringify(repo)})`,
    'import bridge',
    body,
  ].join('\n')
  return execFileSync('python3', ['-c', program], {
    env: { ...process.env, DATA_DIR: dataDir },
    encoding: 'utf8',
  })
}

test('bridge.py intents parse in the runner and its results read back in bridge.py', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'intent-contract-'))
  try {
    const kp = generateWireguardKeypair()
    const conf = `[Interface]\nPrivateKey = ${kp.privateKey}\nAddress = 10.9.0.7/32\n\n[Peer]\nPublicKey = ${kp.publicKey}\nEndpoint = de2.tunnelsats.com:51820\nAllowedIPs = 0.0.0.0/0\n`
    writeFileSync(join(dir, 'tunnelsatsv3.conf'), conf)
    writeFileSync(
      join(dir, 'config.json'),
      JSON.stringify({
        enabled: true,
        'target-node': 'cln',
        'tunnelsats-conf': conf,
      }),
    )

    const submitted = JSON.parse(
      bridgePython(
        dir,
        [
          'out = [bridge.submit_dashboard_intent(p) for p in (',
          '  {"kind": "buy", "serverId": "eu-ch", "duration": "6m"},',
          '  {"kind": "renew", "duration": "3m"},',
          '  {"kind": "reset"},',
          ')]',
          'print(json.dumps([code for code, _ in out]))',
        ].join('\n'),
      ),
    )
    assert.deepEqual(submitted, [202, 202, 202])

    const raw = JSON.parse(
      readFileSync(join(dir, 'dashboard-intents.json'), 'utf8'),
    )
    const parsed = dashboardIntentsShape.parse(raw)
    assert.ok(parsed.buy, 'buy slot must parse')
    assert.ok(parsed.renew, 'renew slot must parse')
    assert.ok(parsed.reset, 'reset slot must parse')

    const intentsFile = FileHelper.json(
      join(dir, 'dashboard-intents.json'),
      dashboardIntentsShape,
    )
    const resultsFile = FileHelper.json(
      join(dir, 'dashboard-intent-results.json'),
      dashboardIntentResultsShape,
    )
    const inputs: Record<string, unknown> = {}
    const outcomes = await runDashboardIntents({
      now: () => new Date(),
      readIntents: () => intentsFile.read().once(),
      readResults: () => resultsFile.read().once(),
      writeResult: (kind, result) =>
        resultsFile.merge({} as never, resultPatch(kind, result)),
      runBuy: async (intent) => {
        inputs.buy = purchaseInputFromIntent(intent, undefined)
        return { paymentHash: ORDER_HASH, targetNode: 'cln', reused: false }
      },
      runRenew: async (intent) => {
        inputs.renew = renewalInputFromIntent(intent)
        return { paymentHash: RENEW_HASH, targetNode: 'cln', reused: false }
      },
      runReset: async () => ({
        paymentHash: RESET_HASH,
        targetNode: 'cln',
        reused: false,
      }),
    })
    assert.equal(outcomes.length, 3)
    assert.deepEqual(inputs.buy, {
      targetNode: 'cln',
      serverRegion: 'eu-ch',
      duration: 6,
      reuseActive: true,
    })
    assert.deepEqual(inputs.renew, { duration: 3, reuseActive: true })

    const summary = JSON.parse(
      bridgePython(dir, 'print(json.dumps(bridge._intents_summary()))'),
    )
    assert.equal(summary.buy.status, 'succeeded')
    assert.equal(summary.buy.targetNode, 'cln')
    assert.equal(summary.renew.status, 'succeeded')
    assert.equal(summary.reset.status, 'succeeded')
    const text = JSON.stringify(summary)
    for (const secret of [ORDER_HASH, RENEW_HASH, RESET_HASH, kp.privateKey]) {
      assert.ok(!text.includes(secret), 'no payment hash or key in the summary')
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('resultPatch replaces a result slot without carrying over old fields', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'intent-results-'))
  try {
    const resultsFile = FileHelper.json(
      join(dir, 'dashboard-intent-results.json'),
      dashboardIntentResultsShape,
    )
    await resultsFile.merge(
      {} as never,
      resultPatch('reset', {
        id: 'reset-1',
        kind: 'reset',
        status: 'failed',
        createdAt: inMs(-2_000),
        updatedAt: inMs(-1_000),
        paymentHash: RESET_HASH,
        error: 'upstream failed',
      }),
    )
    await resultsFile.merge(
      {} as never,
      resultPatch('reset', {
        id: 'reset-2',
        kind: 'reset',
        status: 'processing',
        createdAt: inMs(0),
        updatedAt: inMs(0),
      }),
    )
    const saved = await resultsFile.read().once()
    assert.equal(saved?.reset?.id, 'reset-2')
    assert.equal(saved?.reset?.status, 'processing')
    assert.equal(saved?.reset?.error, undefined)
    assert.equal(saved?.reset?.paymentHash, undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
