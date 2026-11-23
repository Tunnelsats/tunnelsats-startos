import { payInvoice as lndPayInvoice } from 'lnd-startos/startos/actions/payInvoice'
import { payInvoice as clnPayInvoice } from 'cln-startos/startos/actions/payInvoice'
import { payInvoice as eclairPayInvoice } from 'eclair-startos/startos/actions/payInvoice'

/** The Lightning package and its Pay Invoice action for a target node. */
export function resolvePayInvoice(targetNode: string) {
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

/**
 * Partial task prefill for raising Pay Invoice on LND, Core Lightning, or Eclair.
 *
 * StartOS deep-merges `set` over the target action's InputSpec defaults.
 * Presetting only `invoice` satisfies:
 * - LND and Core Lightning's Pay Invoice prefill guard (which refuses tasks
 *   that preset amount, fee limit, or confirmation), and
 * - Eclair's hardened Pay Invoice InputSpec (which declares only `invoice` and
 *   `amount`, relying on its action warning and configured fee boundaries).
 */
export function buildPayInvoiceTaskInput(invoice: string) {
  return {
    kind: 'partial' as const,
    accept: [] as never[],
    set: {
      invoice,
    },
  }
}
