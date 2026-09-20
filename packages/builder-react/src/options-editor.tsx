import { useEffect, useId, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { FieldOption } from '@formancy/spec'

/**
 * The editor for a `select` or `radio` field's choices.
 *
 * Everything else in the property panel is generated from the JSON Schema
 * (see properties.ts), but a list of value/label pairs has no generic
 * rendering that is any good: the schema says "array of objects", and the
 * honest generic answer is a textarea full of JSON.
 *
 * The two columns are not the same kind of thing, and the panel says so.
 * `value` is what lands in the submission and is stable identity — changing it
 * orphans every answer already given, exactly as a field key does
 * (see decision 0011). `label` is what a person reads and is safe to reword.
 */

export interface OptionsEditorProps {
  options: readonly FieldOption[]
  onChange: (options: FieldOption[]) => void
}

export function OptionsEditor({ options, onChange }: OptionsEditorProps): ReactElement {
  const id = useId()

  /*
   * A local draft, because the document refuses invalid states and a person
   * editing text passes through them.
   *
   * Clearing a label to retype it makes it empty for a moment, and the schema
   * requires a non-empty one — so the command is refused, the document does
   * not change, and a purely controlled input snaps back to the old text
   * mid-word. Typing "Schweiz" over "Switzerland" produced
   * "SwitzerlandSchweiz".
   *
   * So the boxes show the draft, every edit is offered to the session, and a
   * refusal simply leaves the document where it was. The form cannot be saved
   * in an invalid state — canPublish still says no — but it can be typed in.
   */
  const [draft, setDraft] = useState<FieldOption[]>(() => [...options])
  const pushed = useRef(JSON.stringify(options))

  useEffect(() => {
    const incoming = JSON.stringify(options)
    // Only adopt a change that came from somewhere else — an undo, or another
    // field being selected. Adopting our own echo would undo the draft.
    if (incoming !== pushed.current) {
      pushed.current = incoming
      setDraft([...options])
    }
  }, [options])

  const commit = (next: FieldOption[]): void => {
    setDraft(next)
    pushed.current = JSON.stringify(next)
    onChange(next)
  }

  const replace = (at: number, patch: Partial<FieldOption>): void => {
    commit(draft.map((option, index) => (index === at ? { ...option, ...patch } : option)))
  }

  return (
    <div data-formancy-part="options-editor">
      <div id={`${id}-heading`} data-formancy-part="options-heading">
        Choices
      </div>

      {draft.length === 0 ? (
        <p data-formancy-part="options-empty">
          No choices yet. A dropdown with none cannot be answered.
        </p>
      ) : (
        <ul aria-labelledby={`${id}-heading`} data-formancy-part="options-list">
          {draft.map((option, index) => (
            // Keyed by position deliberately: an option has no identity of its
            // own, and keying by value would remount the row on every
            // keystroke in the value box, losing focus mid-word.
            <li key={index} data-formancy-part="option-row">
              {/* "Choice label", not "Label": the panel already has a Label
                  for the field itself, and two controls with one name is
                  ambiguous read aloud as well as in a test. */}
              <label htmlFor={`${id}-label-${String(index)}`}>Choice label</label>
              <input
                id={`${id}-label-${String(index)}`}
                type="text"
                value={typeof option.label === 'string' ? option.label : ''}
                onChange={(event) => replace(index, { label: event.target.value })}
              />

              <label htmlFor={`${id}-value-${String(index)}`}>Stored value</label>
              <input
                id={`${id}-value-${String(index)}`}
                type="text"
                value={option.value}
                onChange={(event) => replace(index, { value: event.target.value })}
              />

              <button
                type="button"
                // Named, not an unlabelled ✕: five identical "remove" buttons
                // are five identical announcements.
                aria-label={`Remove ${option.label === '' ? option.value : String(option.label)}`}
                onClick={() => commit(draft.filter((_, at) => at !== index))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => commit([...draft, { value: nextValue(draft), label: 'New choice' }])}
      >
        Add a choice
      </button>
    </div>
  )
}

/**
 * A value nobody is using. Duplicate values are the failure this prevents: two
 * options sharing one makes the answer ambiguous, and the validator refuses the
 * form rather than the keystroke, so the author would learn about it at publish.
 */
function nextValue(options: readonly FieldOption[]): string {
  const taken = new Set(options.map((option) => option.value))
  for (let n = options.length + 1; ; n += 1) {
    const candidate = `option-${String(n)}`
    if (!taken.has(candidate)) return candidate
  }
}
