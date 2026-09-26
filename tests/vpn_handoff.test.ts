import test from 'node:test'
import assert from 'node:assert/strict'
import {
  planClearnetVpnTasks,
  readNodeVpnState,
  executeClearnetVpnPlan,
  nextStateAfter,
  buildOnTaskInput,
  buildOffTaskInput,
  type ClearnetVpnPlan,
} from '../startos/vpnHandoff'

const CONF =
  '[Interface]\nPrivateKey = x\n[Peer]\nEndpoint = de2.tunnelsats.com:51820\n'
const ALL_INSTALLED = ['lnd', 'c-lightning', 'eclair']
const ALL_OFF = { lnd: 'off', 'c-lightning': 'off', eclair: 'off' } as const

function desired(
  targetPackage: 'lnd' | 'c-lightning' | 'eclair',
  announceEndpoint: string | null = 'de2.tunnelsats.com:24556',
) {
  return { targetPackage, announceEndpoint, wgConf: CONF }
}

// --- bootstrap (no handoff record: fresh install, upgrade, unreadable file)

test('bootstrap: nodes without a tunnel are retired and the target gets its on-task at once', () => {
  const plan = planClearnetVpnTasks({
    desired: desired('lnd'),
    state: null,
    installed: ALL_INSTALLED,
    nodeVpn: ALL_OFF,
  })
  assert.deepEqual(plan.on, {
    packageId: 'lnd',
    config: CONF,
    announce: 'de2.tunnelsats.com:24556',
  })
  assert.equal(plan.held, null)
  assert.deepEqual(plan.off, [])
  assert.deepEqual(plan.retire, ['c-lightning', 'eclair'])
  assert.deepEqual(plan.next, { activeTarget: 'lnd', pendingOff: [] })
})

test('bootstrap: a node that already runs a tunnel is asked to turn off first', () => {
  // e.g. a box upgraded from a build that handed out clearnet-vpn tasks
  // before the handoff record existed.
  const plan = planClearnetVpnTasks({
    desired: desired('c-lightning'),
    state: null,
    installed: ALL_INSTALLED,
    nodeVpn: { lnd: 'on', eclair: 'off' },
  })
  assert.equal(plan.on, null)
  assert.deepEqual(plan.held, {
    packageId: 'c-lightning',
    waitingFor: ['lnd'],
  })
  assert.deepEqual(plan.off, ['lnd'])
  assert.deepEqual(plan.retire, ['eclair'])
  assert.deepEqual(plan.next, { activeTarget: null, pendingOff: ['lnd'] })
})

test('bootstrap: a VPN TunnelSats did not configure is left alone and does not block activation', () => {
  const plan = planClearnetVpnTasks({
    desired: desired('lnd'),
    state: null,
    installed: ALL_INSTALLED,
    nodeVpn: { 'c-lightning': 'foreign', eclair: 'off' },
  })
  assert.equal(plan.on?.packageId, 'lnd')
  assert.equal(plan.held, null)
  assert.deepEqual(plan.off, [])
  assert.deepEqual(plan.retire, ['c-lightning', 'eclair'])
})

test('a tracked node that now runs a foreign VPN is no longer ours to turn off', () => {
  const plan = planClearnetVpnTasks({
    desired: desired('c-lightning'),
    state: { activeTarget: null, pendingOff: ['lnd'] },
    installed: ALL_INSTALLED,
    nodeVpn: { lnd: 'foreign' },
  })
  assert.equal(plan.on?.packageId, 'c-lightning')
  assert.deepEqual(plan.off, [])
  assert.deepEqual(plan.retire, ['lnd'])
})

test('bootstrap: a node whose state cannot be read holds the on-task (fail closed)', () => {
  const plan = planClearnetVpnTasks({
    desired: desired('lnd'),
    state: null,
    installed: ['lnd', 'eclair'],
    nodeVpn: {},
  })
  assert.equal(plan.on, null)
  assert.deepEqual(plan.off, ['eclair'])
})

test('bootstrap with TunnelSats off and no node tunnels leaves nothing behind', () => {
  const plan = planClearnetVpnTasks({
    desired: null,
    state: null,
    installed: ALL_INSTALLED,
    nodeVpn: ALL_OFF,
  })
  assert.equal(plan.on, null)
  assert.deepEqual(plan.off, [])
  assert.deepEqual(plan.next, { activeTarget: null, pendingOff: [] })
})

// --- tracked transitions

