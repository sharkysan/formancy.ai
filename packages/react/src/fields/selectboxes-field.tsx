import { useState } from 'react'
import { narrowOptionsByLabel } from '@formancy/spec'
import { useFormText } from '../context.js'
import { useField } from '../use-field.js'
import { FieldShell, OptionPicture, RequiredHint, useResolvedOptions } from './internals.js'
import type { FieldComponentProps } from './internals.js'


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
  const options = useResolvedOptions(field)
  const chosen = Array.isArray(field.value) ? (field.value as unknown[]).map(String) : []

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const listboxId = `${field.ids.control}:listbox`

  // Not already chosen, then narrowed by what was typed. Offering an answer
  // somebody has already given is offering them a way to do nothing.
  const remaining = options.filter((option) => !chosen.includes(option.value))
  const matches = narrowOptionsByLabel(remaining, query)
  const expanded = open && matches.length > 0

  const add = (value: string): void => {
    // Rebuilt in the options' OWN order rather than the order they were chosen,
    // so two people choosing the same answers store the same array and a diff of
    // two submissions means something.
    const next = options
      .map((option) => option.value)
      .filter((candidate) => candidate === value || chosen.includes(candidate))
    field.setValue(next)
    setQuery('')
    setOpen(false)
  }

  const remove = (value: string): void => {
    field.setValue(chosen.filter((candidate) => candidate !== value))
  }

  const labelFor = (value: string): string =>
    options.find((option) => option.value === value)?.label ?? value

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
      </div>
    </FieldShell>
  )
}

export function SelectBoxesField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  const options = useResolvedOptions(field)
  const showError = field.touched && field.errors.length > 0
  const chosen = Array.isArray(field.value) ? (field.value as unknown[]) : []

  const toggle = (value: string, on: boolean): void => {
    // Rebuilt in the options' own order rather than in the order they were
    // ticked, so two people choosing the same answers store the same array and
    // a diff of two submissions means something.
    const next = options
      .map((option) => option.value)
      .filter((candidate) => (candidate === value ? on : chosen.includes(candidate)))
    field.setValue(next)
  }

  return (
    <fieldset
      data-formancy-part="field"
      data-formancy-field-path={path}
      data-state={showError ? 'invalid' : 'valid'}
      aria-describedby={field.controlProps['aria-describedby']}
    >
      <legend data-formancy-part="label">{label}</legend>
      <RequiredHint field={field} />
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
      {showError ? (
        <p data-formancy-part="error" {...field.errorProps}>
          {field.errors.join(', ')}
        </p>
      ) : null}
    </fieldset>
  )
}
