import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

/**
 * What a host draws under a field, by the field's path, or nothing (0233). A constant, as any
 * context value should be: a new function on every render redraws every field's addition.
 */
export type FieldAddition = (path: string) => ReactNode

/**
 * The host's function travels by context rather than as a prop: every place a field is drawn
 * — the form, a layout, a group, a repeater's rows — would otherwise pass it on.
 */
export const FieldAdditionContext = createContext<FieldAddition | undefined>(undefined)

/**
 * The host's content for one field, as the last thing in the field's wrapper: after its label,
 * description, control and error, so what the field says of itself stays together.
 *
 * It adds no role, no name and no id, and no control is described by it: the content is the
 * host's, with links and buttons named by the host, and read as a control's description it would
 * be flattened into one string. Nothing is drawn, not even the wrapper, where the host gives
 * nothing, so a form drawn without additions is drawn as it was.
 */
export function FieldAdditionSlot({ path }: { path: string }) {
  const addition = useContext(FieldAdditionContext)
  const content = addition?.(path)
  if (content === undefined || content === null || typeof content === 'boolean') return null
  return <div data-formancy-part="field-addition">{content}</div>
}
