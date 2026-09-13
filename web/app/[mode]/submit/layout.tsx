import type { ReactNode } from 'react'
import { Providers } from '../../providers'

/**
 * Privy on this segment too, for the same reason the sign-up segment has it and the shared layout
 * does not: the SDK is 786 KB gzipped, and the public registry has no business carrying it.
 */
export default function SubmitLayout({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>
}
