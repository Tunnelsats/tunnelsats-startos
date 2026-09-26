import test from 'node:test'
import assert from 'node:assert/strict'
import {
  planClearnetVpnTasks,
  readOffTaskState,
  executeClearnetVpnPlan,
  buildOnTaskInput,
  buildOffTaskInput,
  EMPTY_HANDOFF_STATE,
  type ClearnetVpnPlan,
} from '../startos/vpnHandoff'

const CONF =
  '[Interface]\nPrivateKey = x\n[Peer]\nEndpoint = de2.tunnelsats.com:51820\n'
const ALL_INSTALLED = ['lnd', 'c-lightning', 'eclair']

function desired(
  targetPackage: 'lnd' | 'c-lightning' | 'eclair',
  announceEndpoint: string | null = 'de2.tunnelsats.com:24556',
) {
  return { targetPackage, announceEndpoint, wgConf: CONF }
}

test('no subscription and no prior handoff: nothing to raise', () => {
  const plan = planClearnetVpnTasks({
    desired: null,
    state: null,
    installed: ALL_INSTALLED,
    offTaskStates: {},
  })
  assert.equal(plan.on, null)
  assert.deepEqual(plan.off, [])
  assert.deepEqual(plan.retire, [])
  assert.deepEqual(plan.next, EMPTY_HANDOFF_STATE)
})

test('first activation raises the on-task on the target only', () => {
  const plan = planClearnetVpnTasks({
    desired: desired('lnd'),
    state: null,
    installed: ALL_INSTALLED,
    offTaskStates: {},
  })
  assert.deepEqual(plan.on, {
    packageId: 'lnd',
    config: CONF,
    announce: 'de2.tunnelsats.com:24556',
  })
  assert.deepEqual(plan.off, [])
  assert.deepEqual(plan.next, { activeTarget: 'lnd', pendingOff: [] })
})

test('switching nodes raises the off-task on the previous node and holds the new on-task', () => {
  const plan = planClearnetVpnTasks({
    desired: desired('c-lightning'),
    state: { activeTarget: 'lnd', pendingOff: [] },
    installed: ALL_INSTALLED,
    // The previous node still carries our satisfied ON-task; that must not
    // be mistaken for a satisfied off-task on a fresh transition.
    offTaskStates: { lnd: 'satisfied' },
  })
  // lnd still runs the tunnel: raising c-lightning's on-task now would let
  // both nodes run the same WireGuard key.
  assert.equal(plan.on, null)
  assert.deepEqual(plan.held, {
    packageId: 'c-lightning',
    waitingFor: ['lnd'],
  })
  assert.deepEqual(plan.off, ['lnd'])
  assert.deepEqual(plan.retire, [])
  assert.deepEqual(plan.next, { activeTarget: null, pendingOff: ['lnd'] })
})

test('the held on-task is raised once the previous node confirms off', () => {
  const plan = planClearnetVpnTasks({
    desired: desired('c-lightning'),
    state: { activeTarget: null, pendingOff: ['lnd'] },
    installed: ALL_INSTALLED,
    offTaskStates: { lnd: 'satisfied' },
  })
  assert.equal(plan.on?.packageId, 'c-lightning')
  assert.equal(plan.held, null)
  assert.deepEqual(plan.retire, ['lnd'])
  assert.deepEqual(plan.next, {
    activeTarget: 'c-lightning',
    pendingOff: [],
  })
})

test('the held on-task is raised when the previous node is uninstalled', () => {
  const plan = planClearnetVpnTasks({
    desired: desired('c-lightning'),
    state: { activeTarget: null, pendingOff: ['lnd'] },
    installed: ['c-lightning'],
    offTaskStates: {},
  })
  assert.equal(plan.on?.packageId, 'c-lightning')
  assert.deepEqual(plan.retire, ['lnd'])
})

