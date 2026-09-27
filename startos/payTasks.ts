import { sdk } from './sdk'

type Effects = Parameters<typeof sdk.action.clearTask>[0]

/**
 * Clears the pay task of a pending payment that a new Buy/Renew replaced
 * (see replacedPayTaskId). Best effort: the new payment is already recorded
 * and its task raised, so a failure here only leaves a stale task behind,
 * which is logged rather than failing the action.
 */
export async function clearReplacedPayTask(
  effects: Effects,
  replayId: string | null,
): Promise<void> {
  if (!replayId) return
  try {
    await sdk.action.clearTask(effects, replayId)
  } catch (e) {
    console.warn(
      `Could not clear the replaced pay task ${replayId}: ${
        e instanceof Error ? e.message : String(e)
      }`,
    )
  }
}
