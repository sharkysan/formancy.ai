import { useId } from 'react'
import type { ReactElement } from 'react'
import type { FieldOption } from '@formancy/spec'
import type { BuilderSession } from '@formancy/builder-core'
import { OptionsEditor } from './options-editor.js'
import { editablePropertiesFor } from './properties.js'
import type { EditableProperty } from './properties.js'
import { useBuilder } from './use-builder.js'

/**
 * The property panel, rendered from the spec's JSON Schema rather than written
 * out per field type. See properties.ts for why.
 *
 * Every control is a real labelled input with the schema's own description as
 * its hint, which is also what makes the panel navigable: a form builder whose
 * own forms are not accessible would be a poor advertisement.
 */

export interface PropertyPanelProps {
  session: BuilderSession
  /** The field being edited. Its definition is read from the live document. */
  keyPath: readonly string[]
}

export function PropertyPanel({ session, keyPath }: PropertyPanelProps): ReactElement | null {
  // The definition comes from the session rather than from a prop. A panel
  // handed a definition captured before the edit renders controlled inputs
  // whose value never changes, so every keystroke resets the box and only the
  // last character survives — a bug any consumer would reproduce by wiring it
  // the obvious way.
  const view = useBuilder(session)
  const node = view.nodes.find(
    (candidate) =>
      candidate.keyPath.length === keyPath.length &&
      candidate.keyPath.every((key, at) => key === keyPath[at]),
  )
  if (node === undefined) return null

  const def = node.def
  const properties = editablePropertiesFor(def.type)
  const current = def as unknown as Record<string, unknown>

  return (
    <div data-formancy-part="property-panel">
      <h2>{typeof def.label === 'string' && def.label !== '' ? def.label : def.key}</h2>
      <p data-formancy-part="property-panel-type">{def.type}</p>

      {properties.map((property) => (
        <PropertyField
          key={property.name}
          property={property}
          value={current[property.name]}
          onChange={(value) => {
            // An empty box means "no value", not "the empty string". Writing ''
            // would put a property into the document that the author just
            // cleared, and `minLength: ''` is not a thing the schema accepts.
            session.setFieldProperty(
              keyPath,
              property.name,
              value === '' || value === undefined ? undefined : value,
            )
          }}
        />
      ))}
    </div>
  )
}

function PropertyField({
  property,
  value,
  onChange,
}: {
  property: EditableProperty
  value: unknown
  onChange: (value: unknown) => void
}): ReactElement | null {
  const id = useId()
  const hintId = `${id}-hint`

  // Options are value/label pairs, and the generic path would render them as
  // a textarea full of JSON. They get an editor of their own.
  if (property.kind === 'options') {
    return (
      <OptionsEditor
        options={Array.isArray(value) ? (value as FieldOption[]) : []}
        onChange={(next) => onChange(next.length === 0 ? undefined : next)}
      />
    )
  }

  const shared = {
    id,
    'aria-describedby': property.description === '' ? undefined : hintId,
  }

  return (
    <div data-formancy-part="property">
      <label htmlFor={id}>{property.title}</label>

      {property.kind === 'boolean' ? (
        <input
          {...shared}
          type="checkbox"
          checked={typeof value === 'boolean' ? value : property.default === true}
          onChange={(event) => onChange(event.target.checked)}
        />
      ) : property.kind === 'enum' ? (
        <select
          {...shared}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="" />
          {(property.choices ?? []).map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...shared}
          type={property.kind === 'number' ? 'number' : 'text'}
          value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
          onChange={(event) => {
            const raw = event.target.value
            if (property.kind !== 'number') {
              onChange(raw)
              return
            }
            // A half-typed number is not a number. Sending NaN would fail
            // validation on every keystroke of "1e", so an unparseable box
            // reads as cleared until it parses.
            const parsed = Number(raw)
            onChange(raw === '' || Number.isNaN(parsed) ? undefined : parsed)
          }}
        />
      )}

      {property.description === '' ? null : (
        <p id={hintId} data-formancy-part="property-hint">
          {property.description}
        </p>
      )}
    </div>
  )
}
