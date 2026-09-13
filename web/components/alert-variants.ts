import type { IconName } from '@caplane/brand/icon-names'
import type { Pair } from './contrast'

export type AlertVariant = 'error' | 'blocked'

/**
 * Neither variant is a lien, so neither wears the seal: the brand reserves it for an encumbered
 * claim and nothing else, and a process failure — a bad signature, a policy threshold — is not
 * one. The two differ only by icon, because what separates them is what refused, not how loud it
 * was: `alert` for something that went wrong, `policy` for something a rule turned down.
 */
export const ALERT_VARIANTS: Record<AlertVariant, Pair & { className: string; icon: IconName }> = {
  error: {
    fg: '--cp-text',
    bg: '--cp-ground',
    className: 'border-l-2 border-border-strong text-text',
    icon: 'alert',
  },
  blocked: {
    fg: '--cp-text',
    bg: '--cp-ground',
    className: 'border-l-2 border-border-strong text-text',
    icon: 'policy',
  },
}