test('a stopped previous node still holds the on-task (it could start with its tunnel)', () => {
  // Fail closed: a stopped node that has not accepted its off-task would
  // bring the tunnel back up when started, next to the new node.
  const plan = planClearnetVpnTasks({
    desired: desired('c-lightning'),
    state: { activeTarget: 'lnd', pendingOff: [] },
    installed: ALL_INSTALLED,
    offTaskStates: {},
  })
  assert.equal(plan.on, null)
  assert.deepEqual(plan.held, { packageId: 'c-lightning', waitingFor: ['lnd'] })
  assert.deepEqual(plan.off, ['lnd'])
})

test('an already-active target is never held (it keeps being tracked for a later off)', () => {
  const plan = planClearnetVpnTasks({
    desired: desired('c-lightning'),
    state: { activeTarget: 'c-lightning', pendingOff: ['lnd'] },
    installed: ALL_INSTALLED,
    offTaskStates: { lnd: 'active' },
  })
  assert.equal(plan.on?.packageId, 'c-lightning')
  assert.deepEqual(plan.next, {
    activeTarget: 'c-lightning',
    pendingOff: ['lnd'],
  })
})

test('turning the subscription off raises the off-task on the active node', () => {
  const plan = planClearnetVpnTasks({
    desired: null,
    state: { activeTarget: 'eclair', pendingOff: [] },
    installed: ALL_INSTALLED,
    offTaskStates: {},
  })
  assert.equal(plan.on, null)
  assert.deepEqual(plan.off, ['eclair'])
  assert.deepEqual(plan.next, { activeTarget: null, pendingOff: ['eclair'] })
})

test('a config that cannot be announced is handed over as off, never as a half-configured tunnel', () => {
  const plan = planClearnetVpnTasks({
    desired: desired('lnd', null),
    state: { activeTarget: 'lnd', pendingOff: [] },
    installed: ALL_INSTALLED,
    offTaskStates: {},
  })
  assert.equal(plan.on, null)
  assert.deepEqual(plan.off, ['lnd'])
  assert.deepEqual(plan.next, { activeTarget: null, pendingOff: ['lnd'] })
})

test('a pending off-task stays raised until the node confirms it is off', () => {
  for (const s of ['active', 'unknown'] as const) {
    const plan = planClearnetVpnTasks({
      desired: desired('c-lightning'),
      state: { activeTarget: 'c-lightning', pendingOff: ['lnd'] },
      installed: ALL_INSTALLED,
      offTaskStates: { lnd: s },
    })
    assert.deepEqual(plan.off, ['lnd'], `state ${s}`)
    assert.deepEqual(plan.retire, [], `state ${s}`)
    assert.deepEqual(plan.next.pendingOff, ['lnd'], `state ${s}`)
  }
})

test('a satisfied pending off-task is retired and its task cleared', () => {
  const plan = planClearnetVpnTasks({
    desired: desired('c-lightning'),
    state: { activeTarget: 'c-lightning', pendingOff: ['lnd'] },
    installed: ALL_INSTALLED,
    offTaskStates: { lnd: 'satisfied' },
  })
  assert.deepEqual(plan.off, [])
  assert.deepEqual(plan.retire, ['lnd'])
  assert.deepEqual(plan.next, {
    activeTarget: 'c-lightning',
    pendingOff: [],
  })
})

test('an uninstalled pending node is retired (its tunnel went with it)', () => {
  const plan = planClearnetVpnTasks({
    desired: desired('c-lightning'),
    state: { activeTarget: 'lnd', pendingOff: ['eclair'] },
    installed: ['c-lightning', 'lnd'],
    offTaskStates: {},
  })
  assert.deepEqual(plan.off, ['lnd'])
  assert.deepEqual(plan.retire, ['eclair'])
  assert.deepEqual(plan.next.pendingOff, ['lnd'])
})

