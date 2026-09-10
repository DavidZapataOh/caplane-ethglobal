import type { SVGProps } from 'react'
import { ICON_PATHS, type IconName } from '@caplane/brand/icon-names'

export type IconProps = SVGProps<SVGSVGElement> & { name: IconName }

/**
 * The shape data is shared; the React component is not. A package that ships TSX forces every
 * consumer to type-check it against the package's own dependency tree rather than its own,
 * which no install step can reliably arrange for a linked directory — and it would make the
 * brand package carry a runtime dependency, which it is not allowed to have.
 *
 * Colour comes from `currentColor` and stroke width is overridable, which is why this is the
 * primary path: no engine lets a host stylesheet reach inside `<use>` content.
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
