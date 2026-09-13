import type { ReactNode } from 'react'
import { Providers } from '../../providers'

/** Privy on this segment only, like the others: the public registry never carries the SDK. */
export default function InvestLayout({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>
}
