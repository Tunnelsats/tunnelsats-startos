import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, Server } from 'node:http'
import {
  fetchServers,
  createSubscriptionOrder,
  pollInvoiceSettlement,
  claimWireguardConfig,
  requestRenewal,
  fetchSubscriptionStatus,
  assembleWireguardConfig,
  MONTHLY_BANDWIDTH_LIMIT_GB,
} from '../startos/apiClient'

function startMockApiServer(): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`)
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
      })

      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json')

        // 1. GET /api/public/v1/servers
        if (req.method === 'GET' && url.pathname === '/api/public/v1/servers') {
          res.writeHead(200)
          res.end(
            JSON.stringify({
              servers: [
                {
                  id: 'eu-de',
                  country: 'Germany',
                  city: 'Frankfurt',
                  flag: '🇩🇪',
                  status: 'online',
                },
                {
                  id: 'us-east',
                  country: 'United States',
                  city: 'New York',
                  flag: '🇺🇸',
                  status: 'online',
                },
              ],
            }),
          )
          return
        }

        // 2. POST /api/public/v1/subscription/create
        if (
          req.method === 'POST' &&
          url.pathname === '/api/public/v1/subscription/create'
        ) {
          const parsed = JSON.parse(body)
          if (parsed.serverId === 'eu-de') {
            res.writeHead(200)
            res.end(
              JSON.stringify({
                invoice: 'lnbc250u1p3xyz...',
                paymentHash:
                  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                amountSats: 25000,
                orderId: 'order-uuid-1234',
              }),
            )
          } else {
            res.writeHead(400)
            res.end(
              JSON.stringify({
                error: 'INVALID_SERVER',
                message: 'Unknown server',
              }),
            )
          }
          return
        }

        // 3. GET /api/public/v1/subscription/:hash
        if (
          req.method === 'GET' &&
          url.pathname.startsWith('/api/public/v1/subscription/')
        ) {
          const hash = url.pathname.replace('/api/public/v1/subscription/', '')
          if (hash === 'paid-hash') {
            res.writeHead(200)
            res.end(JSON.stringify({ paymentHash: hash, status: 'paid' }))
          } else if (hash === 'processing-hash') {
            res.writeHead(202)
            res.end(
              JSON.stringify({
                paymentHash: hash,
                status: 'processing',
                message: 'Provisioning in progress',
              }),
            )
          } else {
            res.writeHead(200)
            res.end(JSON.stringify({ paymentHash: hash, status: 'unpaid' }))
          }
          return
        }

        // 4. POST /api/public/v1/subscription/claim
        if (
          req.method === 'POST' &&
          url.pathname === '/api/public/v1/subscription/claim'
        ) {
          const parsed = JSON.parse(body)
          if (parsed.paymentHash === 'paid-hash') {
            res.writeHead(200)
            res.end(
              JSON.stringify({
                status: 'success',
                subscriptionEnd: '2026-10-15T00:00:00.000Z',
                server: {
                  endpoint: 'de2.tunnelsats.com:51820',
                  publicKey: 'serverPubkeyBase6412345678901234567890123456=',
                  allowedIPs: '0.0.0.0/0',
                },
                peer: {
                  address: '10.9.0.102/32',
                  presharedKey: 'pskBase64Key12345678901234567890123456789012=',
                },
                vpnPort: 24556,
              }),
            )
          } else {
            res.writeHead(402)
            res.end(
              JSON.stringify({
                error: 'PAYMENT_REQUIRED',
                message: 'Invoice not paid yet',
              }),
            )
          }
          return
        }

        // 5. POST /api/public/v1/subscription/renew
        if (
          req.method === 'POST' &&
          url.pathname === '/api/public/v1/subscription/renew'
        ) {
          res.writeHead(200)
          res.end(
            JSON.stringify({
              invoice: 'lnbc500u1renew...',
              paymentHash: 'renew-hash-1234',
              oldExpiry: '2026-10-15T00:00:00.000Z',
              newExpiry: '2026-11-15T00:00:00.000Z',
              renewalId: 'renew-uuid-5678',
            }),
          )
          return
        }

        // 6. POST /api/public/v1/subscription/status
        if (
          req.method === 'POST' &&
          url.pathname === '/api/public/v1/subscription/status'
        ) {
          const parsed = JSON.parse(body)
          if (parsed.wgPublicKey === 'known-pubkey') {
            res.writeHead(200)
            res.end(
              JSON.stringify({
                expiry: '2026-12-31T23:59:59.000Z',
                bandwidth_used_gb: 42.75,
                status: 'enabled',
                server_domain: 'de2.tunnelsats.com',
                last_synced_at: '2026-09-18T20:00:00.000Z',
              }),
            )
          } else {
            res.writeHead(404)
            res.end(
              JSON.stringify({
                error: 'RESOURCE_NOT_FOUND',
                message: 'No subscription found for this key',
              }),
            )
          }
          return
        }

        res.writeHead(404)
        res.end(JSON.stringify({ error: 'NOT_FOUND' }))
      })
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any
      resolve({ server, url: `http://127.0.0.1:${addr.port}` })
    })
  })
}

