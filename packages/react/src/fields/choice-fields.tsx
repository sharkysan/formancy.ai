import { optionsStatus } from '@formancy/core/words'
import { useFormText } from '../context.js'
import { useField } from '../use-field.js'
import { useSourcedOptions } from '../use-sourced-options.js'
import { Description, ErrorText, FieldShell, OptionPicture, RequiredHint, useResolvedOptions } from './internals.js'
import type { FieldComponentProps } from './internals.js'
import { TypeaheadSelectField } from './typeahead-field.js'


/**
 * One answer from a set: a tick, a list, or a group of radios.
 *
 * One file per control, because a control changes for its own reasons.
 * These were one 2,154-line file — the largest in the repository.
 */
export function CheckboxField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  return (
    <FieldShell path={path} field={field} label={label}>
      <input
        type="checkbox"
        {...field.controlProps}
        /* `widget: "toggle"` is a part name and NOT `role="switch"`. ARIA's switch
           means a control that takes effect when you operate it, and a form field
           sets a value submitted later or never — so announcing "switch" describes
           it incorrectly to the people who rely on the description. A role is also
           not paint: changing it would make this the first widget to change what a
           control claims to be, which is the line the widget mechanism exists to
           hold. The switch is CSS, and conformance keeps finding this by role
           `checkbox` either way. */
        {...(field.def.widget === 'toggle' ? { 'data-formancy-part': 'toggle' } : {})}
        checked={field.value === true}
        onChange={(event) => field.setValue(event.target.checked)}
        onBlur={() => field.touch()}
      />
    </FieldShell>
  )
}

export function SelectField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  const text = useFormText()
  // The query the plain control searches with is the empty one: a native select has
  // nothing to type into, so it offers whatever the source returns for "everything",
  // capped. A source with more rows than that is a source whose field wants the
  // typeahead widget, and the status region says what the list leaves out, in words
  // that ask nobody to type.
  // One hook, unconditionally: it hands back the document's own options when the
  // field names no source, so there is no branch above a hook to reorder React's
  // list the moment the builder sets one on a live document.
  const sourced = useSourcedOptions({ ...field, path }, '', field.def.widget !== 'typeahead')
  const options = sourced.options
  const remote = sourced.remote
  // Open whenever it is enabled, as far as the sentence goes: a native select has no
  // "list opened" event to wait for (0177).
  const said =
    remote === null
      ? ''
      : optionsStatus(text, {
          control: 'select',
          open: true,
          disabled: field.disabled,
          failed: remote.failed,
          busy: remote.busy,
          needs: remote.needs,
          query: '',
          completeness: remote.completeness,
        })
  // Every hook runs before the branch on purpose: the builder can set a widget on
  // a live document, and a branch above a hook would reorder React's hook list
  // the moment it did.

  // The document names a source this deployment does not have. Unlike a missing
  // scanner this costs the whole field -- a select with no options collects nothing
  // -- so it says so where the chooser would be, exactly as the file field does.
  //
  // BEFORE the widget, and the order is the fix: dispatching to the typeahead first
  // made this message unreachable for the very widget the feature was built for. What
  // somebody got instead was a working-looking combobox that returned nothing and
  // announced "No options match" -- which says the list has no such row, when the
  // truth is that there is no list.
  if (sourced.remote?.unavailable === true) {
    return (
      <FieldShell path={path} field={field} label={label}>
        {/* The control's id on the sentence in its place, so a summary's link lands here (0221). */}
        <p data-formancy-part="options-unavailable" id={field.controlProps.id} tabIndex={-1}>
          {text('options.unavailable', { source: field.def.optionsSource ?? '' })}
        </p>
      </FieldShell>
    )
  }

  if (field.def.widget === 'typeahead') {
    return <TypeaheadSelectField path={path} label={label} field={field} />
  }

  return (
    <FieldShell path={path} field={field} label={label}>
      {/* Setting `value` on the select works only because React applies it
          AFTER the option children render; a select's value property is
          settable once its options exist. Angular binds [selected] per option
          for the same reason — the explicit form of the same contract. */}
      <select
        {...field.controlProps}
        // What the answer is, for a browser to fill (WCAG 1.3.5, 0195); absent, no attribute.
        autoComplete={field.def.autocomplete}
        value={typeof field.value === 'string' ? field.value : ''}
        onChange={(event) => field.setValue(event.target.value === '' ? null : event.target.value)}
        // A failed source is asked again when the person moves to the field. Focus
        // comes before every way of opening a native select, by pointer or by keyboard,
        // and it is the person's own act: not a timer, which would load a source that
        // is down and speak in a live region on a schedule. Only after a failure, so a
        // select is not refetched on every visit.
        onFocus={() => {
          if (remote?.failed === true) remote.retry()
        }}
        onBlur={() => field.touch()}
      >
        {/* The empty option is the unanswered state; without it the browser
            silently pre-selects the first real option, which the engine never
            heard about. */}
        <option value="" />
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {/* Only a sourced select has anything to say: what its list leaves out, that
          its source answers only a search, or that the source could not be reached.
          Never the error region, which carries the engine's verdict — a source being
          down is not a wrong answer. */}
      {remote === null ? null : (
        <p role="status" data-formancy-part="select-status">
          {said}
        </p>
      )}
    </FieldShell>
  )
}

export function RadioGroupField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  const options = useResolvedOptions(field)
  const showError = field.touched && field.errors.length > 0
  return (
    // The field's control id on the group, as the rating, the ranking and the matrix carry
    // it, and each radio keeps its own `<id>:<value>`: the error summary's link and a failed
    // submit focus by this id, and a fieldset takes no focus, so `focusControl` moves into
    // the first radio. Without it no element had the id and both left focus where it was
    // (0186).
    <fieldset
      id={field.ids.control}
      data-formancy-part="field"
      data-formancy-field-path={path}
      data-state={showError ? 'invalid' : 'valid'}
      aria-describedby={field.controlProps['aria-describedby']}
    >
      <legend data-formancy-part="label">{label}</legend>
      <RequiredHint field={field} />
      <Description field={field} />
      {options.map((option) => {
        const optionId = `${field.ids.control}:${option.value}`
        return (
          <span key={option.value} data-formancy-part="radio-option">
            <input
              type="radio"
              id={optionId}
              name={field.controlProps.name}
              value={option.value}
              checked={field.value === option.value}
              // Each radio, as each tick box: the engine takes a value set on a disabled field,
              // so the element is the only thing that keeps a rule's `disabled` (B6a, 0210).
              disabled={field.disabled}
              onChange={() => field.setValue(option.value)}
              onBlur={() => field.touch()}
            />
            <label htmlFor={optionId}>
              <OptionPicture option={option} />
              {option.label}
            </label>
          </span>
        )
      })}
      {showError ? <ErrorText field={field} /> : null}
    </fieldset>
  )
}
