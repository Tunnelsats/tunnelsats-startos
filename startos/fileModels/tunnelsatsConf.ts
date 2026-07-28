import { FileHelper } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

export const tunnelsatsConf = FileHelper.string({
  base: sdk.volumes.main,
  subpath: './tunnelsatsv3.conf',
})
