'use client'

import { type ComponentProps, useId } from 'react'
import { describedById } from './field-support'

type FieldProps = ComponentProps<'input'> & { label: string; error?: string; hint?: string }

/**
 * A labelled input that generates its own id, so a caller cannot forget to associate the label
 * with the control — the association is the accessibility property, and making it impossible to
 * skip is cheaper than remembering to check it.
 */
export const Field = ({ label, error, hint, id: providedId, ...rest }: FieldProps) => {
  const generated = useId()
  const id = providedId ?? generated
  const message = error ?? hint
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="font-display text-[10px] font-semibold uppercase tracking-[0.12em] text-text-2"
      >
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error !== undefined}
        aria-describedby={describedById(id, message !== undefined)}
        className="border border-border bg-surface p-3 font-data text-text outline-none placeholder:text-text-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
        {...rest}
      />
      {message !== undefined && (
        <p
          id={describedById(id)}
          {...(error !== undefined ? { role: 'alert' } : {})}
          className="text-text-2"
        >
          {message}
        </p>
      )}
    </div>
  )
}
