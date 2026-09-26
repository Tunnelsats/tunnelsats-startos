import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getDependenciesForConfig,
  getSubscriptionExpiryTask,
  getConfirmedExpiry,
} from '../startos/dependencies'
import { generateWireguardKeypair } from '../startos/keygen'

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

test('getDependenciesForConfig keeps nodes with a pending off-task as exists dependencies', () => {
  // StartOS hides tasks on packages that are not current dependencies, so a
  // node that still owes us a confirmed "off" must stay declared.
  const res = getDependenciesForConfig(
    { enabled: true, 'target-node': 'cln' },
    ['lnd'],
  )
  assert.deepEqual(res, {
    'c-lightning': {
      kind: 'running',
      versionRange: '>=23.2.2:0',
      healthChecks: ['lightningd'],
    },
    lnd: { kind: 'exists', versionRange: '>=0.15.5:0' },
  })

  const disabled = getDependenciesForConfig({ enabled: false }, ['eclair'])
  assert.deepEqual(disabled, {
    eclair: { kind: 'exists', versionRange: '>=0.10.0:0' },
  })
})

// ---------------------------------------------------------------------------
// Expiry: only the API-confirmed expiry for the *current* key drives tasks.
// The `# Valid Until` comment is a hint and must never extend an expiry.
// ---------------------------------------------------------------------------

const NOW = new Date('2026-08-20T12:00:00Z')
const keys = generateWireguardKeypair()
const otherKeys = generateWireguardKeypair()

function confWith(comment: string | null, privateKey = keys.privateKey) {
  return [
    '[Interface]',
    `PrivateKey = ${privateKey}`,
    'Address = 10.9.0.1/32',
    ...(comment ? [`# Valid Until: ${comment}`] : []),
    '# VPNPort: 12345',
    '[Peer]',
    'PublicKey = bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb=',
    'Endpoint = de2.tunnelsats.com:51820',
    '',
  ].join('\n')
}

function confirmed(expiresAt: string, publicKey = keys.publicKey) {
  return {
    expiresAt,
    expirySource: 'api' as const,
    publicKey,
    syncSuccess: true,
  }
}

test('getSubscriptionExpiryTask returns no task when disabled or unconfigured', () => {
  const resNull = getSubscriptionExpiryTask(null)
  assert.equal(resNull.shouldCreateTask, false)
  assert.equal(resNull.clearTaskKey, 'tunnelsats:renew-subscription')

  const resDisabled = getSubscriptionExpiryTask(
    { enabled: false, 'tunnelsats-conf': confWith('2026-08-15T12:00:00Z') },
    confirmed('2026-08-15T12:00:00Z'),
    NOW,
  )
  assert.equal(resDisabled.shouldCreateTask, false)
})

test('getSubscriptionExpiryTask ignores the # Valid Until comment when nothing is confirmed', () => {
  const res = getSubscriptionExpiryTask(
    { enabled: true, 'tunnelsats-conf': confWith('2026-08-15T12:00:00Z') },
    null,
    NOW,
  )
  assert.equal(res.shouldCreateTask, false)
})

test('getSubscriptionExpiryTask returns no task when the confirmed expiry is > 7 days away', () => {
  const res = getSubscriptionExpiryTask(
    { enabled: true, 'tunnelsats-conf': confWith(null) },
    confirmed('2026-08-30T12:00:00Z'),
    NOW,
  )
  assert.equal(res.shouldCreateTask, false)
  assert.equal(res.clearTaskKey, 'tunnelsats:renew-subscription')
})

test('getSubscriptionExpiryTask raises an important Renew task at <= 7 days', () => {
  const res = getSubscriptionExpiryTask(
    { enabled: true, 'tunnelsats-conf': confWith(null) },
    confirmed('2026-08-26T12:00:00Z'),
    NOW,
  )
  assert.equal(res.shouldCreateTask, true)
  assert.equal(res.severity, 'important')
  assert.match(res.reason || '', /7 days/i)
  assert.match(res.reason || '', /Renew Subscription/)
})

// Expiry tasks are own tasks. StartOS stops the owning service while an own
// task is active *and critical*, which would halt the API sync that confirms a
// renewal and clears the task (deadlock), so every expiry task is important.
test('getSubscriptionExpiryTask raises an important Renew task at <= 3 days', () => {
  const res = getSubscriptionExpiryTask(
    { enabled: true, 'tunnelsats-conf': confWith(null) },
    confirmed('2026-08-22T12:00:00Z'),
    NOW,
  )
  assert.equal(res.shouldCreateTask, true)
  assert.equal(res.severity, 'important')
  assert.match(res.reason || '', /3 days/i)
  assert.match(res.reason || '', /Renew Subscription/)
})

test('getSubscriptionExpiryTask raises a lapse task, saying traffic is held', () => {
  const res = getSubscriptionExpiryTask(
    { enabled: true, 'tunnelsats-conf': confWith(null) },
    confirmed('2026-08-15T12:00:00Z'),
    NOW,
  )
  assert.equal(res.shouldCreateTask, true)
  assert.equal(res.severity, 'important')
  assert.match(res.reason || '', /expired/i)
  assert.match(res.reason || '', /holds its clearnet traffic/i)
  assert.match(res.reason || '', /Renew Subscription/)
})

test('getSubscriptionExpiryTask never extends a confirmed lapse on the strength of a later comment', () => {
  const res = getSubscriptionExpiryTask(
    { enabled: true, 'tunnelsats-conf': confWith('2026-12-31T12:00:00Z') },
    confirmed('2026-08-15T12:00:00Z'),
    NOW,
  )
  assert.equal(res.shouldCreateTask, true)
  assert.match(res.reason || '', /expired/i)
})

test('getSubscriptionExpiryTask uses the confirmed expiry even when the comment is earlier', () => {
  const res = getSubscriptionExpiryTask(
    { enabled: true, 'tunnelsats-conf': confWith('2026-08-15T12:00:00Z') },
    confirmed('2026-09-30T12:00:00Z'),
    NOW,
  )
  assert.equal(res.shouldCreateTask, false)
})

test("getSubscriptionExpiryTask does not apply another key's confirmed expiry", () => {
  // A newly imported config has a different key; the old key's expiry is
  // meaningless for it until the API has answered for the new key.
  const res = getSubscriptionExpiryTask(
    {
      enabled: true,
      'tunnelsats-conf': confWith(null, otherKeys.privateKey),
    },
    confirmed('2026-08-15T12:00:00Z'),
    NOW,
  )
  assert.equal(res.shouldCreateTask, false)
})

test('getConfirmedExpiry rejects unconfirmed, legacy, malformed and foreign-key metadata', () => {
  const conf = confWith(null)
  assert.equal(getConfirmedExpiry(conf, null), null)
  // Legacy meta written before provenance was tracked (possibly comment-seeded).
  assert.equal(
    getConfirmedExpiry(conf, {
      expiresAt: '2026-09-30T12:00:00Z',
      syncSuccess: true,
    }),
    null,
  )
  assert.equal(getConfirmedExpiry(conf, { ...confirmed('not-a-date') }), null)
  assert.equal(
    getConfirmedExpiry(
      conf,
      confirmed('2026-09-30T12:00:00Z', otherKeys.publicKey),
    ),
    null,
  )
  assert.equal(
    getConfirmedExpiry(
      '[Interface]\nPrivateKey = garbage\n',
      confirmed('2026-09-30T12:00:00Z'),
    ),
    null,
  )
  assert.equal(
    getConfirmedExpiry(conf, confirmed('2026-09-30T12:00:00Z'))?.toISOString(),
    '2026-09-30T12:00:00.000Z',
  )
})
