import { useEffect, useRef, useState } from 'react'
import { ticked } from '@formancy/core'
import { optionsStatus } from '@formancy/core/words'
import { narrowOptionsByLabel } from '@formancy/spec'
import { useFormText } from '../context.js'
import { useField } from '../use-field.js'
import { useSourcedOptions } from '../use-sourced-options.js'
import { Description, ErrorText, FieldShell, OptionPicture, RequiredHint, useResolvedOptions } from './internals.js'
import type { FieldComponentProps, ResolvedOption } from './internals.js'


/**
 * Many answers from a set, as checkboxes or as a tag picker.
 *
 * One file per control, because a control changes for its own reasons.
 * These were one 2,154-line file — the largest in the repository.
 */
/**
 * Several answers from a list, every option visible at once.
 *
 * A `fieldset` with a `legend`, exactly like the radio group, because the
 * relationship is the same one: several controls that answer a single
 * question. What differs is only that more than one may be chosen, which is
 * `type="checkbox"` and an array — not a different structure and not a
 * different way of being announced.
 *
 * Requiring "at least one" is a property of the QUESTION, not of any one box,
 * so it belongs to the group — but not as `aria-required`, which
 * `role="group"` does not support and assistive technology therefore ignores.
 * It is announced through the group's description instead, which the engine
 * composes. Putting it on every box would announce each one as required,
 * which is the opposite of what it means.
 */
/** A `selectboxes` is chips when the author asked for them, tick boxes otherwise. */
export function SelectBoxesSwitch(props: FieldComponentProps) {
  const field = useField(props.path)
  return field.def?.widget === 'tagpicker' ? (
    <TagPickerField {...props} />
  ) : (
    <SelectBoxesField {...props} />
  )
}

/**
 * `widget: "tagpicker"` — several answers, narrowed by typing, shown as chips.
 *
 * A widget rather than a field type because the answer does not change: an array
 * of offered option values in the options' own order, which is what a
 * `selectboxes` stores without it. What changes is that a list too long to tick
 * through becomes usable, and that the list may come from the deployment.
 *
 * **The chips are a list, and each carries its own remove button named after the
 * answer it removes.** "Remove" three times over tells a screen reader user which
 * nothing, and a chip a pointer can add and only a pointer can take away is
 * WCAG 2.1.1 — the failure this pattern ships with more often than any other.
 *
 * The combobox half is the typeahead's, deliberately: the same roles, the same
 * keys and the same `narrowOptionsByLabel` from `@formancy/spec`, so the two
 * cannot come to fold case differently. What differs is that choosing does not
 * fill the box — it adds a chip and clears it, because the next answer is the
 * common case.
 */
