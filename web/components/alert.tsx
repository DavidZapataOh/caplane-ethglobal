import type { ReactNode } from 'react'
import { ALERT_VARIANTS, type AlertVariant } from './alert-variants'
import { Icon } from './icon'

export type { AlertVariant }

export const Alert = ({ variant, children }: { variant: AlertVariant; children: ReactNode }) => {
  const v = ALERT_VARIANTS[variant]
  return (
    <p role="alert" className={`flex items-center gap-2 p-3 ${v.className}`}>
      <Icon name={v.icon} /> {children}
    </p>
  )
}