test('fetchServers retrieves list of available VPN servers', async () => {
  const { server, url } = await startMockApiServer()
  try {
    const servers = await fetchServers(url)
    assert.equal(servers.length, 2)
    assert.equal(servers[0].id, 'eu-de')
    assert.equal(servers[0].country, 'Germany')
    assert.equal(servers[1].id, 'us-east')
  } finally {
    server.close()
  }
})

test('createSubscriptionOrder returns valid invoice and payment hash', async () => {
  const { server, url } = await startMockApiServer()
  try {
    const order = await createSubscriptionOrder(
      { serverId: 'eu-de', duration: 1 },
      url,
    )
    assert.equal(order.amountSats, 25000)
    assert.ok(order.invoice.startsWith('lnbc'))
    assert.equal(order.paymentHash.length, 64)
  } finally {
    server.close()
  }
})

test('pollInvoiceSettlement tracks unpaid, processing, and paid states', async () => {
  const { server, url } = await startMockApiServer()
  try {
    const unpaid = await pollInvoiceSettlement('unpaid-hash', url)
    assert.equal(unpaid.status, 'unpaid')

    const processing = await pollInvoiceSettlement('processing-hash', url)
    assert.equal(processing.status, 'processing')

    const paid = await pollInvoiceSettlement('paid-hash', url)
    assert.equal(paid.status, 'paid')
  } finally {
    server.close()
  }
})

test('claimWireguardConfig provisions and assembles complete client WireGuard configuration', async () => {
  const { server, url } = await startMockApiServer()
  try {
    const privKey = 'myPrivateKeyBase641234567890123456789012345='
    const pubKey = 'myPublicKeyBase6412345678901234567890123456='

    const result = await claimWireguardConfig(
      {
        paymentHash: 'paid-hash',
        wgPublicKey: pubKey,
        wgPrivateKey: privKey,
      },
      url,
    )

    assert.equal(result.subscriptionEnd, '2026-10-15T00:00:00.000Z')
    assert.equal(result.vpnIp, '10.9.0.102/32')
    assert.equal(result.vpnPort, 24556)
    assert.match(result.fullConfig, /\[Interface\]/)
    assert.match(result.fullConfig, /PrivateKey = myPrivateKeyBase64/)
    assert.match(result.fullConfig, /# VPNPort: 24556/)
    assert.match(result.fullConfig, /\[Peer\]/)
    assert.match(result.fullConfig, /Endpoint = de2\.tunnelsats\.com:51820/)
  } finally {
    server.close()
  }
})

test('requestRenewal submits renewal and returns invoice', async () => {
  const { server, url } = await startMockApiServer()
  try {
    const renewal = await requestRenewal(
      {
        serverId: 'eu-de',
        duration: 1,
        wgPublicKey: 'myPubkey',
      },
      url,
    )

    assert.ok(renewal.invoice.startsWith('lnbc'))
    assert.equal(renewal.renewalId, 'renew-uuid-5678')
    assert.equal(renewal.newExpiry, '2026-11-15T00:00:00.000Z')
  } finally {
    server.close()
  }
})

test('fetchSubscriptionStatus retrieves usage telemetry with 100GB monthly limit', async () => {
  const { server, url } = await startMockApiServer()
  try {
    const status = await fetchSubscriptionStatus('known-pubkey', url)

    assert.equal(status.status, 'enabled')
    assert.equal(status.bandwidth_used_gb, 42.75)
    assert.equal(status.bandwidth_limit_gb, MONTHLY_BANDWIDTH_LIMIT_GB)
    assert.equal(status.bandwidth_limit_gb, 100)
    assert.equal(status.server_domain, 'de2.tunnelsats.com')
  } finally {
    server.close()
  }
})

test('fetchSubscriptionStatus throws descriptive error when key not found', async () => {
  const { server, url } = await startMockApiServer()
  try {
    await assert.rejects(
      () => fetchSubscriptionStatus('unknown-pubkey', url),
      /HTTP 404.*No subscription found for this key/,
    )
  } finally {
    server.close()
  }
})

test('assembleWireguardConfig builds syntactically valid configuration', () => {
  const conf = assembleWireguardConfig(
    {
      server: {
        endpoint: 'de2.tunnelsats.com:51820',
        publicKey: 'serverPublicKeyBase641234567890123456789012=',
        allowedIPs: '0.0.0.0/0',
      },
      peer: {
        address: '10.9.0.55/32',
        presharedKey: 'pskKeyBase641234567890123456789012345678901=',
      },
      subscriptionEnd: '2026-12-31T23:59:59.000Z',
      vpnPort: 32100,
    },
    'clientPrivateKeyBase641234567890123456789012=',
  )

  assert.match(conf, /PrivateKey = clientPrivateKeyBase64/)
  assert.match(conf, /Address = 10\.9\.0\.55\/32/)
  assert.match(conf, /# VPNPort: 32100/)
  assert.match(conf, /# Valid Until: 2026-12-31T23:59:59\.000Z/)
  assert.match(conf, /# Server: de2\.tunnelsats\.com/)
  assert.match(conf, /PresharedKey = pskKeyBase64/)
})
