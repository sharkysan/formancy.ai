import { useField } from '../use-field.js'
import { FieldShell } from './internals.js'
import type { FieldComponentProps } from './internals.js'


/**
 * The temporal controls, each holding one canonical fixed-width string.
 *
 * One file per control, because a control changes for its own reasons.
 * These were one 2,154-line file — the largest in the repository.
 */
export function DateField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  return (
    <FieldShell path={path} field={field} label={label}>
      <input
        type="date"
        {...field.controlProps}
        value={typeof field.value === 'string' ? field.value : ''}
        onChange={(event) => field.setValue(event.target.value === '' ? null : event.target.value)}
        onBlur={() => field.touch()}
      />
    </FieldShell>
  )
}

/**
 * A time of day, as `HH:MM`.
 *
 * `<input type="time">` gives the platform's own picker, its own keyboard handling
 * and its own locale display — a 12-hour clock where the reader expects one — while
 * its `value` is always `HH:MM` on a 24-hour clock. That is exactly the split the
 * format wants: the reader sees their convention, the answer records one canonical
 * shape.
 *
 * `step` is not set, so the browser offers no seconds. A time answer has none, and a
 * control offering a precision the format discards is a control that loses what
 * somebody typed.
 */
export function TimeField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  return (
    <FieldShell path={path} field={field} label={label}>
      <input
        type="time"
        {...field.controlProps}
        /* Bounds are handed to the browser as well as checked by the engine. The
           engine's check is the truth — it runs again on the server — and this is
           what lets the platform grey out what it will not accept, which is a better
           experience than a message after the fact. */
        {...(typeof field.def.earliest === 'string' ? { min: field.def.earliest } : {})}
        {...(typeof field.def.latest === 'string' ? { max: field.def.latest } : {})}
        value={typeof field.value === 'string' ? field.value : ''}
        onChange={(event) => field.setValue(event.target.value === '' ? null : event.target.value)}
        onBlur={() => field.touch()}
      />
    </FieldShell>
  )
}

/**
 * An instant, stored as `YYYY-MM-DDTHH:MM:SSZ`.
 *
 * `<input type="datetime-local">` because there is no zoned datetime input in any
 * browser — so the control shows the reader a local wall clock and this converts.
 * The conversion is the whole reason this component exists rather than reusing
 * `DateField`:
 *
 * - **In:** the control gives `YYYY-MM-DDTHH:MM` in the reader's own zone. `new
 *   Date(local).toISOString()` interprets a zoneless string as local time, which is
 *   what is wanted here and is exactly what `bindTimestamp` refuses for a stored
 *   value — the difference is that the reader's zone is known at the moment they
 *   type, and is not knowable later.
 * - **Out:** the stored instant is rendered back into local time for the control,
 *   sliced to minutes because the input rejects a seconds component it was not asked
 *   for.
 *
 * Seconds are therefore always `00` in an answer a person typed. The format keeps
 * them because a machine-supplied answer has them and a fixed width is what makes
 * ordering work.
 */
export function DateTimeField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  const stored = typeof field.value === 'string' ? field.value : ''
  const asLocal = (): string => {
    if (stored === '') return ''
    const instant = new Date(stored)
    if (Number.isNaN(instant.getTime())) return ''
    // Local parts, not `toISOString()`: that would show UTC in a control the
    // browser labels as local, so the reader would see an hour they did not type.
    const pad = (part: number): string => String(part).padStart(2, '0')
    return (
      `${String(instant.getFullYear())}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}` +
      `T${pad(instant.getHours())}:${pad(instant.getMinutes())}`
    )
  }

  return (
    <FieldShell path={path} field={field} label={label}>
      <input
        type="datetime-local"
        {...field.controlProps}
        value={asLocal()}
        onChange={(event) => {
          const local = event.target.value
          if (local === '') {
            field.setValue(null)
            return
          }
          const instant = new Date(local)
          // A control can hand back something unparseable mid-edit. Writing null
          // rather than a malformed string keeps the stored answer always either
          // empty or canonical, which is what the engine's shape check assumes.
          field.setValue(
            Number.isNaN(instant.getTime())
              ? null
              : `${instant.toISOString().slice(0, 19)}Z`,
          )
        }}
        onBlur={() => field.touch()}
      />
    </FieldShell>
  )
}
