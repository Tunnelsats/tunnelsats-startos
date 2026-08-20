import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

export const metaShape = z.object({
  expiresAt: z.string().optional(),
  lastSync: z.string().optional(),
  syncSuccess: z.boolean().optional(),
  syncError: z.string().optional().nullable(),
  serverDomain: z.string().optional(),
  vpnPort: z.number().optional(),
})

export const tunnelsatsMeta = FileHelper.json(
  { base: sdk.volumes.main, subpath: './tunnelsats-meta.json' },
  metaShape,
)
