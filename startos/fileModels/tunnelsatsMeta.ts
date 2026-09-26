import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

export const metaShape = z.object({
  expiresAt: z.string().optional(),
  lastSync: z.string().optional(),
  syncSuccess: z.boolean().optional(),
  syncError: z.string().optional().nullable(),
  serverDomain: z.string().optional(),
  vpnPort: z.number().optional(),
  bandwidth_used_gb: z.number().optional(),
  pendingOrder: z
    .object({
      paymentHash: z.string(),
      orderId: z.string(),
      privateKey: z.string(),
      publicKey: z.string(),
      targetNode: z.enum(['lnd', 'cln', 'eclair']),
      serverId: z.string(),
      createdAt: z.string(),
    })
    .optional()
    .nullable(),
  pendingRenewal: z
    .object({
      paymentHash: z.string(),
      renewalId: z.string(),
      oldExpiry: z.string(),
      newExpiry: z.string(),
      createdAt: z.string(),
    })
    .optional()
    .nullable(),
})

export const tunnelsatsMeta = FileHelper.json(
  { base: sdk.volumes.main, subpath: './tunnelsats-meta.json' },
  metaShape,
)
