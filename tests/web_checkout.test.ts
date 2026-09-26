import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'

/**
 * Runs the real web/script.js in a VM context with a stub DOM and fetch, so
 * the checkout's trust boundary is tested on the shipped code.
 */
const SCRIPT = readFileSync(join(__dirname, '..', 'web', 'script.js'), 'utf8')

const PRIV = 'cHJpdmF0ZUtleUJhc2U2NDEyMzQ1Njc4OTAxMjM0NTY3OA='
const PUB = 'cHVibGljS2V5QmFzZTY0MTIzNDU2Nzg5MDEyMzQ1Njc4OQ='
const SERVER_PUB = 'c2VydmVyUHViQmFzZTY0MTIzNDU2Nzg5MDEyMzQ1Njc4OQ='
const PSK = 'cHNrQmFzZTY0MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY='
const HASH = 'b'.repeat(64)

type Json = Record<string, any>
type Route = (body: Json | null) => { status: number; body: Json }

function claim(overrides: Json = {}): Json {
  return {
    status: 'success',
    subscriptionEnd: '2026-10-26T12:00:00.000Z',
    server: {
      endpoint: 'de2.tunnelsats.com:51820',
      publicKey: SERVER_PUB,
      allowedIPs: '0.0.0.0/0, ::/0',
    },
    peer: { address: '10.9.0.7/32', publicKey: PUB, presharedKey: PSK },
    vpnPort: 24556,
    fullConfig: null,
    ...overrides,
  }
}

function loadCheckout(routes: Record<string, Route>) {
  const requests: { url: string; body: Json | null }[] = []
  const timeouts: (() => unknown)[] = []
  const elements: Record<string, Json> = {
    'select-server': { value: 'eu-de' },
  }
  const element = (id: string) =>
    (elements[id] ??= {
      value: '',
      textContent: '',
      className: '',
      dataset: {},
      style: {},
      classList: { add() {}, remove() {}, toggle() {} },
      showModal() {},
      close() {},
      addEventListener() {},
    })
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {}, info() {} },
    document: {
      hidden: true,
      getElementById: element,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {},
    },
    window: { addEventListener() {} },
    alert() {},
    setInterval: () => 0,
    clearInterval() {},
    setTimeout: (fn: () => unknown) => {
      timeouts.push(fn)
      return 0
    },
    btoa,
    fetch: async (url: string, init: Json = {}) => {
      const body = init.body ? JSON.parse(init.body) : null
      requests.push({ url, body })
      const route = routes[url]
      // Status and pricing polls at load time never answer.
      if (!route) return new Promise(() => {})
      const res = route(body)
      return {
        ok: res.status >= 200 && res.status < 300,
        status: res.status,
        json: async () => res.body,
      }
    },
  })
  vm.runInContext(SCRIPT, context)
  return {
    context: context as Json,
    requests,
    timeouts,
    status: () => element('payment-status-text').textContent as string,
    saved: () =>
      requests.filter((r) => r.url === '/api/config/save').map((r) => r.body),
  }
}

const CLAIM_URL = 'https://tunnelsats.com/api/public/v1/subscription/claim'
const CREATE_URL = 'https://tunnelsats.com/api/public/v1/subscription/create'
const SAVE_OK: Route = () => ({ status: 200, body: { success: true } })

test('checkout registers the generated public key with the order', async () => {
  const web = loadCheckout({
    '/api/keys/generate': () => ({
      status: 200,
      body: { private_key: PRIV, public_key: PUB },
    }),
    [CREATE_URL]: () => ({
      status: 200,
      body: { invoice: 'lnbc1', paymentHash: HASH, amountSats: 1000 },
    }),
  })
  await web.context.startCheckout()
  const create = web.requests.find((r) => r.url === CREATE_URL)
  assert.equal(create?.body?.wgPublicKey, PUB)
})

test('a claim is assembled with the local key; fullConfig is never used', async () => {
  const web = loadCheckout({
    [CLAIM_URL]: () => ({
      status: 200,
      body: claim({
        fullConfig: '[Interface]\nPrivateKey = SERVER_HELD\nPostUp = evil\n',
      }),
    }),
    '/api/config/save': SAVE_OK,
  })
  await web.context.claimAndSaveConfig(HASH, {
    privateKey: PRIV,
    publicKey: PUB,
  })
  const [saved] = web.saved()
  assert.ok(saved, web.status())
  assert.match(saved.config, new RegExp(`PrivateKey = ${PRIV}`))
  assert.match(saved.config, /# VPNPort: 24556/)
  assert.match(saved.config, new RegExp(`PresharedKey = ${PSK}`))
  assert.doesNotMatch(saved.config, /SERVER_HELD|PostUp/)
})

for (const [name, body, error] of [
  [
    'for another key',
    claim({ peer: { address: '10.9.0.7/32', publicKey: SERVER_PUB } }),
    /different WireGuard key/,
  ],
  [
    'without the key echo',
    claim({ peer: { address: '10.9.0.7/32' } }),
    /different WireGuard key/,
  ],
  ['without a VPN port', claim({ vpnPort: undefined }), /VPN port/],
  ['with a non-integer VPN port', claim({ vpnPort: '24556' }), /VPN port/],
  [
    'with a field that injects config lines',
    claim({
      server: {
        endpoint: 'de2.tunnelsats.com:51820\nPostUp = evil',
        publicKey: SERVER_PUB,
      },
    }),
    /malformed/,
  ],
  [
    'without a server key',
    claim({ server: { endpoint: 'de2.tunnelsats.com:51820' } }),
    /malformed/,
  ],
] as const) {
  test(`a claim ${name} fails closed with the payment hash`, async () => {
    const web = loadCheckout({
      [CLAIM_URL]: () => ({ status: 200, body }),
      '/api/config/save': SAVE_OK,
    })
    await web.context.claimAndSaveConfig(HASH, {
      privateKey: PRIV,
      publicKey: PUB,
    })
    assert.deepEqual(web.saved(), [])
    assert.match(web.status(), error)
    assert.match(web.status(), new RegExp(HASH))
  })
}

test('a claim still being provisioned is retried, not saved', async () => {
  let provisioning = true
  const web = loadCheckout({
    [CLAIM_URL]: () =>
      provisioning
        ? { status: 202, body: { status: 'processing' } }
        : { status: 200, body: claim() },
    '/api/config/save': SAVE_OK,
  })
  await web.context.claimAndSaveConfig(HASH, {
    privateKey: PRIV,
    publicKey: PUB,
  })
  assert.deepEqual(web.saved(), [])
  assert.equal(web.timeouts.length, 1)

  provisioning = false
  await web.timeouts[0]()
  assert.equal(web.saved().length, 1)
})

test('provisioning retries give up with the payment hash', async () => {
  const web = loadCheckout({
    [CLAIM_URL]: () => ({ status: 202, body: { status: 'processing' } }),
    '/api/config/save': SAVE_OK,
  })
  await web.context.claimAndSaveConfig(HASH, {
    privateKey: PRIV,
    publicKey: PUB,
  })
  for (let i = 0; i < 100 && i < web.timeouts.length; i++) {
    await web.timeouts[i]()
  }
  assert.ok(web.timeouts.length < 100, 'retries must be bounded')
  assert.deepEqual(web.saved(), [])
  assert.match(web.status(), new RegExp(HASH))
})