test('switching back to a node with a pending off-task replaces it with the on-task once the other node is off', () => {
  const held = planClearnetVpnTasks({
    desired: desired('lnd'),
    state: { activeTarget: 'c-lightning', pendingOff: ['lnd'] },
    installed: ALL_INSTALLED,
    offTaskStates: { lnd: 'active' },
  })
  assert.equal(held.on, null)
  assert.deepEqual(held.off, ['c-lightning'])
  assert.deepEqual(held.next, {
    activeTarget: null,
    pendingOff: ['c-lightning'],
  })

  const released = planClearnetVpnTasks({
    desired: desired('lnd'),
    state: held.next,
    installed: ALL_INSTALLED,
    offTaskStates: { 'c-lightning': 'satisfied' },
  })
  assert.equal(released.on?.packageId, 'lnd')
  assert.deepEqual(released.retire, ['c-lightning'])
  assert.deepEqual(released.next, { activeTarget: 'lnd', pendingOff: [] })
})

test('re-enabling the node that owes an off hands it the on-task directly', () => {
  const plan = planClearnetVpnTasks({
    desired: desired('lnd'),
    state: { activeTarget: null, pendingOff: ['lnd'] },
    installed: ALL_INSTALLED,
    offTaskStates: { lnd: 'active' },
  })
  assert.equal(plan.on?.packageId, 'lnd')
  assert.deepEqual(plan.off, [])
  assert.deepEqual(plan.next, { activeTarget: 'lnd', pendingOff: [] })
})

test('duplicate and malformed state entries are normalised', () => {
  const plan = planClearnetVpnTasks({
    desired: null,
    state: {
      activeTarget: 'lnd',
      pendingOff: ['lnd', 'lnd', 'eclair'],
    },
    installed: ALL_INSTALLED,
    offTaskStates: {},
  })
  assert.deepEqual(plan.off, ['lnd', 'eclair'])
})

test('task inputs follow the node clearnet-vpn contract', () => {
  assert.deepEqual(buildOnTaskInput(CONF, 'h:1'), {
    kind: 'partial',
    accept: [{ config: CONF, announce: 'h:1' }],
    set: { config: CONF, announce: 'h:1' },
  })
  // An empty config turns the node's VPN off (lnd/cln/eclair clearnet-vpn).
  assert.deepEqual(buildOffTaskInput(), {
    kind: 'partial',
    accept: [{ config: null }],
    set: { config: null, announce: null },
  })
})

test('readOffTaskState only trusts entries that carry our off input', () => {
  const offEntry = (active: boolean) => ({
    active,
    task: { input: buildOffTaskInput() },
  })
  const onEntry = {
    active: false,
    task: { input: buildOnTaskInput(CONF, 'h:1') },
  }
  assert.equal(readOffTaskState(undefined), 'unknown')
  assert.equal(readOffTaskState(offEntry(true)), 'active')
  assert.equal(readOffTaskState(offEntry(false)), 'satisfied')
  assert.equal(readOffTaskState(onEntry), 'unknown')
  assert.equal(readOffTaskState({ active: false, task: {} }), 'unknown')
})

test('executeClearnetVpnPlan raises on/off, clears retired, and reports failures separately', async () => {
  const calls: string[] = []
  const plan: ClearnetVpnPlan = {
    on: { packageId: 'c-lightning', config: CONF, announce: 'h:1' },
    held: null,
    off: ['lnd', 'eclair'],
    retire: ['eclair'],
    next: { activeTarget: 'c-lightning', pendingOff: ['lnd', 'eclair'] },
  }
  const outcome = await executeClearnetVpnPlan(plan, {
    raiseOn: async (on) => {
      calls.push(`on:${on.packageId}`)
    },
    raiseOff: async (pkg) => {
      calls.push(`off:${pkg}`)
      if (pkg === 'eclair') throw new Error('boom')
    },
    clear: async (pkg) => {
      calls.push(`clear:${pkg}`)
    },
  })
  assert.deepEqual(calls, [
    'on:c-lightning',
    'off:lnd',
    'off:eclair',
    'clear:eclair',
  ])
  assert.deepEqual(outcome.raised, ['c-lightning', 'lnd'])
  assert.deepEqual(outcome.cleared, ['eclair'])
  assert.equal(outcome.failures.length, 1)
  assert.equal(outcome.failures[0].packageId, 'eclair')
  assert.equal(outcome.failures[0].op, 'off')
})
