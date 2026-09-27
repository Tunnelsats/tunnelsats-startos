import { isIP } from 'node:net'
export const DEFAULT_API_BASE = 'https://tunnelsats.com'
export const MONTHLY_BANDWIDTH_LIMIT_GB = 100

export interface ServerInfo {
  id: string
  country: string
  city: string
  flag: string
  status: string
}

export interface SubscriptionOrder {
  invoice: string
  paymentHash: string
  amountSats: number
  orderId: string
}

export interface OrderStatus {
  paymentHash: string
  status: 'unpaid' | 'processing' | 'paid'
  message?: string
}

export interface SubscriptionStatus {
  expiry: string
  bandwidth_used_gb: number
  bandwidth_limit_gb: number
  status: 'enabled' | 'disabled'
  server_domain: string
  last_synced_at: string | null
}

export interface ClaimResult {
  fullConfig: string
  subscriptionEnd: string
  endpoint: string
  serverPublicKey: string
  vpnIp: string
  vpnPort?: number
}

export interface RenewalOrder {
  invoice: string
  paymentHash: string
  oldExpiry: string
  newExpiry: string
  renewalId: string
}

export interface BandwidthResetOrder {
  invoice: string
  paymentHash: string
  resetId: string
  amountSats: number
  /** When the invoice expires; until then it also holds a monthly reset. */
  expiresAt: string
  /** Display only. */
  currentUsagePercent?: number
  resetsThisMonth?: number
  maxResetsPerMonth?: number
}

/**
 * A non-2xx answer from the TunnelSats API. The message keeps the historic
 * `HTTP <status> from <url>: <message>` form; `status` and `apiMessage` let
 * callers explain specific answers.
 */
export class ApiHttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly apiMessage: string,
  ) {
    super(`HTTP ${status} from ${url}: ${apiMessage}`)
    this.name = 'ApiHttpError'
  }
}

async function fetchJsonWithStatus<T>(
  url: string,
  options: RequestInit = {},
  timeoutMs = 15000,
): Promise<{ status: number; data: T }> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TunnelSats-StartOS/0.4.0',
        ...(options.headers || {}),
      },
    })

    if (!response.ok && response.status !== 202) {
      let errorBody = ''
      try {
        const errorJson = await response.json()
        errorBody =
          errorJson.message || errorJson.error || JSON.stringify(errorJson)
      } catch {
        errorBody = await response.text().catch(() => '')
      }
      throw new ApiHttpError(
        response.status,
        url,
        String(errorBody || response.statusText),
      )
    }

    return { status: response.status, data: (await response.json()) as T }
  } finally {
    clearTimeout(id)
  }
}

/**
 * Helper to make JSON HTTP requests with timeout.
 */
async function fetchJson<T>(
  url: string,
  options: RequestInit = {},
  timeoutMs = 15000,
): Promise<T> {
  return (await fetchJsonWithStatus<T>(url, options, timeoutMs)).data
}

/**
 * Retrieves the list of available TunnelSats VPN servers and regions.
 */
