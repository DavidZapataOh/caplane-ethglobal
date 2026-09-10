import type { SVGProps } from 'react'
import { ICON_PATHS, type IconName } from './icon-names.js'

export type IconProps = SVGProps<SVGSVGElement> & { name: IconName }

/**
 * Colour comes from `currentColor` and stroke width is overridable, which is the whole reason
 * this is the primary path: no engine lets a host stylesheet reach inside `<use>` content, so
 * a sprite icon cannot take props at all.
 */
export const Icon = ({ name, ...rest }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="butt"
    strokeLinejoin="miter"
    aria-hidden="true"
    {...rest}
  >
    {ICON_PATHS[name].map((d) => (
      <path key={d} d={d} />
    ))}
  </svg>
)
