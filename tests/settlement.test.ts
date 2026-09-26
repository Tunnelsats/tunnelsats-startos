import test from 'node:test'
import assert from 'node:assert/strict'
import {
  payTaskReplayId,
  runSettlementTick,
  type ExecResult,
  type SettlementOps,
} from '../startos/settlement'

const ok = (value: unknown): ExecResult => ({
  exitCode: 0,
  stdout: JSON.stringify(value),
  stderr: '',
})

const outcome = (
  result: string,
  message = `${result} message`,
  kind = 'order',
) => ({ kind, result, message, paymentHash: 'a'.repeat(64) })

/** Records every call so tests assert on what the tick really did. */
function fakeOps(
  settle: ExecResult | (() => Promise<ExecResult>),
  opts: {
    ack?: ExecResult
    failClear?: string[]
  } = {},
) {
  const calls = { cleared: [] as string[], acked: [] as string[][] }
  const ops: SettlementOps = {
    settle: typeof settle === 'function' ? settle : async () => settle,
    ack: async (ids) => {
      calls.acked.push(ids)
      return opts.ack ?? ok({ acknowledged: ids })
    },
    clearTask: async (id) => {
      if (opts.failClear?.includes(id)) throw new Error(`no ${id}`)
      calls.cleared.push(id)
    },
  }
  return { ops, calls }
}

test('payTaskReplayId matches the IDs bridge.py queues for clearing', () => {
  assert.equal(payTaskReplayId('order', 'lnd'), 'tunnelsats-order:lnd')
  assert.equal(payTaskReplayId('renewal', 'cln'), 'tunnelsats-renewal:cln')
  assert.equal(payTaskReplayId('order', 'eclair'), 'tunnelsats-order:eclair')
})

test('nothing pending is idle and touches no task', async () => {
  const { ops, calls } = fakeOps(
    ok({ outcomes: [], clearPayTasks: [], busy: false }),
  )
  assert.deepEqual(await runSettlementTick(ops), { state: 'idle' })
  assert.deepEqual(calls, { cleared: [], acked: [] })
})

test('a concurrent tick reports busy', async () => {
  const { ops } = fakeOps(ok({ outcomes: [], clearPayTasks: [], busy: true }))
  assert.deepEqual(await runSettlementTick(ops), { state: 'busy' })
})

test('a waiting payment reports its message', async () => {
  const { ops } = fakeOps(
    ok({
      outcomes: [outcome('waiting', 'Waiting for the invoice to be paid.')],
      clearPayTasks: [],
      busy: false,
    }),
  )
  assert.deepEqual(await runSettlementTick(ops), {
    state: 'waiting',
    message: 'Waiting for the invoice to be paid.',
  })
})

test('a settled payment clears its pay task, then acknowledges it', async () => {
  const { ops, calls } = fakeOps(
    ok({
      outcomes: [outcome('provisioned', 'The new tunnel was configured.')],
      clearPayTasks: ['tunnelsats-order:lnd'],
      busy: false,
    }),
  )
  assert.deepEqual(await runSettlementTick(ops), {
    state: 'settled',
    message: 'The new tunnel was configured.',
  })
  assert.deepEqual(calls.cleared, ['tunnelsats-order:lnd'])
  assert.deepEqual(calls.acked, [['tunnelsats-order:lnd']])
})

test('queued pay tasks from an earlier tick are cleared while idle', async () => {
  // The previous tick settled, then main restarted (config.json changed)
  // before clearTask ran.
  const { ops, calls } = fakeOps(
    ok({
      outcomes: [],
      clearPayTasks: ['tunnelsats-renewal:cln'],
      busy: false,
    }),
  )
  assert.deepEqual(await runSettlementTick(ops), { state: 'idle' })
  assert.deepEqual(calls.cleared, ['tunnelsats-renewal:cln'])
  assert.deepEqual(calls.acked, [['tunnelsats-renewal:cln']])
})

test('a pay task that could not be cleared is not acknowledged', async () => {
  const { ops, calls } = fakeOps(
    ok({
      outcomes: [outcome('renewed', 'The subscription was extended.')],
      clearPayTasks: ['tunnelsats-order:lnd', 'tunnelsats-renewal:lnd'],
      busy: false,
    }),
    { failClear: ['tunnelsats-order:lnd'] },
  )
  assert.deepEqual(await runSettlementTick(ops), {
    state: 'clearing-failed',
    error: 'no tunnelsats-order:lnd',
  })
  assert.deepEqual(calls.acked, [['tunnelsats-renewal:lnd']])
})

test('a failed acknowledgement is reported and retried next tick', async () => {
  const { ops } = fakeOps(
    ok({ outcomes: [], clearPayTasks: ['tunnelsats-order:lnd'], busy: false }),
    { ack: { exitCode: 1, stdout: '', stderr: 'Traceback\nOSError: disk\n' } },
  )
  assert.deepEqual(await runSettlementTick(ops), {
    state: 'clearing-failed',
    error: 'OSError: disk',
  })
})

test('a failed outcome wins over waiting and settled ones', async () => {
  const { ops } = fakeOps(
    ok({
      outcomes: [
        outcome('waiting'),
        outcome('failed', 'The claim has no valid vpnPort', 'renewal'),
      ],
      clearPayTasks: [],
      busy: false,
    }),
  )
  assert.deepEqual(await runSettlementTick(ops), {
    state: 'failed',
    error: 'The claim has no valid vpnPort',
  })
})

test('waiting wins over a settled outcome in the same tick', async () => {
  const { ops } = fakeOps(
    ok({
      outcomes: [outcome('expired'), outcome('waiting', 'w', 'renewal')],
      clearPayTasks: [],
      busy: false,
    }),
  )
  assert.deepEqual(await runSettlementTick(ops), {
    state: 'waiting',
    message: 'w',
  })
})

test('several settled outcomes are all reported', async () => {
  const { ops } = fakeOps(
    ok({
      outcomes: [outcome('provisioned', 'A.'), outcome('superseded', 'B.')],
      clearPayTasks: [],
      busy: false,
    }),
  )
  assert.deepEqual(await runSettlementTick(ops), {
    state: 'settled',
    message: 'A. B.',
  })
})

test('a crashed settle command fails with its last stderr line', async () => {
  const { ops, calls } = fakeOps({
    exitCode: 1,
    stdout: '',
    stderr: 'Traceback (most recent call last):\nPermissionError: meta\n',
  })
  assert.deepEqual(await runSettlementTick(ops), {
    state: 'failed',
    error: 'PermissionError: meta',
  })
  assert.deepEqual(calls, { cleared: [], acked: [] })
})

test('an exec that throws fails closed', async () => {
  const { ops } = fakeOps(async () => {
    throw new Error('subcontainer gone')
  })
  assert.deepEqual(await runSettlementTick(ops), {
    state: 'failed',
    error: 'subcontainer gone',
  })
})

for (const [name, stdout] of [
  ['not JSON', 'Traceback'],
  ['missing fields', '{"outcomes": []}'],
  ['non-string replay IDs', '{"outcomes":[],"clearPayTasks":[1],"busy":false}'],
  [
    'an unknown result',
    JSON.stringify({
      outcomes: [outcome('done')],
      clearPayTasks: [],
      busy: false,
    }),
  ],
] as const) {
  test(`unparsable settle output (${name}) fails closed and clears nothing`, async () => {
    const { ops, calls } = fakeOps({ exitCode: 0, stdout, stderr: '' })
    const status = await runSettlementTick(ops)
    assert.equal(status.state, 'failed')
    assert.deepEqual(calls, { cleared: [], acked: [] })
  })
}
