import { sdk } from '../sdk'
import { configure } from './configure'
import { exportConfig } from './exportConfig'

export const actions = sdk.Actions.of()
  .addAction(configure)
  .addAction(exportConfig)
