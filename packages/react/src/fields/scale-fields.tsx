import { useField } from '../use-field.js'
import { FieldShell } from './internals.js'
import type { FieldComponentProps } from './internals.js'

/**
 * A rating and a slider: one number, two controls.
 *
 * Both are widgets on `number` and neither changes the answer
 * ([0104](../../../docs/decisions/0104-spec-4-opens-with-a-widget-not-a-type.md)),
 * so what is interesting here is the two ways a scale control goes wrong.
 *
 * **The keyboard.** Stars drawn as a row of buttons are a row of tab stops that
 * a screen reader announces as unrelated controls, with no sense that they form
 * a scale or that one is chosen. A rating is a **radio group**: one tab stop,
 * arrow keys along the scale, and the chosen value announced as "3 of 11". That
 * is not a concession to accessibility — it is what the control is.
 *
 * **The bounds.** A scale needs both ends, and the format cannot require them:
 * `min` and `max` are optional on every number field, and making them
 * conditional on a widget would mean a document that stops validating when
 * somebody changes presentation. So a field with no bounds falls back to the
 * ordinary number input rather than drawing a scale of 1–5 or 0–100 that the
 * author never wrote. A control that invents its own range is worse than one
 * that is plain.
 */

/** Every value on the scale, inclusive of both ends. */
function scaleOf(min: number, max: number, step: number): number[] {
  const out: number[] = []
  // `<=` with a half-step of slack: the ends are inclusive — 0 to 10 is eleven
  // options, not ten, and an NPS scale that started at 1 would drop the answer
  // somebody meant. The slack is for the same binary-fraction reason the engine's
  // step check has a tolerance.
  for (let value = min; value <= max + step / 2; value += step) {
    out.push(Math.round(value / step) * step)
  }
  return out
}

/** Both ends, or nothing: the condition for drawing a scale at all. */
function boundsOf(def: { min?: number; max?: number; step?: number }):
  | { min: number; max: number; step: number }
  | undefined {
  if (def.min === undefined || def.max === undefined || def.max <= def.min) return undefined
  // One, because that is what `<input type="range">` steps by with no attribute:
  // leaving it out and writing it are the same control. The opposite reading —
  // that a missing step means continuous — is what a reader assumes and is wrong.
  return { min: def.min, max: def.max, step: def.step !== undefined && def.step > 0 ? def.step : 1 }
}

/**
 * Which control a `number` field gets.
 *
 * The same shape `selectboxes` uses for its tag picker: one switch per type, so
 * the registry keeps one entry and a widget cannot be registered independently
 * of the type it belongs to ([0065](../../../docs/decisions/0065-a-widget-is-authored-not-registered.md)).
 */
export function NumberSwitch(props: FieldComponentProps) {
  const field = useField(props.path)
  if (field.def?.widget === 'rating') return <RatingField {...props} />
  if (field.def?.widget === 'slider') return <SliderField {...props} />
  return <NumberFallback {...props} />
}

export function RatingField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  const bounds = boundsOf(field.def ?? {})
  if (bounds === undefined) return <NumberFallback path={path} label={label} />

  const { controlProps } = field
  const chosen = typeof field.value === 'number' ? field.value : undefined

  return (
    <FieldShell path={path} field={field} label={label}>
      {/*
        The group carries the field's wiring — the id, the describedby, the
        invalid state — and the radios carry the name that binds them. That split
        is why `controlProps` is spread here and not on each input: an
        `aria-describedby` repeated eleven times is the error text read eleven
        times.
      */}
      {/*
        `aria-labelledby`, not the label's `for`. A `label[for]` names a form
        control and a `role="radiogroup"` div is not one — so the group rendered
        with no accessible name at all, and a screen reader announced "radio
        group" with no indication of the question. The shell already gives the
        label the id the engine minted; this points at it.
      */}
      <div
        {...controlProps}
        role="radiogroup"
        aria-labelledby={field.ids.label}
        data-formancy-part="rating"
      >
        {scaleOf(bounds.min, bounds.max, bounds.step).map((value) => (
          <label key={value} data-formancy-part="rating-step" data-chosen={value === chosen ? 'true' : undefined}>
            <input
              type="radio"
              name={controlProps.id}
              value={value}
              checked={value === chosen}
              onChange={() => field.setValue(value)}
              onBlur={() => field.touch()}
            />
            {/* The number is the accessible name. A star with no name reads as
                "radio button, blank", and a scale whose options cannot be told
                apart is a scale nobody can use by ear. */}
            <span data-formancy-part="rating-label">{value}</span>
          </label>
        ))}
      </div>
    </FieldShell>
  )
}

export function SliderField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  const bounds = boundsOf(field.def ?? {})
  if (bounds === undefined) return <NumberFallback path={path} label={label} />

  /*
   * Where the thumb sits when there is no answer.
   *
   * A range input with no value sits at the midpoint — the browser's own
   * behaviour — so the thumb's position is a claim about an answer that does not
   * exist. The engine is told nothing, so `required` still bites and the
   * submission carries no number; the read-out shows where the thumb is rather
   * than pretending it is the answer.
   */
  const midpoint = bounds.min + (bounds.max - bounds.min) / 2
  const shown = typeof field.value === 'number' ? field.value : midpoint

  return (
    <FieldShell path={path} field={field} label={label}>
      <div data-formancy-part="slider">
        <input
          type="range"
          {...field.controlProps}
          min={bounds.min}
          max={bounds.max}
          step={bounds.step}
          value={shown}
          onChange={(event) => field.setValue(event.target.valueAsNumber)}
          onBlur={() => field.touch()}
        />
        {/*
          A span, not an `<output>`. `<output>` carries an implicit `role="status"`,
          which makes it a **live region** — so every step of a drag would be
          announced, on top of the value the range input announces itself. That is
          the double-announcement bug the accessibility design warns about, and the
          playground's own "every control has an accessible name" guard is what
          found it: an `<output>` with no name is a status region with nothing to
          say.

          The slider announces its own value. This is decoration for everybody
          else, so it is hidden from the tree entirely.
        */}
        <span data-formancy-part="slider-value" aria-hidden="true">
          {shown}
        </span>
      </div>
    </FieldShell>
  )
}

/**
 * The ordinary number input, for a field whose bounds a scale cannot be drawn
 * from.
 *
 * A copy of `NumberField` rather than an import, and deliberately: importing it
 * would make `text-fields.tsx` and this file a cycle, and the duplication is six
 * lines of the most stable markup in the package. The thing that must not
 * diverge is what the field *stores*, and that is the engine's.
 */
function NumberFallback({ path, label }: FieldComponentProps) {
  const field = useField(path)
  return (
    <FieldShell path={path} field={field} label={label}>
      <input
        type="number"
        {...field.controlProps}
        value={typeof field.value === 'number' ? field.value : ''}
        onChange={(event) =>
          field.setValue(event.target.value === '' ? null : event.target.valueAsNumber)
        }
        onBlur={() => field.touch()}
      />
    </FieldShell>
  )
}
