import type { ReactNode } from 'react'
import { Providers } from '../../providers'

/** Privy on this segment only, for the same reason the others carry it and the shared layout does not. */
export default function ClaimsLayout({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>
}
