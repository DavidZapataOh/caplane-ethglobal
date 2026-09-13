import { arcTestnet } from '@privy-io/chains'

/**
 * Arc is not in Privy's default supported chains — an embedded wallet throws on send without this
 * declaration. Kept as data in its own module, with no JSX around it, so the test can read it
 * without a browser and without Node having to parse a component.
 */
export const PRIVY_CONFIG = {
  supportedChains: [arcTestnet],
  defaultChain: arcTestnet,
}
