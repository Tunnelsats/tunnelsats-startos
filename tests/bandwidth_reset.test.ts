import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, Server } from 'node:http'
import { ApiHttpError, requestBandwidthReset } from '../startos/apiClient'

const HASH = 'b'.repeat(64)
const INVOICE =
  'lnbc12340n1pjresetqpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq'
const EXPIRES = '2026-10-01T10:00:00.000Z'

const GOOD = {
  invoice: INVOICE,
  paymentHash: HASH,
  resetId: 'reset-uuid-1',
  amountSats: 1234,
  amountUsd: '1.00',
  expiresAt: EXPIRES,
  currentUsagePercent: '75.3',
  resetsThisMonth: 1,
  maxResetsPerMonth: 2,
}

/** One scripted answer for the next bandwidth-reset request. */
let reply: { status: number; body: unknown } = { status: 200, body: GOOD }
let lastRequest: { method?: string; path: string; body: unknown } | null = null

function startMock(): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        lastRequest = {
          method: req.method,
          path: new URL(req.url || '/', 'http://x').pathname,
          body: body ? JSON.parse(body) : null,
        }
        res.setHeader('Content-Type', 'application/json')
        res.writeHead(reply.status)
        res.end(JSON.stringify(reply.body))
      })
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      resolve({ server, url: `http://127.0.0.1:${port}` })
    })
  })
}

async function withMock<T>(fn: (url: string) => Promise<T>): Promise<T> {
  const { server, url } = await startMock()
  try {
    return await fn(url)
  } finally {
    server.close()
  }
}

const PARAMS = { wgPublicKey: 'pubkey=', serverId: 'eu-de' }

test('requestBandwidthReset posts the key and server and returns the validated order', async () => {
  reply = { status: 200, body: GOOD }
  const order = await withMock((url) => requestBandwidthReset(PARAMS, url))
  assert.deepEqual(lastRequest, {
    method: 'POST',
    path: '/api/public/v1/subscription/bandwidth-reset',
    body: PARAMS,
  })
  assert.deepEqual(order, {
    invoice: INVOICE,
    paymentHash: HASH,
    resetId: 'reset-uuid-1',
    amountSats: 1234,
    expiresAt: EXPIRES,
    currentUsagePercent: 75.3,
    resetsThisMonth: 1,
    maxResetsPerMonth: 2,
  })
})

test('requestBandwidthReset tolerates missing display-only fields', async () => {
  const { currentUsagePercent, resetsThisMonth, maxResetsPerMonth, ...rest } =
    GOOD
  void currentUsagePercent
  void resetsThisMonth
  void maxResetsPerMonth
  reply = { status: 200, body: rest }
  const order = await withMock((url) => requestBandwidthReset(PARAMS, url))
  assert.equal(order.currentUsagePercent, undefined)
  assert.equal(order.resetsThisMonth, undefined)
  assert.equal(order.maxResetsPerMonth, undefined)
})

// Each of these is kept on the device and handed to the Lightning node, or
// decides whether an invoice may be shown again: never trust them unchecked.
const MALFORMED: [string, Record<string, unknown>][] = [
  ['a non-BOLT11 invoice', { invoice: 'not-an-invoice' }],
  ['an invoice with a newline', { invoice: `${INVOICE}\nx` }],
  ['a missing invoice', { invoice: undefined }],
  ['a short payment hash', { paymentHash: 'abc' }],
  ['a non-hex payment hash', { paymentHash: 'z'.repeat(64) }],
  ['an empty reset ID', { resetId: '' }],
  ['a numeric reset ID', { resetId: 7 }],
  ['a zero amount', { amountSats: 0 }],
  ['a fractional amount', { amountSats: 1.5 }],
  ['an amount as text', { amountSats: '1234' }],
  // Without its expiry the invoice cannot be safely shown again, and only a
  // backend that reports typed reset status returns it.
  ['a missing expiry', { expiresAt: undefined }],
  ['an unparseable expiry', { expiresAt: 'soon' }],
  ['an expiry without a time zone', { expiresAt: '2026-10-01T10:00:00' }],
]

for (const [name, patch] of MALFORMED) {
  test(`requestBandwidthReset rejects ${name}`, async () => {
    reply = { status: 200, body: { ...GOOD, ...patch } }
    await assert.rejects(
      withMock((url) => requestBandwidthReset(PARAMS, url)),
      /bandwidth reset/i,
    )
  })
}

for (const status of [400, 404, 429, 503]) {
  test(`requestBandwidthReset surfaces HTTP ${status} as ApiHttpError`, async () => {
    reply = {
      status,
      // The backend's errorResponse shape.
      body: { error: 'INVALID_INPUT', message: `backend says ${status}` },
    }
    await assert.rejects(
      withMock((url) => requestBandwidthReset(PARAMS, url)),
      (e: unknown) =>
        e instanceof ApiHttpError &&
        e.status === status &&
        e.apiMessage === `backend says ${status}` &&
        e.message.startsWith(`HTTP ${status} from `),
    )
  })
}