export async function fetchServers(
  baseUrl = DEFAULT_API_BASE,
): Promise<ServerInfo[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/public/v1/servers`
  const data = await fetchJson<{ servers: ServerInfo[] }>(url, {
    method: 'GET',
  })
  return data.servers || []
}

/**
 * Submits an order for a new WireGuard subscription and returns the BOLT11 invoice.
 * `wgPublicKey` is the on-device key the tunnel is provisioned for; its
 * private key never leaves the server.
 */
export async function createSubscriptionOrder(
  params: {
    serverId: string
    duration: number
    wgPublicKey: string
    referralCode?: string
  },
  baseUrl = DEFAULT_API_BASE,
): Promise<SubscriptionOrder> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/public/v1/subscription/create`
  return await fetchJson<SubscriptionOrder>(url, {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

/**
 * Polls payment settlement status for a given payment hash.
 */
export async function pollInvoiceSettlement(
  paymentHash: string,
  baseUrl = DEFAULT_API_BASE,
): Promise<OrderStatus> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/public/v1/subscription/${paymentHash}`
  return await fetchJson<OrderStatus>(url, { method: 'GET' })
}

// Claim field validation, mirroring bridge.py (assemble_claimed_config).
const WG_KEY_RE = /^[A-Za-z0-9+/]{43}=$/
const HOSTNAME_RE =
  /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/

const isWgKey = (v: unknown): v is string =>
  typeof v === 'string' && WG_KEY_RE.test(v)

function isEndpoint(v: unknown): v is string {
  if (typeof v !== 'string') return false
  const parts = v.split(':')
  if (parts.length !== 2) return false
  const [host, port] = parts
  return (
    HOSTNAME_RE.test(host) &&
    /^\d{1,5}$/.test(port) &&
    Number(port) >= 1 &&
    Number(port) <= 65535
  )
}

/** An IP address or network with an optional prefix length. */
function isIpWithPrefix(v: unknown): v is string {
  if (typeof v !== 'string') return false
  const [ip, prefix, ...rest] = v.split('/')
  const family = isIP(ip)
  if (rest.length || family === 0) return false
  if (prefix === undefined) return true
  return /^\d{1,3}$/.test(prefix) && Number(prefix) <= (family === 4 ? 32 : 128)
}

/**
 * Assembles a standard WireGuard .conf file from server claim data and the
 * local private key. Throws instead of guessing: vpnPort must be an integer
 * port (no endpoint fallback), and every value must be well-formed, so a
 * response can neither inject lines (a PostUp) nor yield a config that
 * cannot form a tunnel.
 */
export function assembleWireguardConfig(
  claimData: {
    server: {
      endpoint: string
      publicKey: string
      allowedIPs?: string
      dns?: string
    }
    peer: {
      address: string
      presharedKey?: string
    }
    subscriptionEnd?: string
    vpnPort?: number
  },
  privateKey: string,
): string {
  const vpnPort = claimData.vpnPort
  if (
    typeof vpnPort !== 'number' ||
    !Number.isInteger(vpnPort) ||
    vpnPort < 1 ||
    vpnPort > 65535
  ) {
    throw new Error('The claim has no valid VPN port.')
  }
  const server = claimData.server ?? ({} as Partial<typeof claimData.server>)
  const peer = claimData.peer ?? ({} as Partial<typeof claimData.peer>)
  const allowedIPs = server.allowedIPs ?? '0.0.0.0/0'
  const valid =
    isEndpoint(server.endpoint) &&
    isWgKey(server.publicKey) &&
    isIpWithPrefix(peer.address) &&
    typeof allowedIPs === 'string' &&
    allowedIPs.split(',').every((n) => isIpWithPrefix(n.trim())) &&
    (peer.presharedKey == null || isWgKey(peer.presharedKey)) &&
    (claimData.subscriptionEnd == null ||
      (typeof claimData.subscriptionEnd === 'string' &&
        !/[\r\n]/.test(claimData.subscriptionEnd) &&
        !Number.isNaN(Date.parse(claimData.subscriptionEnd))))
  if (!valid) {
    throw new Error('The claim is incomplete or malformed.')
  }
  const endpoint = server.endpoint as string
  const serverDomain = endpoint.split(':')[0]

  const lines: string[] = [
    '[Interface]',
    `PrivateKey = ${privateKey}`,
    `Address = ${peer.address}`,
  ]

  if (claimData.subscriptionEnd) {
    lines.push(`# Valid Until: ${claimData.subscriptionEnd}`)
  }
  lines.push(`# VPNPort: ${vpnPort}`)
  lines.push(`# Server: ${serverDomain}`)

  lines.push('')
  lines.push('[Peer]')
  lines.push(`PublicKey = ${server.publicKey}`)
  lines.push(`Endpoint = ${endpoint}`)
  lines.push(`AllowedIPs = ${allowedIPs}`)

  if (peer.presharedKey != null) {
    lines.push(`PresharedKey = ${peer.presharedKey}`)
  }

  return lines.join('\n') + '\n'
}

/**
 * Claims the provisioned WireGuard configuration once payment is settled.
 * Only a claim provisioned for `wgPublicKey` is accepted; the config is
 * built from its structured fields and `wgPrivateKey`. A server-supplied
 * `fullConfig` is never used.
 */
export async function claimWireguardConfig(
  params: {
    paymentHash: string
    wgPublicKey: string
    wgPrivateKey: string
    referralCode?: string
  },
  baseUrl = DEFAULT_API_BASE,
): Promise<ClaimResult> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/public/v1/subscription/claim`
  const data = await fetchJson<{
    status: string
    subscriptionEnd: string
    server: {
      endpoint: string
      publicKey: string
      allowedIPs?: string
      dns?: string
    }
    peer: {
      address: string
      publicKey?: string
      presharedKey?: string
    }
    vpnPort?: number
  }>(url, {
    method: 'POST',
    body: JSON.stringify({
      paymentHash: params.paymentHash,
      wgPublicKey: params.wgPublicKey,
      referralCode: params.referralCode,
    }),
  })

  // fetchJson passes 202 through; its body carries no configuration.
  if (data.status === 'processing') {
    throw new Error('The tunnel is still being provisioned; retry the claim.')
  }
  if (data.peer?.publicKey !== params.wgPublicKey) {
    throw new Error(
      'The claim was provisioned for a different WireGuard key; not using it.',
    )
  }

  const fullConfig = assembleWireguardConfig(
    {
      server: data.server,
      peer: data.peer,
      subscriptionEnd: data.subscriptionEnd,
      vpnPort: data.vpnPort,
    },
    params.wgPrivateKey,
  )

  return {
    fullConfig,
    subscriptionEnd: data.subscriptionEnd,
    endpoint: data.server.endpoint,
    serverPublicKey: data.server.publicKey,
    vpnIp: data.peer.address,
    vpnPort: data.vpnPort,
  }
}

/**
 * Requests a renewal BOLT11 invoice for an existing WireGuard public key.
 */
export async function requestRenewal(
  params: {
    serverId: string
    duration: number
    wgPublicKey: string
  },
  baseUrl = DEFAULT_API_BASE,
): Promise<RenewalOrder> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/public/v1/subscription/renew`
  return await fetchJson<RenewalOrder>(url, {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

/** A BOLT11 invoice: `ln` + bech32 characters (lowercase), nothing else. */
const BOLT11 = /^ln[0-9a-z]{16,4000}$/
const PAYMENT_HASH = /^[0-9a-f]{64}$/
/** ISO 8601 with an explicit zone, as JSON dates are serialized. */
const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

/**
 * Requests a bandwidth reset invoice for an existing WireGuard public key.
 * Each successful request reserves one of the monthly resets until its
 * invoice expires, so callers should show a still-valid invoice again
 * instead of requesting another.
 *
 * The answer is validated: the invoice is handed to the Lightning node and
 * the hash names the pending payment on the device. `expiresAt` is required:
 * without it a pending invoice cannot be safely shown again, and only a
 * backend that reports typed reset status (needed to settle it) returns it.
 */
export async function requestBandwidthReset(
  params: { wgPublicKey: string; serverId: string },
  baseUrl = DEFAULT_API_BASE,
): Promise<BandwidthResetOrder> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/public/v1/subscription/bandwidth-reset`
  const raw = await fetchJson<Record<string, unknown>>(url, {
    method: 'POST',
    body: JSON.stringify(params),
  })
  const bad = (field: string) =>
    new Error(`TunnelSats API returned an invalid bandwidth reset ${field}`)

  const { invoice, paymentHash, resetId, amountSats, expiresAt } = raw ?? {}
  if (typeof invoice !== 'string' || !BOLT11.test(invoice)) throw bad('invoice')
  if (typeof paymentHash !== 'string' || !PAYMENT_HASH.test(paymentHash))
    throw bad('payment hash')
  if (typeof resetId !== 'string' || !resetId) throw bad('ID')
  if (
    typeof amountSats !== 'number' ||
    !Number.isSafeInteger(amountSats) ||
    amountSats <= 0
  )
    throw bad('amount')
  if (
    typeof expiresAt !== 'string' ||
    !ISO_TIMESTAMP.test(expiresAt) ||
    Number.isNaN(Date.parse(expiresAt))
  )
    throw bad('expiry')

  const usage = Number(raw.currentUsagePercent)
  const count = (v: unknown) =>
    typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : undefined
  return {
    invoice,
    paymentHash,
    resetId,
    amountSats,
    // Normalized, so bridge.py and the action read the same instant.
    expiresAt: new Date(expiresAt).toISOString(),
    currentUsagePercent:
      raw.currentUsagePercent != null && Number.isFinite(usage)
        ? usage
        : undefined,
    resetsThisMonth: count(raw.resetsThisMonth),
    maxResetsPerMonth: count(raw.maxResetsPerMonth),
  }
}

export const RESET_STATES = [
  'unpaid',
  'processing',
  'paid',
  'failed',
  'expired',
] as const
export type ResetState = (typeof RESET_STATES)[number] | 'unknown'

/**
 * The state of a bandwidth-reset payment, as bridge.py's _reset_state reads
 * it: only an answer typed `bandwidth_reset` counts (an untyped `paid` is the
 * order fallback of a backend that does not know resets); 404 is 'unknown'.
 */
export async function fetchBandwidthResetStatus(
  paymentHash: string,
  baseUrl = DEFAULT_API_BASE,
): Promise<ResetState> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/public/v1/subscription/${encodeURIComponent(paymentHash)}`
  let status: number
  let data: Record<string, unknown>
  try {
    ;({ status, data } = await fetchJsonWithStatus<Record<string, unknown>>(
      url,
      { method: 'GET' },
    ))
  } catch (e) {
    if (e instanceof ApiHttpError && e.status === 404) return 'unknown'
    throw e
  }
  if (data?.type !== 'bandwidth_reset') {
    throw new Error('The TunnelSats API does not confirm bandwidth resets yet')
  }
  const state = status === 202 ? 'processing' : data.status
  if (!(RESET_STATES as readonly unknown[]).includes(state)) {
    throw new Error(
      `TunnelSats API returned an unknown bandwidth reset status: ${JSON.stringify(state)?.slice(0, 40)}`,
    )
  }
  return state as ResetState
}

/**
 * Fetches real-time subscription status, expiration, and monthly bandwidth used.
 * Called on-demand when the Web UI is opened to avoid unnecessary VPN server polling.
 */
export async function fetchSubscriptionStatus(
  wgPublicKey: string,
  baseUrl = DEFAULT_API_BASE,
): Promise<SubscriptionStatus> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/public/v1/subscription/status`
  const raw = await fetchJson<{
    expiry: string
    bandwidth_used_gb: number
    status: 'enabled' | 'disabled'
    server_domain: string
    last_synced_at: string | null
  }>(url, {
    method: 'POST',
    body: JSON.stringify({ wgPublicKey }),
  })

  return {
    expiry: raw.expiry,
    bandwidth_used_gb: raw.bandwidth_used_gb || 0,
    bandwidth_limit_gb: MONTHLY_BANDWIDTH_LIMIT_GB,
    status: raw.status || 'enabled',
    server_domain: raw.server_domain,
    last_synced_at: raw.last_synced_at,
  }
}
