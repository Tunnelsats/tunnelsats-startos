import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

const packageId = z.enum(['lnd', 'c-lightning', 'eclair'])

/**
 * Which node we last handed the tunnel to, which nodes still owe us a
 * confirmed "off", and the public keys of the tunnels we handed out.
 * Written only by setDependencies (see startos/vpnHandoff.ts).
 */
export const vpnHandoffShape = z.object({
  activeTarget: packageId.nullable().catch(null),
  pendingOff: z.array(packageId).catch([]),
  handedOutKeys: z.array(z.string()).catch([]),
})

export const vpnHandoff = FileHelper.json(
  { base: sdk.volumes.main, subpath: './vpn-handoff.json' },
  vpnHandoffShape,
)
