import { copyLabelFor } from './data-row-label'
import { Icon } from './icon'

/**
 * One row of a definition list: a label, a value, and optionally a control that copies the value.
 * Belongs inside a `<dl>` — it renders the `<dt>`/`<dd>` pair, not the list around them.
 */
export const DataRow = ({
  label,
  value,
  onCopy,
}: {
  label: string
  value: string
  onCopy?: () => void
}) => (
  <div className="flex items-start gap-4 p-3">
    <dt className="w-36 shrink-0 text-text-3">{label}</dt>
    <dd className="break-all text-text">{value}</dd>
    {onCopy !== undefined && (
      <button
        type="button"
        onClick={onCopy}
        aria-label={copyLabelFor(label, true)}
        className="text-text-3 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
      >
        <Icon name="copy" />
      </button>
    )}
  </div>
)
