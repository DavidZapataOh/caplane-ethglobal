import type { Pair } from './contrast'

export type ButtonVariant = 'primary' | 'secondary'

/**
 * Buttons are a Martian Mono role, like every other structural label in the brand.
 *
 * The focus ring is `outline`, never Tailwind's `ring-*`: the brand allows hairlines and forbids
 * shadows, and `ring-*` compiles to `box-shadow`. `outline` does not — and `scripts/hygiene`
 * refuses the shadow utilities outright, so this is enforced rather than remembered.
 *
 * `primary` declares `{ fg: '--cp-ground', bg: '--cp-text' }` because that is what `className`
 * paints: `bg-text text-ground`. The pair a variant declares has to be the pair it renders, or the
 * contrast check is measuring something the visitor never sees.
 */
export const BUTTON_VARIANTS: Record<ButtonVariant, Pair & { className: string }> = {
  primary: {
    fg: '--cp-ground',
    bg: '--cp-text',
    className:
      'bg-text text-ground hover:bg-text-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text',
  },
  secondary: {
    fg: '--cp-text',
    bg: '--cp-surface-2',
    className:
      'border border-border-strong bg-surface-2 text-text hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text',
  },
}