test('first activation with an empty record raises the on-task on the target only', () => {
  const plan = planClearnetVpnTasks({
    desired: desired('lnd'),
    state: { activeTarget: null, pendingOff: [] },
    installed: ALL_INSTALLED,
    nodeVpn: {},
  })
  assert.equal(plan.on?.packageId, 'lnd')
  assert.deepEqual(plan.off, [])
  assert.deepEqual(plan.retire, [])
  assert.deepEqual(plan.next, { activeTarget: 'lnd', pendingOff: [] })
})

test('switching nodes raises the off-task on the previous node and holds the new on-task', () => {
  const plan = planClearnetVpnTasks({
    desired: desired('c-lightning'),
    state: { activeTarget: 'lnd', pendingOff: [] },
    installed: ALL_INSTALLED,
    nodeVpn: { lnd: 'on' },
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

test('the held on-task is raised once the previous node is off', () => {
  const plan = planClearnetVpnTasks({
    desired: desired('c-lightning'),
    state: { activeTarget: null, pendingOff: ['lnd'] },
    installed: ALL_INSTALLED,
    nodeVpn: { lnd: 'off' },
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
    nodeVpn: {},
  })
  assert.equal(plan.on?.packageId, 'c-lightning')
  assert.deepEqual(plan.retire, ['lnd'])
})

test('a previous node whose state cannot be read keeps holding the on-task (fail closed)', () => {
  // Covers a stopped or still-initializing node: started before turning its
  // tunnel off, it would bring the tunnel back up next to the new node.
  const plan = planClearnetVpnTasks({
    desired: desired('c-lightning'),
    state: { activeTarget: 'lnd', pendingOff: [] },
    installed: ALL_INSTALLED,
    nodeVpn: { lnd: 'unknown' },
  })
  assert.equal(plan.on, null)
  assert.deepEqual(plan.held, { packageId: 'c-lightning', waitingFor: ['lnd'] })
  assert.deepEqual(plan.off, ['lnd'])
})

test('an already-active target is never held (the owing node stays tracked)', () => {
  const plan = planClearnetVpnTasks({
    desired: desired('c-lightning'),
    state: { activeTarget: 'c-lightning', pendingOff: ['lnd'] },
    installed: ALL_INSTALLED,
    nodeVpn: { lnd: 'on' },
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
    nodeVpn: { eclair: 'on' },
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
    nodeVpn: { lnd: 'on' },
  })
  assert.equal(plan.on, null)
  assert.deepEqual(plan.off, ['lnd'])
  assert.deepEqual(plan.next, { activeTarget: null, pendingOff: ['lnd'] })
})

test('an uninstalled pending node is retired (its tunnel went with it)', () => {
  const plan = planClearnetVpnTasks({
    desired: desired('c-lightning'),
    state: { activeTarget: 'lnd', pendingOff: ['eclair'] },
    installed: ['c-lightning', 'lnd'],
    nodeVpn: { lnd: 'on' },
  })
  assert.deepEqual(plan.off, ['lnd'])
  assert.deepEqual(plan.retire, ['eclair'])
  assert.deepEqual(plan.next.pendingOff, ['lnd'])
})

test('switching back to a node that owes an off waits for the other node, then hands it the on-task', () => {
  const held = planClearnetVpnTasks({
    desired: desired('lnd'),
    state: { activeTarget: 'c-lightning', pendingOff: ['lnd'] },
    installed: ALL_INSTALLED,
    nodeVpn: { 'c-lightning': 'on', lnd: 'on' },
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
    nodeVpn: { 'c-lightning': 'off' },
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
    nodeVpn: { lnd: 'on' },
  })
  assert.equal(plan.on?.packageId, 'lnd')
  assert.deepEqual(plan.off, [])
  assert.deepEqual(plan.next, { activeTarget: 'lnd', pendingOff: [] })
})

test('switching away and back before the previous node turned off never forces an off/on cycle', () => {
  // lnd runs the tunnel; the operator picks c-lightning, then lnd again
  // before lnd accepted its off-task.
  const away = planClearnetVpnTasks({
    desired: desired('c-lightning'),
    state: { activeTarget: 'lnd', pendingOff: [] },
    installed: ALL_INSTALLED,
    nodeVpn: { lnd: 'on' },
  })
  assert.equal(away.on, null)
  assert.deepEqual(away.next, { activeTarget: null, pendingOff: ['lnd'] })

  const back = planClearnetVpnTasks({
    desired: desired('lnd'),
    state: away.next,
    installed: ALL_INSTALLED,
    nodeVpn: { lnd: 'on' },
  })
  // lnd is the target again: its off-task is replaced by the on-task (same
  // replay id) at once, and c-lightning never received anything.
  assert.equal(back.on?.packageId, 'lnd')
  assert.equal(back.held, null)
  assert.deepEqual(back.off, [])
  assert.deepEqual(back.retire, [])
  assert.deepEqual(back.next, { activeTarget: 'lnd', pendingOff: [] })
})

test('duplicate and malformed state entries are normalised', () => {
  const plan = planClearnetVpnTasks({
    desired: null,
    state: {
      activeTarget: 'lnd',
      pendingOff: ['lnd', 'lnd', 'eclair', 'bogus' as never],
    },
    installed: ALL_INSTALLED,
    nodeVpn: {},
  })
  assert.deepEqual(plan.off, ['lnd', 'eclair'])
})

// --- contract helpers

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

test('readNodeVpnState only claims TunnelSats-owned tunnels, unknown when unreadable', () => {
  const OWN =
    '[Interface]\nPrivateKey = OWNKEY=\n[Peer]\nEndpoint = 203.0.113.7:51820\n'
  const conf = (key: string, endpoint: string) =>
    `[Interface]\nPrivateKey = ${key}\nAddress = 10.9.0.2/32\n[Peer]\nEndpoint = ${endpoint}\n`
  // TunnelSats endpoint, any key (e.g. a previous subscription's key)
  assert.equal(
    readNodeVpnState(
      { config: conf('OLDKEY=', 'de2.tunnelsats.com:51820') },
      OWN,
    ),
    'on',
  )
  assert.equal(
    readNodeVpnState(
      { config: conf('OLDKEY=', 'DE2.TunnelSats.com:51820') },
      null,
    ),
    'on',
  )
  // Our current key, even behind a bare IP endpoint
  assert.equal(
    readNodeVpnState({ config: conf('OWNKEY=', '203.0.113.7:51820') }, OWN),
    'on',
  )
  // Someone else's VPN
  assert.equal(
    readNodeVpnState({ config: conf('OTHER=', 'vpn.example.com:51820') }, OWN),
    'foreign',
  )
  assert.equal(
    readNodeVpnState(
      { config: conf('OTHER=', 'eviltunnelsats.com:51820') },
      OWN,
    ),
    'foreign',
  )
  assert.equal(
    readNodeVpnState({ config: conf('OTHER=', '[2001:db8::1]:51820') }, OWN),
    'foreign',
  )
  // A commented-out key never matches
  assert.equal(
    readNodeVpnState(
      {
        config: '# PrivateKey = OWNKEY=\n[Peer]\nEndpoint = 203.0.113.7:51820',
      },
      OWN,
    ),
    'foreign',
  )
  assert.equal(readNodeVpnState({ config: null, announce: null }, OWN), 'off')
  assert.equal(readNodeVpnState({ config: '   ' }, OWN), 'off')
  assert.equal(readNodeVpnState({}, OWN), 'off')
  assert.equal(readNodeVpnState(null, OWN), 'unknown')
  assert.equal(readNodeVpnState(undefined, OWN), 'unknown')
  assert.equal(readNodeVpnState({ config: 42 }, OWN), 'unknown')
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

test('nextStateAfter keeps a node whose task clear failed queued for a retry', () => {
  const plan: ClearnetVpnPlan = {
    on: { packageId: 'c-lightning', config: CONF, announce: 'h:1' },
    held: null,
    off: ['eclair'],
    retire: ['lnd'],
    next: { activeTarget: 'c-lightning', pendingOff: ['eclair'] },
  }
  assert.deepEqual(
    nextStateAfter(plan, {
      raised: ['c-lightning', 'eclair'],
      cleared: [],
      failures: [{ packageId: 'lnd', op: 'clear', error: 'boom' }],
    }),
    { activeTarget: 'c-lightning', pendingOff: ['eclair', 'lnd'] },
  )
  // Raise failures need no bookkeeping: the node is already pending (off)
  // or the target (on), so the next run raises it again.
  assert.deepEqual(
    nextStateAfter(plan, {
      raised: [],
      cleared: ['lnd'],
      failures: [
        { packageId: 'c-lightning', op: 'on', error: 'x' },
        { packageId: 'eclair', op: 'off', error: 'y' },
      ],
    }),
    plan.next,
  )
})
