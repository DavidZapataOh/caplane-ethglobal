'use client'

import { PrivyProvider } from '@privy-io/react-auth'
import type { ReactNode } from 'react'
import { PRIVY_CONFIG } from './privy-config'

const appId = process.env.NEXT_PUBLIC_PRIVY_PUBLIC_APP

export const Providers = ({ children }: { children: ReactNode }) => {
  if (appId === undefined) throw new Error('NEXT_PUBLIC_PRIVY_PUBLIC_APP is not set')
  return (
    <PrivyProvider appId={appId} config={PRIVY_CONFIG}>
      {children}
    </PrivyProvider>
  )
}
