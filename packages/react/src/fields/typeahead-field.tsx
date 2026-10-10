import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { narrowOptionsByLabel } from '@formancy/spec'
import { useFormText } from '../context.js'
import type { FieldBinding } from '../use-field.js'
import { useSourcedOptions } from '../use-sourced-options.js'
import { FieldShell, optionDomId, statusState } from './internals.js'
import type { FieldComponentProps } from './internals.js'


/**
 * A combobox over the same answer a select holds.
 *
 * One file per control, because a control changes for its own reasons.
 * These were one 2,154-line file — the largest in the repository.
 */
export function TypeaheadSelectField({
  path,
  label,
  field,
}: FieldComponentProps & {
  field: FieldBinding
}) {
  const text = useFormText()
  /**
   * What is in the box while somebody types, or null when the box is simply
   * showing the answer.
   *
   * Two states rather than one string, because "empty because they cleared it"
   * and "empty because there is no answer" are different facts, and only the
   * first clears the answer on the way out.
   */
  const [query, setQuery] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  /** The arrowed-over option by VALUE, not by index: the filtered list changes on
   *  every keystroke and an index would point at a different row after one. */
  const [activeValue, setActiveValue] = useState<string | null>(null)

  // The options, from the document or from the deployment. The query goes in so a
  // source is asked what somebody is looking for rather than for everything.
  const sourced = useSourcedOptions({ ...field, path }, query ?? '')
  const options = sourced.options

  const chosen = options.find((option) => option.value === field.value)
  // A source is the authority on what matches: it was handed the query, and
  // re-folding its rows here would drop ones it matched on data the person cannot
  // see. A host that wants fetch-once-filter-locally composes `narrowOptionsByLabel`
  // in its own resolver, which is why that function lives in `@formancy/spec`.
  const matches =
    sourced.remote === null ? narrowOptionsByLabel(options, query ?? '') : options
  /** Collapsed whenever there is nothing on the screen, so `aria-expanded` never
   *  claims a popup a person cannot see. */
  const expanded = open && matches.length > 0
  const activeIndex = matches.findIndex((option) => option.value === activeValue)
  const activeId =
    expanded && activeIndex !== -1 ? optionDomId(field, matches[activeIndex]!.value) : undefined
  const listboxId = `${field.ids.control}:listbox`

  const choose = (value: string): void => {
    field.setValue(value)
    setQuery(null)
    setOpen(false)
    setActiveValue(null)
  }

  const moveActive = (delta: number): void => {
    if (matches.length === 0) return
    const from = activeIndex === -1 ? (delta > 0 ? -1 : matches.length) : activeIndex
    // Clamped, not wrapped: Down means further down the list, and a list that
    // jumps back to the top moves somebody past the end without saying so.
    const next = Math.min(Math.max(from + delta, 0), matches.length - 1)
    setActiveValue(matches[next]!.value)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        // Opens ON the answer when there is one, so Down then Enter cannot
        // quietly change an answer somebody only wanted to look at.
        const fallback = event.key === 'ArrowDown' ? matches[0] : matches[matches.length - 1]
        setActiveValue(chosen?.value ?? fallback?.value ?? null)
        return
      }
      moveActive(event.key === 'ArrowDown' ? 1 : -1)
      return
    }
    if ((event.key === 'Home' || event.key === 'End') && expanded) {
      // The popup's keys while it is open. Left to the caret, a long list is
      // reachable only by holding Down.
      event.preventDefault()
      setActiveValue((event.key === 'Home' ? matches[0]! : matches[matches.length - 1]!).value)
      return
    }
    if (event.key === 'Enter') {
      // Only while the list is showing. Otherwise Enter belongs to the form, and
      // a control that swallowed it would break submitting from the keyboard.
      if (!expanded) return
      event.preventDefault()
      if (activeIndex === -1) {
        setOpen(false)
        return
      }
      choose(matches[activeIndex]!.value)
      return
    }
    if (event.key === 'Escape') {
      if (!open && query === null) return
      event.preventDefault()
      // "Never mind about this list", not "delete what I chose earlier": the
      // query is abandoned and the ANSWER is untouched.
      setOpen(false)
      setActiveValue(null)
      setQuery(null)
    }
  }

  const onBlur = (): void => {
    setOpen(false)
    setActiveValue(null)
    if (query !== null) {
      // An emptied box is the empty option, and the only route to null. Anything
      // else typed is abandoned - it was never an answer.
      if (query.trim() === '') field.setValue(null)
      setQuery(null)
    }
    field.touch()
  }

  return (
    <FieldShell path={path} field={field} label={label}>
      {/* The popup's containing block, and the reason it is an element rather than
          nothing at all.

          The popup was absolutely positioned with `top: auto`, on the reasoning that it
          would then land at its STATIC position -- where it would have sat in the flow,
          directly under the box. That holds inside a block container and NOT inside a
          grid or flex one, and every theme lays a field out with `display: grid`. For an
          absolutely positioned child of a grid container the static position is the
          container's own content-box origin, so the list opened over its own label and
          box rather than under them. Measured in the playground before the fix: the
          field's top edge was 457px, an in-flow child would have sat at 537px, and the
          popup sat at 459px.

          So the popup is given a containing block that wraps the control and nothing
          else, and every theme positions it against that explicitly. The status region
          stays OUTSIDE it, because it is a row of the field's grid exactly as the error
          region is. */}
      <div data-formancy-part="typeahead-anchor">
        <input
          type="text"
          role="combobox"
          {...field.controlProps}
          data-formancy-part="typeahead"
          // The browser's own suggestion list would sit over this one. This is not
          // the HTML autofill token WCAG 1.3.5 asks for: that is a separate thing
          // the spec has deliberately not spent the word on yet.
          autoComplete="off"
          aria-expanded={expanded}
          aria-controls={listboxId}
          aria-autocomplete="list"
          {...(sourced.remote?.busy === true
            ? // Busy, never disabled: disabling the element somebody just typed into
              // blurs it and the browser resets focus to the document body -- the same
              // reason the scanner's button stays enabled while a scan is in flight.
              { 'aria-busy': true }
            : {})}
          {...(activeId === undefined ? {} : { 'aria-activedescendant': activeId })}
          value={query ?? chosen?.label ?? ''}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
            // Nothing is active on a keystroke: aria-activedescendant is ABSENT
            // rather than pointing at a row the person has not moved to.
            setActiveValue(null)
          }}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
        />
        {/* Named, because `listbox` is one of the roles whose accessible name is
            required -- `aria-query`'s `listboxRole.accessibleNameRequired` is true.
            axe in jsdom does NOT report its absence, measured by removing this line
            and watching the audit below stay green, so the case that holds it in
            place is a query by role AND name rather than the auditor.

            Not the field's own name: two elements answering to the same accessible
            name make "the control called X" ambiguous for every query that uses it,
            starting with the conformance driver's own. */}
        <ul
          id={listboxId}
          role="listbox"
          aria-label={text('options.suggestions', { label })}
          data-formancy-part="typeahead-listbox"
          hidden={!expanded}
        >
          {matches.map((option) => (
            <li
              key={option.value}
              id={optionDomId(field, option.value)}
              role="option"
              data-formancy-part="typeahead-option"
              data-active={option.value === activeValue ? 'true' : undefined}
              {...(chosen?.value === option.value ? { 'aria-selected': true } : {})}
              // Keeps DOM focus in the text box, which is the pattern's whole
              // premise; without it the blur handler runs before the click and the
              // click lands on a list that has already gone.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option.value)}
            >
              {option.label}
            </li>
          ))}
        </ul>
      </div>
      {/* Present from the start and empty until there is something to say: a live
          region created at the moment it gets its text is one several screen
          readers never announce.

          ONE region, and never the error region. A source being down is not a wrong
          answer, and the error region is the control's `aria-describedby` target
          carrying the engine's verdict — the same line the scanner draws.

          A source's own words win over "no options match": while a request is in
          flight, "nothing matched" is not yet true. */}
      <p
        role="status"
        data-formancy-part="typeahead-status"
        {...(statusState({ sourced, open, matches: matches.length }) === undefined
          ? {}
          : { 'data-state': statusState({ sourced, open, matches: matches.length }) })}
      >
        {sourced.remote !== null && sourced.remote.status !== ''
          ? sourced.remote.status
          : open && matches.length === 0 && sourced.remote?.busy !== true
            ? text('options.noMatch')
            : ''}
      </p>
    </FieldShell>
  )
}
