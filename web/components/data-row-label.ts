/**
 * The accessible name of a copy button, derived from the row it belongs to. A copy button with no
 * text has nothing a screen reader can announce, and "Copy" repeated down a list of eight rows
 * announces eight identical controls.
 */
export const copyLabelFor = (label: string, hasHandler: boolean): string | undefined =>
  hasHandler ? `Copy the ${label}` : undefined
