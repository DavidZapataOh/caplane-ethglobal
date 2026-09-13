import type { ReactNode } from 'react'
import { Providers } from '../../providers'

/**
 * Privy is mounted here, on the segment that needs a wallet, and not in the shared layout above.
 * Measured: wrapping the shared layout put the whole SDK — 786 KB gzipped — into every route,
 * including the public registry, whose entire premise is that it reads the chain with nothing of
 * ours and nothing heavy in the path. A nested layout keeps it on the routes that sign.
 */
export default function SignupLayout({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>
}
