import type { ComponentProps } from 'react'
import { BUTTON_VARIANTS, type ButtonVariant } from './button-variants'

export type { ButtonVariant }

export const Button = ({
  variant = 'secondary',
  className = '',
  ...rest
}: ComponentProps<'button'> & { variant?: ButtonVariant }) => (
  <button
    type="button"
    className={`inline-flex items-center gap-2 px-4 py-2 font-display text-sm outline-none ${BUTTON_VARIANTS[variant].className} ${className}`}
    {...rest}
  />
)
