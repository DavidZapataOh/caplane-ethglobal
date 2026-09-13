import type { ReactNode } from 'react'
import { BADGE_VARIANTS, type BadgeVariant } from './badge-variants'
import { Icon } from './icon'

export type { BadgeVariant }

export const Badge = ({ variant, children }: { variant: BadgeVariant; children: ReactNode }) => {
  const v = BADGE_VARIANTS[variant]
  return (
    <span
      className={`inline-flex items-center gap-2 px-2 py-1 font-display text-[10px] font-semibold uppercase tracking-[0.12em] ${v.className}`}
    >
      <Icon name={v.icon} />
      {children}
    </span>
  )
}
