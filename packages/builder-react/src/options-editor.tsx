import { useEffect, useId, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { FieldOption } from '@formancy/spec'
import { createBuilderText, nextChoice, withPicture } from '@formancy/builder-core'
import type { BuilderText } from '@formancy/builder-core'

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
  /** The language to speak: the panel passes its session's. English when none is given. */
  text?: BuilderText
  /**
   * Whether each choice may carry a picture — `EditableProperty.pictures`, which
   * builder-core decides from the field's type and widget (0126).
   */
  pictures?: boolean
}

const ENGLISH = createBuilderText()

export function OptionsEditor({
  options,
  onChange,
  text = ENGLISH,
  pictures = false,
}: OptionsEditorProps): ReactElement {
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

  /** The whole choice, not a patch: a picture taken away is a key that is gone. */
  const put = (at: number, next: FieldOption): void => {
    commit(draft.map((option, index) => (index === at ? next : option)))
  }

  return (
    <div data-formancy-part="options-editor">
      <div id={`${id}-heading`} data-formancy-part="options-heading">
        {text('options.heading')}
      </div>

      {draft.length === 0 ? (
        <p data-formancy-part="options-empty">{text('options.empty')}</p>
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
              <label htmlFor={`${id}-label-${String(index)}`}>{text('options.label')}</label>
              <input
                id={`${id}-label-${String(index)}`}
                type="text"
                value={typeof option.label === 'string' ? option.label : ''}
                onChange={(event) => replace(index, { label: event.target.value })}
              />

              <label htmlFor={`${id}-value-${String(index)}`}>{text('options.value')}</label>
              <input
                id={`${id}-value-${String(index)}`}
                type="text"
                value={option.value}
                onChange={(event) => replace(index, { value: event.target.value })}
              />

              {pictures ? (
                <>
                  <label htmlFor={`${id}-image-${String(index)}`}>{text('options.image')}</label>
                  <input
                    id={`${id}-image-${String(index)}`}
                    type="url"
                    value={option.image?.src ?? ''}
                    onChange={(event) => put(index, withPicture(option, { src: event.target.value }))}
                  />

                  <label htmlFor={`${id}-alt-${String(index)}`}>{text('options.imageAlt')}</label>
                  <input
                    id={`${id}-alt-${String(index)}`}
                    type="text"
                    // Nothing to describe until there is a picture; a description typed
                    // first would have nowhere to go.
                    disabled={option.image === undefined}
                    value={typeof option.image?.alt === 'string' ? option.image.alt : ''}
                    onChange={(event) => put(index, withPicture(option, { alt: event.target.value }))}
                  />
                </>
              ) : null}

              <button
                type="button"
                // Named, not an unlabelled ✕: five identical "remove" buttons
                // are five identical announcements.
                aria-label={text('options.remove', {
                  name: option.label === '' ? option.value : String(option.label),
                })}
                onClick={() => commit(draft.filter((_, at) => at !== index))}
              >
                {text('list.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={() => commit([...draft, nextChoice(draft, text)])}>
        {text('options.add')}
      </button>
    </div>
  )
}
