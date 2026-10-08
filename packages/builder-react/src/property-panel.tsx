import { useEffect, useId, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { DataGridColumn, FieldDef, FieldOption } from '@formancy/spec'
import type { BuilderSession, BuilderText } from '@formancy/builder-core'
import { ColumnsEditor } from './columns-editor.js'
import { OptionsEditor } from './options-editor.js'
import { editablePropertiesFor } from '@formancy/builder-core'
import type { EditableProperty } from '@formancy/builder-core'
import { nameOf } from '@formancy/builder-core'
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
  const properties = editablePropertiesFor(def.type, def.widget)
  const current = def as unknown as Record<string, unknown>

  return (
    <div data-formancy-part="property-panel">
      <h2>{nameOf(view.document, def)}</h2>
      <p data-formancy-part="property-panel-type">{def.type}</p>

      {properties.map((property) => (
        <PropertyField
          key={property.name}
          property={property}
          value={current[property.name]}
          // A datagrid's columns name this field's own children, so the editor needs
          // them. Nothing else in the panel does, which is why it is passed rather
          // than reached for.
          childFields={def.fields ?? []}
          text={session.text}
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

/**
 * One property's control, shared by the field panel and the layout panel.
 *
 * Exported inside the package rather than copied: two renderings of "a property from
 * the schema" would drift, and the drift would be invisible — both panels would look
 * fine and one of them would quietly stop offering a kind the schema grew.
 */
export function PropertyField({
  property,
  value,
  childFields,
  text,
  onChange,
}: {
  property: EditableProperty
  value: unknown
  childFields: readonly FieldDef[]
  /** The session's language, for the two editors that have words of their own. */
  text: BuilderText
  onChange: (value: unknown) => void
}): ReactElement | null {
  const id = useId()
  const hintId = `${id}-hint`

  /*
   * A local draft of the text, for the reason the options editor keeps one: the
   * document refuses invalid states and a person typing passes through them.
   *
   * Measured, and it made two properties unsettable. `span` is `anyOf: [integer,
   * const "all"]`, so typing "all" offers "a", then "al", then "all" — the first two
   * are refused, the document does not change, and a purely controlled box re-renders
   * empty, so the next keystroke lands in an empty box. The word could not be typed at
   * all. Clearing a table's `columns` to retype it is the same shape: a table must have
   * one, so the empty moment is refused and the old number snaps back mid-edit.
   *
   * So the box shows the draft, every edit is offered to the session, and a refusal
   * simply leaves the document where it was. The form still cannot be PUBLISHED in an
   * invalid state — `canPublish` says no — but it can be typed in.
   */
  const asText = (raw: unknown): string =>
    typeof raw === 'string' || typeof raw === 'number' ? String(raw) : ''
  const [draft, setDraft] = useState(() => asText(value))
  const pushed = useRef(asText(value))

  useEffect(() => {
    const incoming = asText(value)
    // Only adopt a change that came from somewhere else — an undo, or another node
    // being selected. Adopting our own echo would undo the draft.
    if (incoming !== pushed.current) {
      pushed.current = incoming
      setDraft(incoming)
    }
  }, [value])

  const offer = (text: string, parsed: unknown): void => {
    setDraft(text)
    pushed.current = asText(parsed)
    onChange(parsed)
  }

  // Options are value/label pairs, and the generic path would render them as
  // a textarea full of JSON. They get an editor of their own.
  if (property.kind === 'options') {
    return (
      <OptionsEditor
        options={Array.isArray(value) ? (value as FieldOption[]) : []}
        text={text}
        onChange={(next) => onChange(next.length === 0 ? undefined : next)}
      />
    )
  }

  // A datagrid's columns are an array of objects, one of which names a sibling
  // field — the generic path would render that as JSON too.
  if (property.kind === 'columns') {
    return (
      <ColumnsEditor
        columns={Array.isArray(value) ? (value as DataGridColumn[]) : []}
        children={childFields}
        text={text}
        onChange={(next) => onChange(next.length === 0 ? undefined : next)}
      />
    )
  }

  const shared = {
    id,
    'aria-describedby': property.description === '' ? undefined : hintId,
  }

  // A list of plain strings, one per line. Not comma-separated: a media type
  // has no comma in it but an extension list somebody pastes from elsewhere
  // often does, and a separator that appears inside a value is a separator
  // that silently splits one.
  if (property.kind === 'strings') {
    const lines = Array.isArray(value) ? (value as unknown[]).map(String) : []
    return (
      <div data-formancy-part="property">
        <label htmlFor={id}>{property.title}</label>
        <textarea
          {...shared}
          rows={3}
          value={lines.join('\n')}
          onChange={(event) => {
            const next = event.target.value
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line !== '')
            onChange(next.length === 0 ? undefined : next)
          }}
        />
        {property.description === '' ? null : (
          <p id={hintId} data-formancy-part="property-hint">
            {property.description}
          </p>
        )}
      </div>
    )
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
          value={draft}
          onChange={(event) => {
            const raw = event.target.value
            if (property.kind !== 'number') {
              // A property the format writes as "a number or a word" — `span` is
              // `anyOf: [integer, const "all"]` — needs the number handed over AS a
              // number. Measured: the string form is refused outright, so typing a
              // numeric span used to do nothing and say nothing.
              //
              // Read from the schema, never from the property's name, so the next one
              // written that way works without anybody remembering this.
              if (property.numericAlternative === true && /^-?\d+(\.\d+)?$/.test(raw)) {
                offer(raw, Number(raw))
                return
              }
              offer(raw, raw === '' ? undefined : raw)
              return
            }
            // A half-typed number is not a number. Sending NaN would fail
            // validation on every keystroke of "1e", so an unparseable box
            // reads as cleared until it parses.
            const parsed = Number(raw)
            offer(raw, raw === '' || Number.isNaN(parsed) ? undefined : parsed)
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
