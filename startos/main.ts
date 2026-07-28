import { i18n } from './i18n'
import { sdk } from './sdk'
import { configJson } from './fileModels/config.json'

export const main = sdk.setupMain(async ({ effects }) => {
  console.info(i18n('Starting TunnelSats!'))

  // 1. Read configuration reactively
  const config = await configJson.read().const(effects)
  const targetNode = config?.['target-node'] ?? 'lnd'
  const osIp = await sdk.getOsIp(effects)

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
        display: i18n('SOCKS5 Proxy'),
        fn: async () => {
          if (!config?.enabled) {
            return {
              result: 'success',
              message: i18n(
                'TunnelSats is disabled. Enable it in configuration.',
              ),
            }
          }
          return sdk.healthCheck.checkPortListening(effects, 1080, {
            successMessage: i18n('SOCKS5 proxy is listening for connections'),
            errorMessage: i18n('SOCKS5 proxy is not listening'),
          })
        },
      },
      requires: [],
    })
    .addHealthCheck('vpn-connected', {
      ready: {
        display: i18n('VPN Connectivity'),
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
            'vpn',
          ])
          if (res.exitCode !== 0) {
            return {
              result: 'failure',
              message: res.stderr?.toString() || i18n('VPN disconnected'),
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
              message: data.message || (isOk ? i18n('VPN connected') : String(data.result)),
            }
          } catch (e) {
            return {
              result: 'failure',
              message: i18n('Failed to parse health check result'),
            }
          }
        },
      },
      requires: ['main'],
    })
    .addHealthCheck('proxy-ready', {
      ready: {
        display: i18n('SOCKS5 Proxy'),
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
            'proxy',
          ])
          if (res.exitCode !== 0) {
            return {
              result: 'failure',
              message: res.stderr?.toString() || i18n('Proxy not ready'),
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
              message: data.message || (isOk ? i18n('SOCKS5 proxy is listening for connections') : String(data.result)),
            }
          } catch (e) {
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
