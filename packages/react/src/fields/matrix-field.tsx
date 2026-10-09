import { useFormEngine } from '../context.js'
import { useField } from '../use-field.js'
import { RequiredHint, useResolvedOptions } from './internals.js'
import type { FieldComponentProps } from './internals.js'

/**
 * One question asked of several rows ([0139](../../../../docs/decisions/0139-a-matrix-answers-one-question-per-row.md)).
 *
 * **A group per row.** The matrix is a fieldset named by its label; each row is a fieldset
 * named by its row, holding a radio per column named by its column. That is a radio group
 * per row, which is exactly what each row is: arrow keys move within it, Tab moves to the
 * next, and every answer is reached by role and name. Not a `<table>` — its rows and
 * columns would be announced as data, and each radio would need a name made of two headers.
 * Looking like a grid is the theme's business, through the parts below.
 *
 * Each row's radios share a name of their own, so choosing in one row never clears another.
 */
export function MatrixField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  const engine = useFormEngine()
  const columns = useResolvedOptions(field)
  const rows = (field.def?.rows ?? []).map((row) => ({
    value: row.value,
    label: engine.text(row.label) ?? row.value,
  }))
  const showError = field.touched && field.errors.length > 0
  const answer =
    typeof field.value === 'object' && field.value !== null && !Array.isArray(field.value)
      ? (field.value as Record<string, unknown>)
      : {}

  const choose = (row: string, column: string): void => {
    field.setValue({ ...answer, [row]: column })
  }

  return (
    <fieldset
      id={field.ids.control}
      data-formancy-part="field"
      data-formancy-field-path={path}
      data-state={showError ? 'invalid' : 'valid'}
      aria-describedby={field.controlProps['aria-describedby']}
      disabled={field.disabled}
    >
      <legend data-formancy-part="label">{label}</legend>
      <RequiredHint field={field} />
      <div data-formancy-part="matrix" data-columns={String(columns.length)}>
        {rows.map((row) => (
          <fieldset key={row.value} data-formancy-part="matrix-row">
            <legend data-formancy-part="matrix-row-label">{row.label}</legend>
            {columns.map((column) => {
              const id = `${field.ids.control}:${row.value}:${column.value}`
              return (
                <span key={column.value} data-formancy-part="matrix-option">
                  <input
                    type="radio"
                    id={id}
                    name={`${field.controlProps.name}.${row.value}`}
                    value={column.value}
                    checked={answer[row.value] === column.value}
                    onChange={() => choose(row.value, column.value)}
                    onBlur={() => field.touch()}
                  />
                  <label htmlFor={id}>{column.label}</label>
                </span>
              )
            })}
          </fieldset>
        ))}
      </div>
      {showError ? (
        <p data-formancy-part="error" {...field.errorProps}>
          {field.errors.join(', ')}
        </p>
      ) : null}
    </fieldset>
  )
}