export function TagPickerField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  const text = useFormText()
  const chosen = Array.isArray(field.value) ? (field.value as unknown[]).map(String) : []

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const listboxId = `${field.ids.control}:listbox`

  // The document's options, or the source's rows for what was typed, the chosen ones named
  // among them (0215). Every hook before the branch below, as the select's are.
  const written = useResolvedOptions(field)
  const sourced = useSourcedOptions({ ...field, path }, query)
  const remote = sourced.remote
  const options: readonly ResolvedOption[] = remote === null ? written : sourced.options

  // Not already chosen, then narrowed by what was typed. Offering an answer
  // somebody has already given is offering them a way to do nothing. A source's rows are
  // not narrowed again: it was handed the query, as the typeahead's is.
  const remaining = options.filter((option) => !chosen.includes(option.value))
  const matches = remote === null ? narrowOptionsByLabel(remaining, query) : remaining
  // A field a rule disabled draws no list, whatever the person had open: the list and the
  // chips' remove buttons are outside the text box, and the engine does not refuse a value
  // set on a disabled field, so each element is its own guard (B6a). Derived rather than
  // closed in answer to the rule, as the typeahead's is (0177).
  const expanded = open && !field.disabled && matches.length > 0
  // In the typeahead's words: typing asks again, and what the list leaves out is said only
  // while it is open (0177).
  const said =
    remote === null
      ? ''
      : optionsStatus(text, {
          control: 'typeahead',
          open: open && !field.disabled,
          disabled: field.disabled,
          failed: remote.failed,
          busy: remote.busy,
          needs: remote.needs,
          query,
          completeness: remote.completeness,
        })

  const add = (value: string): void => {
    // In the options' own order, and an exclusive option alone (0199): the core's, as the
    // list of ticks below and both of Angular's are.
    field.setValue(ticked(field.def, chosen, value, true))
    setQuery('')
    setOpen(false)
  }

  const remove = (value: string): void => {
    field.setValue(chosen.filter((candidate) => candidate !== value))
  }

  const labelFor = (value: string): string =>
    options.find((option) => option.value === value)?.label ?? value

  // The document names a source this deployment does not have: said where the combobox
  // would be, which could never answer, as the select says it.
  if (remote?.unavailable === true) {
    return (
      <FieldShell path={path} field={field} label={label}>
        {/* The control's id on the sentence in its place, so a summary's link lands here (0221). */}
        <p data-formancy-part="options-unavailable" id={field.controlProps.id} tabIndex={-1}>
          {text('options.unavailable', { source: field.def.optionsSource ?? '' })}
        </p>
      </FieldShell>
    )
  }

  /*
   * A shell with a `<label>`, not a `<fieldset>` with a `<legend>`.
   *
   * A `selectboxes` without this widget is a GROUP of controls, and a legend is
   * exactly right for one. A tag picker is a single combobox with a list of what
   * has been chosen beside it — so a fieldset would name the group and leave the
   * one control somebody actually types into with no accessible name at all,
   * which is how the first version of this shipped and what the case by role and
   * name caught.
   */
  return (
    <FieldShell path={path} field={field} label={label}>
      <div data-formancy-part="tagpicker">
        {chosen.length === 0 ? null : (
          <ul data-formancy-part="tagpicker-chips" aria-label={text('tagpicker.chosen', { label })}>
            {chosen.map((value) => (
              <li key={value} data-formancy-part="tagpicker-chip">
                {labelFor(value)}
                <button
                  type="button"
                  data-formancy-part="tagpicker-remove"
                  // Named after the answer, not "Remove": a row of identical
                  // buttons is a row a screen reader cannot tell apart.
                  aria-label={text('tagpicker.remove', { option: labelFor(value) })}
                  disabled={field.disabled}
                  onClick={() => remove(value)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <div data-formancy-part="tagpicker-anchor">
          <input
            type="text"
            role="combobox"
            {...field.controlProps}
            data-formancy-part="tagpicker-input"
            autoComplete="off"
            aria-expanded={expanded}
            aria-controls={listboxId}
            aria-autocomplete="list"
            // Busy while a source is asked, never disabled: the box is where somebody types.
            aria-busy={remote?.busy === true ? true : undefined}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setOpen(true)
            }}
            onClick={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setOpen(false)
                return
              }
              if (event.key === 'Enter' && expanded && matches[0] !== undefined) {
                event.preventDefault()
                add(matches[0].value)
                return
              }
              // Backspace on an empty box takes the last chip back, which is what
              // every tag picker does and what fingers expect.
              if (event.key === 'Backspace' && query === '' && chosen.length > 0) {
                remove(chosen[chosen.length - 1]!)
              }
            }}
            onBlur={() => {
              setOpen(false)
              field.touch()
            }}
          />
          <ul
            id={listboxId}
            role="listbox"
            aria-label={text('options.suggestions', { label })}
            data-formancy-part="tagpicker-listbox"
            hidden={!expanded}
          >
            {matches.map((option) => (
              <li
                key={option.value}
                role="option"
                data-formancy-part="tagpicker-option"
                aria-selected={false}
                // Keeps DOM focus in the box, which is the pattern's premise:
                // without it the blur runs before the click, and the click lands
                // on a list that has already gone.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => add(option.value)}
              >
                {option.label}
              </li>
            ))}
          </ul>
        </div>
        {/* Only a sourced tag picker has anything to say, and never in the error region:
            a source being down is not a wrong answer. */}
        {remote === null ? null : (
          <p role="status" data-formancy-part="tagpicker-status" data-state={remote.failed ? 'failed' : undefined}>
            {said}
          </p>
        )}
      </div>
    </FieldShell>
  )
}

export function SelectBoxesField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  const text = useFormText()
  // The document's options, or the source's rows asked with the empty query, since nobody
  // types into a list of ticks, with what the form holds among them (0215).
  const written = useResolvedOptions(field)
  const sourced = useSourcedOptions({ ...field, path }, '')
  const remote = sourced.remote
  const options: readonly ResolvedOption[] = remote === null ? written : sourced.options
  const showError = field.touched && field.errors.length > 0
  const chosen = Array.isArray(field.value) ? (field.value as unknown[]) : []

  /*
   * Asking again from the button keeps the button until the source answers: it goes with the
   * failure, and focus on an element that goes falls to the page, where nothing is said, since
   * success is not announced. Answered, the focus moves to the first box if it was still on the
   * button; failed again, it stays there.
   */
  const group = useRef<HTMLFieldSetElement | null>(null)
  const again = useRef<HTMLButtonElement | null>(null)
  const [retrying, setRetrying] = useState(false)
  const settled = remote !== null && !remote.busy && !remote.failed
  useEffect(() => {
    if (!retrying || !settled) return
    setRetrying(false)
    if (document.activeElement === again.current) {
      group.current?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus()
    }
  }, [retrying, settled])

  const said =
    remote === null
      ? ''
      : optionsStatus(text, {
          control: 'ticks',
          open: true,
          disabled: field.disabled,
          failed: remote.failed,
          busy: remote.busy,
          needs: remote.needs,
          query: '',
          completeness: remote.completeness,
        })

  const toggle = (value: string, on: boolean): void => {
    // Rebuilt in the options' own order rather than in the order they were ticked, so two
    // people choosing the same answers store the same array — and an exclusive option is
    // ticked alone, by the core's one function, so no control stores what the engine
    // refuses (0199).
    field.setValue(ticked(field.def, chosen, value, on))
  }

  return (
    // The field's control id on the group, and each box keeps its own, as the radio group
    // does and for its reason (0186).
    <fieldset
      ref={group}
      id={field.ids.control}
      data-formancy-part="field"
      data-formancy-field-path={path}
      data-state={showError ? 'invalid' : 'valid'}
      aria-describedby={field.controlProps['aria-describedby']}
      aria-busy={remote?.busy === true ? true : undefined}
    >
      <legend data-formancy-part="label">{label}</legend>
      <RequiredHint field={field} />
      <Description field={field} />
      {/* A source the deployment does not have: said where the boxes would be, rather than
          an empty group that collects nothing. Focus moved by the group's id lands here (0221). */}
      {remote?.unavailable === true ? (
        <p data-formancy-part="options-unavailable" tabIndex={-1}>
          {text('options.unavailable', { source: field.def.optionsSource ?? '' })}
        </p>
      ) : null}
      {options.map((option) => {
        const optionId = `${field.ids.control}:${option.value}`
        return (
          <span key={option.value} data-formancy-part="checkbox-option">
            <input
              type="checkbox"
              id={optionId}
              name={field.controlProps.name}
              value={option.value}
              checked={chosen.includes(option.value)}
              disabled={field.disabled}
              onChange={(event) => toggle(option.value, event.target.checked)}
              onBlur={() => field.touch()}
            />
            <label htmlFor={optionId}>
              <OptionPicture option={option} />
              {option.label}
            </label>
          </span>
        )
      })}
      {/* What a sourced list says, never in the error region; and, when its source failed,
          a way to ask again, since a list that did not arrive may have no box to move to. */}
      {remote === null || remote.unavailable ? null : (
        <p role="status" data-formancy-part="checkbox-status" data-state={remote.failed ? 'failed' : undefined}>
          {said}
        </p>
      )}
      {remote !== null && (remote.failed || retrying) && !field.disabled ? (
        <button
          ref={again}
          type="button"
          data-formancy-part="checkbox-retry"
          onClick={() => {
            setRetrying(true)
            remote.retry()
          }}
        >
          {text('options.retry')}
        </button>
      ) : null}
      {showError ? <ErrorText field={field} /> : null}
    </fieldset>
  )
}
