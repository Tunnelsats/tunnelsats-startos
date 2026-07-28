import { sdk } from './sdk'
import { configJson } from './fileModels/config.json'

export const setDependencies = sdk.setupDependencies(async ({ effects }) => {
  const targetNode = await configJson.read((c) => c['target-node']).once()

  const result: any = {}

  if (targetNode === 'lnd') {
    result.lnd = {
      kind: 'running',
      versionRange: '>=0.15.5:0',
      healthChecks: ['lnd'],
    }
  } else if (targetNode === 'cln') {
    result['c-lightning'] = {
      kind: 'running',
      versionRange: '>=23.02.2:0',
      healthChecks: ['cln'],
    }
  }

  return result
})
