import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getDependenciesForConfig,
  getSubscriptionExpiryTask,
} from '../startos/dependencies'

test('getDependenciesForConfig returns empty object when disabled or unconfigured', () => {
  assert.deepEqual(getDependenciesForConfig(null), {})
  assert.deepEqual(getDependenciesForConfig({ enabled: false }), {})
  assert.deepEqual(
    getDependenciesForConfig({ enabled: false, 'target-node': 'cln' }),
    {},
  )
  assert.deepEqual(
    getDependenciesForConfig({ enabled: false, 'target-node': 'lnd' }),
    {},
  )
})

test('getDependenciesForConfig returns LND dependency when enabled and target-node is lnd', () => {
  const res = getDependenciesForConfig({ enabled: true, 'target-node': 'lnd' })
  assert.deepEqual(res, {
    lnd: {
      kind: 'running',
      versionRange: '>=0.15.5:0',
      healthChecks: ['lnd'],
    },
  })
})

test('getDependenciesForConfig returns c-lightning dependency when enabled and target-node is cln', () => {
  const res = getDependenciesForConfig({ enabled: true, 'target-node': 'cln' })
  assert.deepEqual(res, {
    'c-lightning': {
      kind: 'running',
      versionRange: '>=23.2.2:0',
      healthChecks: ['lightningd'],
    },
  })
})

test('getSubscriptionExpiryTask returns no task when disabled or unconfigured', () => {
  const resNull = getSubscriptionExpiryTask(null)
  assert.equal(resNull.shouldCreateTask, false)
  assert.equal(resNull.clearTaskKey, 'tunnelsats:configure')

  const resDisabled = getSubscriptionExpiryTask({
    enabled: false,
    'tunnelsats-conf': '[Interface]\n# Valid Until: 2026-08-25T12:00:00Z\n',
  })
  assert.equal(resDisabled.shouldCreateTask, false)
  assert.equal(resDisabled.clearTaskKey, 'tunnelsats:configure')
})

test('getSubscriptionExpiryTask returns no task when subscription has > 7 days remaining', () => {
  const currentDate = new Date('2026-08-20T12:00:00Z')
  const conf =
    '[Interface]\n# Valid Until: 2026-08-30T12:00:00Z\nPrivateKey=xxx\nAddress=10.9.0.1/32\n# VPNPort: 12345\n[Peer]\nEndpoint=1.2.3.4:51820'
  const res = getSubscriptionExpiryTask(
    { enabled: true, 'tunnelsats-conf': conf },
    null,
    currentDate,
  )
  assert.equal(res.shouldCreateTask, false)
  assert.equal(res.clearTaskKey, 'tunnelsats:configure')
})

test('getSubscriptionExpiryTask returns important task when subscription has <= 7 days remaining', () => {
  const currentDate = new Date('2026-08-20T12:00:00Z')
  const conf =
    '[Interface]\n# Valid Until: 2026-08-26T12:00:00Z\nPrivateKey=xxx\nAddress=10.9.0.1/32\n# VPNPort: 12345\n[Peer]\nEndpoint=1.2.3.4:51820'
  const res = getSubscriptionExpiryTask(
    { enabled: true, 'tunnelsats-conf': conf },
    null,
    currentDate,
  )
  assert.equal(res.shouldCreateTask, true)
  assert.equal(res.severity, 'important')
  assert.match(res.reason || '', /7 days/i)
})

test('getSubscriptionExpiryTask returns critical task when subscription has <= 3 days remaining', () => {
  const currentDate = new Date('2026-08-20T12:00:00Z')
  const conf =
    '[Interface]\n# Valid Until: 2026-08-22T12:00:00Z\nPrivateKey=xxx\nAddress=10.9.0.1/32\n# VPNPort: 12345\n[Peer]\nEndpoint=1.2.3.4:51820'
  const res = getSubscriptionExpiryTask(
    { enabled: true, 'tunnelsats-conf': conf },
    null,
    currentDate,
  )
  assert.equal(res.shouldCreateTask, true)
  assert.equal(res.severity, 'critical')
  assert.match(res.reason || '', /3 days/i)
})

test('getSubscriptionExpiryTask returns critical task when subscription is expired', () => {
  const currentDate = new Date('2026-08-20T12:00:00Z')
  const conf =
    '[Interface]\n# Valid Until: 2026-08-15T12:00:00Z\nPrivateKey=xxx\nAddress=10.9.0.1/32\n# VPNPort: 12345\n[Peer]\nEndpoint=1.2.3.4:51820'
  const res = getSubscriptionExpiryTask(
    { enabled: true, 'tunnelsats-conf': conf },
    null,
    currentDate,
  )
  assert.equal(res.shouldCreateTask, true)
  assert.equal(res.severity, 'critical')
  assert.match(res.reason || '', /expired/i)
})

test('getSubscriptionExpiryTask respects later renewed metadata over earlier static comment', () => {
  const currentDate = new Date('2026-08-20T12:00:00Z')
  const conf =
    '[Interface]\n# Valid Until: 2026-08-22T12:00:00Z\nPrivateKey=xxx\nAddress=10.9.0.1/32\n# VPNPort: 12345\n[Peer]\nEndpoint=1.2.3.4:51820'
  const meta = { expiresAt: '2026-09-20T12:00:00Z', syncSuccess: true }
  const res = getSubscriptionExpiryTask(
    { enabled: true, 'tunnelsats-conf': conf },
    meta,
    currentDate,
  )
  assert.equal(res.shouldCreateTask, false)
  assert.equal(res.clearTaskKey, 'tunnelsats:configure')
})

test('getSubscriptionExpiryTask respects newer configuration comment over stale expired metadata', () => {
  const currentDate = new Date('2026-08-20T12:00:00Z')
  // Stale meta on disk has expired date 2026-08-15, but newly pasted config has renewed expiry 2026-09-30
  const conf =
    '[Interface]\n# Valid Until: 2026-09-30T12:00:00Z\nPrivateKey=xxx\nAddress=10.9.0.1/32\n# VPNPort: 12345\n[Peer]\nEndpoint=1.2.3.4:51820'
  const staleMeta = {
    expiresAt: '2026-08-15T12:00:00Z',
    syncSuccess: false,
    syncError: 'Network error',
  }
  const res = getSubscriptionExpiryTask(
    { enabled: true, 'tunnelsats-conf': conf },
    staleMeta,
    currentDate,
  )
  assert.equal(res.shouldCreateTask, false)
  assert.equal(res.clearTaskKey, 'tunnelsats:configure')
})

test('getSubscriptionExpiryTask detects expiry from meta when config has no comment', () => {
  const currentDate = new Date('2026-08-20T12:00:00Z')
  const conf =
    '[Interface]\nPrivateKey=xxx\nAddress=10.9.0.1/32\n# VPNPort: 12345\n[Peer]\nEndpoint=1.2.3.4:51820'
  const meta = { expiresAt: '2026-08-22T12:00:00Z', syncSuccess: true }
  const res = getSubscriptionExpiryTask(
    { enabled: true, 'tunnelsats-conf': conf },
    meta,
    currentDate,
  )
  assert.equal(res.shouldCreateTask, true)
  assert.equal(res.severity, 'critical')
  assert.match(res.reason || '', /3 days/i)
})
