import { useLayoutEffect, useRef } from 'react'
import { useFormText } from '../context.js'
import { useField } from '../use-field.js'
import { RequiredHint, useResolvedOptions } from './internals.js'
import type { FieldComponentProps } from './internals.js'

/**
 * Options put in order ([0138](../../../../docs/decisions/0138-a-ranking-stores-the-order-chosen.md)).
 *
 * **Buttons, and no dragging.** A drag must have an equivalent that is not one (WCAG 2.2
 * SC 2.5.7), and once the buttons exist they are the control: a drag surface is a second
 * route a theme or a consumer may add over the same commands, not the first one.
 *
 * Two lists. The order so far, each option with buttons to move it up, move it down and
 * take it out; and the options not ranked yet, each a button that puts it at the end.
 * Every button is named after the option it acts on — "Move Tea up" — because a column of
 * identical "Up" buttons is a column a screen reader cannot tell apart.
 *
 * **It starts with nothing ranked.** The options' written order is the author's, and an
 * answer that began as it would submit the author's preference as the respondent's.
 *
 * **Focus follows the option.** After "Move Tea up" focus is on Tea's up button in its new
 * place, so moving something three places is three presses of one key; after ranking one,
 * focus moves to the next option still to rank, so ranking them all is a run of Enter.
 */
export function RankingField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  const text = useFormText()
  const options = useResolvedOptions(field)
  const showError = field.touched && field.errors.length > 0
  const order = Array.isArray(field.value) ? (field.value as unknown[]).map(String) : []
  // Only what is offered, in the order chosen: a stored value an option no longer has
  // is the engine's to refuse, and drawing it would draw a button for nothing.
  const ranked = order.flatMap((value) => options.filter((option) => option.value === value))
  const unranked = options.filter((option) => !order.includes(option.value))

  const buttonId = (action: 'up' | 'down' | 'remove' | 'rank', value: string): string =>
    `${field.ids.control}:${action}:${value}`

  // The button to focus once the new order is drawn. A layout effect, so focus moves
  // before the browser paints the list without it — moving a focused element drops focus.
  const focusAfter = useRef<string | null>(null)
  useLayoutEffect(() => {
    const id = focusAfter.current
    if (id === null) return
    focusAfter.current = null
    document.getElementById(id)?.focus()
  })

  const reorder = (next: string[], focus: string): void => {
    focusAfter.current = focus
    field.setValue(next)
  }

  const move = (value: string, by: -1 | 1): void => {
    const from = order.indexOf(value)
    const to = from + by
    if (from === -1 || to < 0 || to >= order.length) return
    const next = [...order]
    next[from] = next[to]!
    next[to] = value
    reorder(next, buttonId(by === -1 ? 'up' : 'down', value))
  }

  const rank = (value: string): void => {
    const position = unranked.findIndex((option) => option.value === value)
    const following = unranked[position + 1] ?? unranked[position - 1]
    reorder(
      [...order, value],
      following === undefined ? buttonId('up', value) : buttonId('rank', following.value),
    )
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
      {ranked.length === 0 ? null : (
        <ol data-formancy-part="ranking-order" aria-label={text('ranking.order', { label })}>
          {ranked.map((option, index) => (
            <li key={option.value} data-formancy-part="ranking-item">
              <span data-formancy-part="ranking-label">{option.label}</span>
              <button
                type="button"
                id={buttonId('up', option.value)}
                data-formancy-part="ranking-up"
                aria-label={text('ranking.up', { option: option.label })}
                // Focusable at the end of the list, so focus is never dropped onto the
                // page when an option reaches the top; it just does nothing there.
                aria-disabled={index === 0 ? true : undefined}
                onClick={() => move(option.value, -1)}
                onBlur={() => field.touch()}
              >
                ↑
              </button>
              <button
                type="button"
                id={buttonId('down', option.value)}
                data-formancy-part="ranking-down"
                aria-label={text('ranking.down', { option: option.label })}
                aria-disabled={index === ranked.length - 1 ? true : undefined}
                onClick={() => move(option.value, 1)}
                onBlur={() => field.touch()}
              >
                ↓
              </button>
              <button
                type="button"
                id={buttonId('remove', option.value)}
                data-formancy-part="ranking-remove"
                aria-label={text('ranking.remove', { option: option.label })}
                onClick={() =>
                  reorder(
                    order.filter((value) => value !== option.value),
                    buttonId('rank', option.value),
                  )
                }
                onBlur={() => field.touch()}
              >
                ×
              </button>
            </li>
          ))}
        </ol>
      )}
      {unranked.length === 0 ? null : (
        <ul data-formancy-part="ranking-pool" aria-label={text('ranking.pool', { label })}>
          {unranked.map((option) => (
            <li key={option.value} data-formancy-part="ranking-candidate">
              <button
                type="button"
                id={buttonId('rank', option.value)}
                data-formancy-part="ranking-add"
                aria-label={text('ranking.rank', { option: option.label })}
                onClick={() => rank(option.value)}
                onBlur={() => field.touch()}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {showError ? (
        <p data-formancy-part="error" {...field.errorProps}>
          {field.errors.join(', ')}
        </p>
      ) : null}
    </fieldset>
  )
}
