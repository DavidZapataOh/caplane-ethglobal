import type { IconName } from '@caplane/brand/icon-names'
import type { Pair } from './contrast'

export type BadgeVariant = 'encumbered' | 'free' | 'verified' | 'released'

/**
 * The brand's semantic-use table, transcribed: an encumbered claim is filled with the seal and is
 * the only variant that is. Free, verified and released are all "no colour" by the brand's own
 * rule — the badge marks a state, the colour marks only the one state that is a claim on
 * something.
 *
 * Data, not markup, and in its own module because the tests that check these pairs run under
 * Node's type stripping, which cannot load a file containing JSX at all.
 *
 * `free` pairs `--cp-text-2`, not the dimmer `--cp-text-3` that `released` uses: the two differ in
 * background, and a filled `--cp-surface-2` spends the margin that `released` keeps by sitting on
 * the ground. `--cp-text-3` on `--cp-surface-2` is 4.07:1 on paper, under the threshold.
 */
export const BADGE_VARIANTS: Record<BadgeVariant, Pair & { className: string; icon: IconName }> = {
  encumbered: {
    fg: '--cp-on-seal',
    bg: '--cp-seal',
    className: 'bg-seal text-on-seal',
    icon: 'encumbered',
  },
  free: {
    fg: '--cp-text-2',
    bg: '--cp-surface-2',
    className: 'bg-surface-2 text-text-2',
    icon: 'unencumbered',
  },
  verified: {
    fg: '--cp-verified-text',
    bg: '--cp-ground',
    className: 'text-verified-text',
    icon: 'verified',
  },
  released: {
    fg: '--cp-text-3',
    bg: '--cp-ground',
    className: 'text-text-3',
    icon: 'released',
  },
}
