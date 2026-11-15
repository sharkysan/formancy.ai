import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

/**
 * What a host draws beside a field's control, by the field's path, or nothing (0237). A
 * constant, as any context value should be: a new function on every render redraws every row.
 */
export type FieldBeside = (path: string) => ReactNode

/**
 * The host's function travels by context rather than as a prop, as the addition's does (0233):
 * every place a field is drawn — the form, a layout, a group, a repeater's rows — would otherwise
 * pass it on.
 */
export const FieldBesideContext = createContext<FieldBeside | undefined>(undefined)

/**
 * A field's box and the host's content after it, on one line a theme lays out: the box first,
 * so the keyboard reaches the host's content right after the control and before the next field.
 *
 * Only the box goes in: a field's status, count and error stay rows of the field, under the
 * line. It adds no role, no name and no id, and no control is described by it, for the reasons
 * the addition gives (0233). Where the host gives nothing nothing is wrapped, so a form drawn
 * without content beside its fields is drawn as it was; where it gives a component that draws
 * nothing, the place beside is left empty, which a theme's `:empty` can see.
 */
export function FieldControlRow({ path, children }: { path: string; children: ReactNode }): ReactNode {
  const beside = useContext(FieldBesideContext)
  const content = beside?.(path)
  if (content === undefined || content === null || typeof content === 'boolean') return children
  return (
    <div data-formancy-part="field-control-row">
      {children}
      <div data-formancy-part="field-beside">{content}</div>
    </div>
  )
}
