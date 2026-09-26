import { sdk } from '../sdk'
import { configJson } from '../fileModels/config.json'
import { tunnelsatsMeta } from '../fileModels/tunnelsatsMeta'
import { i18n } from '../i18n'
import { parseWireguardTunnelInfo } from '../utils'
import { derivePublicKey } from '../keygen'
import { requestRenewal } from '../apiClient'
import { payInvoice as lndPayInvoice } from 'lnd-startos/startos/actions/payInvoice'
import { payInvoice as clnPayInvoice } from 'cln-startos/startos/actions/payInvoice'
import { payInvoice as eclairPayInvoice } from 'eclair-startos/startos/actions/payInvoice'

function resolvePayInvoice(targetNode: string) {
  switch (targetNode) {
    case 'cln':
      return { packageId: 'c-lightning', payInvoiceAction: clnPayInvoice }
    case 'eclair':
      return { packageId: 'eclair', payInvoiceAction: eclairPayInvoice }
    case 'lnd':
    default:
      return { packageId: 'lnd', payInvoiceAction: lndPayInvoice }
  }
}

const { InputSpec, Value } = sdk

const inputSpec = InputSpec.of({
  duration: Value.select({
    name: i18n('Renewal Duration'),
    description: i18n('Choose how long to extend the subscription.'),
    default: '1',
    values: {
      '1': '1 Month',
      '3': '3 Months',
      '6': '6 Months',
      '12': '12 Months',
    },
  }),
})

export const renewSubscription = sdk.Action.withInput(
  'renew-subscription',
  {
    name: i18n('Renew Subscription'),
    description: i18n(
      'Extend your existing TunnelSats VPN subscription. Requires an active configuration with a valid private key.',
    ),
    warning: null,
    allowedStatuses: 'only-running',
    group: i18n('Subscription'),
    visibility: 'enabled',
  },
  inputSpec,
  async ({ effects }) => ({}),
  async ({ effects, input }) => {
    const config = await configJson
      .read()
      .once()
      .catch(() => null)
    if (!config?.enabled || !config['tunnelsats-conf']) {
      throw new Error(
        i18n(
          'No active subscription found. Import or purchase a subscription first.',
        ),
      )
    }

    const tunnelInfo = parseWireguardTunnelInfo(config['tunnelsats-conf'])
    if (!tunnelInfo.privateKey) {
      throw new Error(
        i18n('Cannot read private key from stored configuration.'),
      )
    }
    const publicKey = derivePublicKey(tunnelInfo.privateKey)

    const meta = await tunnelsatsMeta
      .read()
      .once()
      .catch(() => null)
    const serverId = meta?.serverDomain || tunnelInfo.serverDomain || 'eu-de'

    const renewal = await requestRenewal({
      serverId,
      duration: parseInt(input.duration, 10),
      wgPublicKey: publicKey,
    })

    const targetNode = config['target-node'] || 'lnd'
    const { packageId, payInvoiceAction } = resolvePayInvoice(targetNode)

    await sdk.action.createTask(
      effects,
      packageId,
      payInvoiceAction,
      'important',
      {
        input: {
          kind: 'partial',
          accept: [],
          set: {
            invoice: renewal.invoice,
            amount: { selection: 'invoice', value: {} },
            'max-fee-percent': 1,
            confirmed: false,
          },
        },
        reason: i18n('Pay TunnelSats VPN subscription renewal invoice'),
      },
    )

    await tunnelsatsMeta.merge(effects, {
      pendingRenewal: {
        paymentHash: renewal.paymentHash,
        renewalId: renewal.renewalId,
        oldExpiry: renewal.oldExpiry,
        newExpiry: renewal.newExpiry,
        createdAt: new Date().toISOString(),
      },
    })

    return {
      version: '1' as const,
      title: i18n('Renewal Invoice Created'),
      message: i18n(
        'A payment task has been raised on your Lightning node. Once paid, your subscription will be extended. Current expiry: ${oldExpiry}. New expiry after payment: ${newExpiry}.',
        {
          oldExpiry: renewal.oldExpiry,
          newExpiry: renewal.newExpiry,
        },
      ),
      result: {
        type: 'group' as const,
        value: [
          {
            name: i18n('BOLT11 Invoice'),
            description: null,
            type: 'single' as const,
            value: renewal.invoice,
            copyable: true,
            masked: false,
            qr: true,
          },
          {
            name: i18n('Payment Hash'),
            description: null,
            type: 'single' as const,
            value: renewal.paymentHash,
            copyable: true,
            masked: false,
            qr: false,
          },
        ],
      },
    }
  },
)
