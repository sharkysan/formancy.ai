import { useEffect, useId, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { DataGridColumn, FieldDef } from '@formancy/spec'
import { createBuilderText } from '@formancy/builder-core'
import type { BuilderText } from '@formancy/builder-core'

/**
 * The editor for a datagrid's columns.
 *
 * Everything else in the property panel is generated from the JSON Schema (see
 * properties.ts), and for the same reason as `options` this one cannot be: the
 * schema says "array of objects", and the honest generic rendering of that is a
 * textarea full of JSON.
 *
 * `properties.test.ts` walks the schema and asks whether every property is settable,
 * per type and per widget, so a property with no control fails it.
 *
 * A column NAMES a child field; it does not create one. So `field` is a choice
 * from the children the repeater already has, never a text box — a typo there
 * is a column over nothing, which `validateSchema` refuses at publish rather
 * than at the keystroke.
 *
 * And a column list is an ORDERING, not a choice of which answers to keep
 * ([0066](../../../docs/decisions/0066-a-widget-may-be-configured.md)). A child
 * no column names is still collected and still gets a column, appended after
 * the configured ones. The panel says so out loud, because an author who
 * removes a column expects the answer to disappear with it.
 */

export interface ColumnsEditorProps {
  columns: readonly DataGridColumn[]
  /** The repeater's own children, which are the only things a column may name. */
  children: readonly FieldDef[]
  onChange: (columns: DataGridColumn[]) => void
  /** The language to speak: the panel passes its session's. English when none is given. */
  text?: BuilderText
}

const ENGLISH = createBuilderText()

export function ColumnsEditor({
  columns,
  children,
  onChange,
  text = ENGLISH,
}: ColumnsEditorProps): ReactElement {
  const id = useId()

  /*
   * A local draft, for the reason the options editor keeps one: the document
   * refuses invalid states and a person editing passes through them. Clearing a
   * width to retype it is empty for a moment, the command is refused, and a
   * purely controlled input snaps back mid-keystroke.
   */
  const [draft, setDraft] = useState<DataGridColumn[]>(() => [...columns])
  const pushed = useRef(JSON.stringify(columns))

  useEffect(() => {
    const incoming = JSON.stringify(columns)
    // Only adopt a change from somewhere else — an undo, or another field being
    // selected. Adopting our own echo would undo the draft.
    if (incoming !== pushed.current) {
      pushed.current = incoming
      setDraft([...columns])
    }
  }, [columns])

  const commit = (next: DataGridColumn[]): void => {
    setDraft(next)
    pushed.current = JSON.stringify(next)
    onChange(next)
  }

  /**
   * `undefined` is a real instruction here — "remove this property" — and
   * `exactOptionalPropertyTypes` will not let it through a plain `Partial`
   * without the type saying so.
   *
   * `field` is not in that set: a column always names something, and clearing it
   * would leave a column over nothing rather than a column with a default.
   */
  const replace = (
    at: number,
    patch: {
      field?: string
      width?: number | undefined
      align?: DataGridColumn['align'] | undefined
      header?: DataGridColumn['header'] | undefined
    },
  ): void => {
    commit(
      draft.map((column, index): DataGridColumn => {
        if (index !== at) return column
        // Built property by property rather than spread and pruned, because an
        // ABSENT property and an empty one are different things in the document:
        // `width` left out means "an even share", `width: 0` is refused outright as
        // a column nobody can see, and `header: ''` would be a heading of nothing
        // rather than no heading.
        const next = { ...column, ...patch }
        const merged: DataGridColumn = { field: next.field }
        if (next.width !== undefined) merged.width = next.width
        if (next.align !== undefined) merged.align = next.align
        if (next.header !== undefined && next.header !== '') merged.header = next.header
        return merged
      }),
    )
  }

  const unnamed = children.filter((child) => !draft.some((column) => column.field === child.key))

  return (
    <div data-formancy-part="columns-editor">
      <div id={`${id}-heading`} data-formancy-part="columns-heading">
        {text('columns.heading')}
      </div>

      {draft.length === 0 ? (
        <p data-formancy-part="columns-empty">{text('columns.empty')}</p>
      ) : (
        <ul aria-labelledby={`${id}-heading`} data-formancy-part="columns-list">
          {draft.map((column, index) => (
            // Keyed by position: a column has no identity of its own, and keying by the
            // field it names would remount the row when somebody changes that choice.
            <li key={index} data-formancy-part="column-row">
              {/* A choice and never a text box: a column names a child that exists,
                  and a typed name is a column over nothing. */}
              <label htmlFor={`${id}-field-${String(index)}`}>{text('columns.answer')}</label>
              <select
                id={`${id}-field-${String(index)}`}
                value={column.field}
                onChange={(event) => replace(index, { field: event.target.value })}
              >
                {/* The one it names, even if that child is gone — so the panel shows
                    what the document says rather than silently rewriting it. */}
                {children.some((child) => child.key === column.field) ? null : (
                  <option value={column.field}>
                    {text('columns.noSuchField', { name: column.field })}
                  </option>
                )}
                {children.map((child) => (
                  <option key={child.key} value={child.key}>
                    {child.key}
                  </option>
                ))}
              </select>

              {/* A ratio, never a length: a length in a document is the format choosing
                  the consumer's design system for them, and no renderer can honour one
                  on a narrow screen. */}
              <label htmlFor={`${id}-width-${String(index)}`}>{text('columns.width')}</label>
              <input
                id={`${id}-width-${String(index)}`}
                type="number"
                min={0}
                step={0.5}
                value={column.width ?? ''}
                onChange={(event) =>
                  replace(index, {
                    width: event.target.value === '' ? undefined : Number(event.target.value),
                  })
                }
              />

              <label htmlFor={`${id}-align-${String(index)}`}>{text('columns.align')}</label>
              <select
                id={`${id}-align-${String(index)}`}
                value={column.align ?? ''}
                onChange={(event) =>
                  replace(index, {
                    align: event.target.value === '' ? undefined : (event.target.value as 'start'),
                  })
                }
              >
                <option value="">{text('columns.align.default')}</option>
                <option value="start">{text('columns.align.start')}</option>
                <option value="center">{text('columns.align.center')}</option>
                <option value="end">{text('columns.align.end')}</option>
              </select>

              {/* Shortens the HEADING and never the question: the field's own label is
                  still what a screen reader announces for every answer in the column. */}
              <label htmlFor={`${id}-header-${String(index)}`}>{text('columns.header')}</label>
              <input
                id={`${id}-header-${String(index)}`}
                type="text"
                value={typeof column.header === 'string' ? column.header : ''}
                onChange={(event) => replace(index, { header: event.target.value })}
              />

              <button
                type="button"
                // Named, not an unlabelled cross: four identical remove buttons are four
                // identical announcements.
                aria-label={text('columns.remove', { name: column.field })}
                onClick={() => commit(draft.filter((_, at) => at !== index))}
              >
                {text('list.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {unnamed.length === 0 ? (
        <p data-formancy-part="columns-all-named">{text('columns.allNamed')}</p>
      ) : (
        <button type="button" onClick={() => commit([...draft, { field: unnamed[0]!.key }])}>
          {text('columns.configure', { name: unnamed[0]!.key })}
        </button>
      )}
    </div>
  )
}
