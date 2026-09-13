import { contrast, tokens } from '@caplane/brand'

type Mode = keyof typeof tokens

/**
 * The intersection, not `keyof typeof tokens.dark`: dark declares `--cp-radius` and `--cp-shadow`
 * and paper does not, so the dark key set alone admits two tokens that cannot be resolved in both
 * modes — and neither is a colour, so neither belongs in a pair anyway.
 */
type Token = keyof typeof tokens.dark & keyof typeof tokens.paper

export type Pair = { fg: Token; bg: Token }

const MODES: readonly Mode[] = ['dark', 'paper']

/**
 * Walks the pairs a component's own variant map declares and checks the hex each one resolves to
 * in each mode — not the token in isolation, the combination. The brand package already verifies
 * every text role against the ground; what it cannot verify is which background a component
 * actually crosses a token with.
 *
 * Throws instead of returning a boolean so a failing test names the variant, the mode and the
 * ratio without a debugger.
 */
export const renderedPairs = (
  variants: Record<string, Pair>,
  minRatio: number,
  modes: readonly Mode[] = MODES,
): void => {
  for (const mode of modes) {
    for (const [name, { fg, bg }] of Object.entries(variants)) {
      const ratio = contrast(tokens[mode][fg], tokens[mode][bg])
      if (ratio < minRatio) {
        throw new Error(
          `${name} (${fg} on ${bg}) in ${mode}: ${ratio.toFixed(2)}:1, needs ${minRatio}:1`,
        )
      }
    }
  }
}
