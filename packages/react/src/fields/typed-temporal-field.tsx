import type { TypedTemporalType } from '@formancy/spec'
import { useField } from '../use-field.js'
import { FieldShell, usePlaceholder } from './internals.js'
import { TypedTemporalInput } from './typed-temporal-input.js'

/**
 * A `time` or a `datetime` that declares a `precision`, typed into its own shape: the shell
 * and the engine's binding around `TypedTemporalInput`, which is the control itself and is
 * exported for a host that draws one of its own.
 *
 * Written only on the person's input, never on mount: an answer somebody supplied and
 * nobody touched is submitted byte for byte, whatever width it has.
 */
export function TypedTemporalField({ path, label, type }: { path: string; label: string; type: TypedTemporalType }) {
  const field = useField(path)
  const placeholder = usePlaceholder(field)
  const precision = typeof field.def.precision === 'number' ? field.def.precision : 0

  return (
    <FieldShell path={path} field={field} label={label}>
      <TypedTemporalInput
        {...field.controlProps}
        type={type}
        precision={precision}
        value={typeof field.value === 'string' ? field.value : ''}
        onChange={field.setValue}
        // Read-only, never disabled, so a computed answer is still reached and read (0181).
        readOnly={field.readOnly}
        placeholder={placeholder}
        onBlur={() => field.touch()}
      />
    </FieldShell>
  )
}
