export const DEFAULT_API_BASE = 'https://api.tunnelsats.com'
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

/**
 * Helper to make JSON HTTP requests with timeout.
 */
async function fetchJson<T>(
  url: string,
  options: RequestInit = {},
  timeoutMs = 15000,
): Promise<T> {
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
      throw new Error(
        `HTTP ${response.status} from ${url}: ${errorBody || response.statusText}`,
      )
    }

    return (await response.json()) as T
  } finally {
    clearTimeout(id)
  }
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
 */
export async function createSubscriptionOrder(
  params: {
    serverId: string
    duration: number
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

/**
 * Assembles a standard WireGuard .conf file from server claim data and the local private key.
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
  const vpnPort =
    claimData.vpnPort ||
    parseInt(claimData.server.endpoint.split(':')[1] || '9735', 10)
  const serverDomain = claimData.server.endpoint.split(':')[0]

  const lines: string[] = [
    '[Interface]',
    `PrivateKey = ${privateKey}`,
    `Address = ${claimData.peer.address}`,
  ]

  if (claimData.subscriptionEnd) {
    lines.push(`# Valid Until: ${claimData.subscriptionEnd}`)
  }
  lines.push(`# VPNPort: ${vpnPort}`)
  lines.push(`# Server: ${serverDomain}`)

  lines.push('')
  lines.push('[Peer]')
  lines.push(`PublicKey = ${claimData.server.publicKey}`)
  lines.push(`Endpoint = ${claimData.server.endpoint}`)
  lines.push(`AllowedIPs = ${claimData.server.allowedIPs || '0.0.0.0/0'}`)

  if (claimData.peer.presharedKey) {
    lines.push(`PresharedKey = ${claimData.peer.presharedKey}`)
  }

  return lines.join('\n') + '\n'
}

/**
 * Claims the provisioned WireGuard configuration once payment is settled.
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
      presharedKey?: string
    }
    fullConfig?: string | null
    vpnPort?: number
  }>(url, {
    method: 'POST',
    body: JSON.stringify({
      paymentHash: params.paymentHash,
      wgPublicKey: params.wgPublicKey,
      referralCode: params.referralCode,
    }),
  })

  const fullConfig =
    data.fullConfig ||
    assembleWireguardConfig(
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
