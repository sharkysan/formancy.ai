import type { ReactElement } from 'react'
import type { BuilderSession, LayoutAddress } from '@formancy/builder-core'
import { layoutNodeAt, layoutPropertyHeading } from '@formancy/builder-core'
import { PropertyField } from './property-panel.js'
import { editableLayoutPropertiesFor } from '@formancy/builder-core'
import { useBuilder } from './use-builder.js'

/**
 * The property panel for a node in the arrangement.
 *
 * Generated from the spec's JSON Schema, exactly as the field panel is and for the
 * same reason — except that until now there was no layout panel at all. Every
 * property a layout node has was unsettable: a table's `columns` and a section's
 * `label` since the day layouts existed, and `span` from the moment it was added
 * ([0074](../../../docs/decisions/0074-a-table-child-may-span.md)). The format
 * validated them, both renderers honoured them, and the only way to write one was to
 * edit the JSON by hand.
 *
 * That gap was found by a guard rather than by a person: the check in
 * properties.test.ts walks the schema and asks whether every property is reachable.
 * It is the same shape of question the playground's demo guard asks about widgets.
 *
 * Writes go through one generic command, `setLayoutNodeProperty`, which is attempted
 * against the validator — so a span wider than its table leaves the document where it
 * was, and this panel does not have to know that rule.
 */

export interface LayoutPropertyPanelProps {
  session: BuilderSession
  /** The node being edited, read live from the document rather than captured. */
  address: LayoutAddress
}

export function LayoutPropertyPanel({
  session,
  address,
}: LayoutPropertyPanelProps): ReactElement | null {
  // From the session, not from a prop: a panel handed a node captured before the edit
  // renders controlled inputs whose value never changes, so every keystroke resets the
  // box and only the last character survives.
  const view = useBuilder(session)
  const node = layoutNodeAt(view.document, address.layout, address.path)
  if (node === undefined) return null

  const properties = editableLayoutPropertiesFor(node.kind)
  const current = node as unknown as Record<string, unknown>

  return (
    <div data-formancy-part="layout-property-panel">
      {/* The kind, not the node's own label, which is one of the properties edited here. */}
      <h2>{layoutPropertyHeading(node.kind, session.text)}</h2>
      <p data-formancy-part="property-panel-type">{node.kind}</p>

      {/* No "nothing to configure" branch, because there is no such node: every
          layout kind the format defines can span, so this list is never empty.
          `properties.test.ts` derives that, so a kind added without a property
          fails there rather than reaching a branch nobody could ever see — which
          is what the branch removed here was. */}
      {properties.map((property) => (
        <PropertyField
          key={property.name}
          property={property}
          value={current[property.name]}
          // Only a field's own children can be a datagrid's columns, and a layout
          // node has none — so this panel never renders that editor.
          childFields={[]}
          text={session.text}
          onChange={(value) => {
            // An empty box means "no value", not "the empty string": writing ''
            // would put a property into the document the author just cleared.
            session.setLayoutNodeProperty(
              address,
              property.name,
              value === '' || value === undefined ? undefined : value,
            )
          }}
        />
      ))}
    </div>
  )
}
