import { i18n } from './i18n'
import { sdk } from './sdk'
import { configJson } from './fileModels/config.json'

export const main = sdk.setupMain(async ({ effects }) => {
  console.info(i18n('Starting TunnelSats!'))

  // 1. Read configuration reactively
  const config = await configJson.read().const(effects)
  const targetNode = config?.['target-node'] ?? 'lnd'

  // 2. Resolve target Lightning node internal DNS address
  const targetAddr =
    targetNode === 'lnd' ? 'lnd.embassy:9735' : 'c-lightning.embassy:9735'

  // 3. Setup environment variables
  const env: Record<string, string> = {}
  if (config?.enabled && targetAddr) {
    env.TARGET_NODE_ADDR = targetAddr
  }

  // 4. Create subcontainer reference
  const subcontainer = sdk.SubContainer.of(
    effects,
    { imageId: 'main' },
    sdk.Mounts.of().mountVolume({
      volumeId: 'main',
      subpath: null,
      mountpoint: '/data',
      readonly: false,
    }),
    'main',
  )

  // 5. Define daemons and health checks
  return sdk.Daemons.of(effects)
    .addDaemon('main', {
      subcontainer,
      exec: {
        command: ['/app/docker_entrypoint.sh'],
        env,
      },
      ready: {
        display: i18n('Web Dashboard'),
        fn: async () => {
          return sdk.healthCheck.checkPortListening(effects, 80, {
            successMessage: i18n('Web Dashboard is accessible'),
            errorMessage: i18n('Web Dashboard is not accessible'),
          })
        },
      },
      requires: [],
    })
    .addHealthCheck('subscription', {
      ready: {
        display: i18n('Subscription Status'),
        fn: async () => {
          if (!config?.enabled) {
            return {
              result: 'disabled',
              message: i18n('TunnelSats is disabled.'),
            }
          }
          const res = await subcontainer.exec([
            'python3',
            '/app/bridge.py',
            'health',
            'subscription',
          ])
          if (res.exitCode !== 0) {
            try {
              const errData = JSON.parse(
                res.stdout.toString() || res.stderr.toString(),
              )
              return {
                result: 'failure',
                message:
                  errData.message || i18n('Subscription verification failed'),
              }
            } catch {
              return {
                result: 'failure',
                message:
                  res.stderr?.toString() ||
                  i18n('Subscription verification failed'),
              }
            }
          }
          try {
            const data = JSON.parse(res.stdout.toString())
            const isOk = data.result === 'ok' || data.result === 'success'
            return {
              result:
                isOk
                  ? 'success'
                  : data.result === 'loading'
                    ? 'loading'
                    : 'failure',
              message:
                data.message ||
                (isOk ? i18n('Subscription is active') : String(data.result)),
            }
          } catch {
            return {
              result: 'failure',
              message: i18n('Failed to parse health check result'),
            }
          }
        },
      },
      requires: ['main'],
    })
})
