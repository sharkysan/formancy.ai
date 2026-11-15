import type { MouseEvent, ReactNode } from 'react'
import { useField, useFormEngine } from '@formancy/react'
import { PICKUP_POINTS } from './demo-capabilities.js'
import { besideWords } from './demo-beside-words.js'
import { CLEAR_GLYPH, OPEN_GLYPH } from './demo-glyphs.js'

/** A glyph a theme sizes and colours: hidden from assistive technology, since the button is named. */
function Glyph({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d={path} />
    </svg>
  )
}

/**
 * Beside the pickup point, an Open, the button a host such as Formancy Data will draw beside a
 * lookup for the record it points to. The playground has no record to open, so a press does what
 * such a host's does once the record is open below: it moves the keyboard there, to the point drawn
 * under the field (`demo-addition.tsx`). Unavailable while no point is chosen, and still drawn, so
 * the box keeps its width when one is picked and the keyboard keeps its place when one is cleared.
 * Named in the form's language (`demo-beside-words.ts`).
 */
function OpenPoint({ path }: { path: string }) {
  const field = useField(path)
  const words = besideWords(useFormEngine().locale())
  const point = PICKUP_POINTS.find((each) => each.value === field.value)
  const name = words.open(point?.label)
  const press = (event: MouseEvent<HTMLButtonElement>) => {
    if (point === undefined) return
    event.currentTarget.closest('[data-formancy-part="field"]')?.querySelector<HTMLElement>('.chosen-point')?.focus()
  }
  return (
    <button type="button" aria-label={name} title={name} aria-disabled={point === undefined ? 'true' : undefined} onClick={press}>
      <Glyph path={OPEN_GLYPH} />
    </button>
  )
}

/**
 * Beside the country, a Clear: the answer taken away, as the select's empty option does, and the
 * keyboard left on the button, which stays as it becomes unavailable.
 */
function ClearCountry({ path }: { path: string }) {
  const field = useField(path)
  const { clear } = besideWords(useFormEngine().locale())
  const empty = field.value === null || field.value === undefined || field.value === ''
  return (
    <button
      type="button"
      aria-label={clear}
      title={clear}
      aria-disabled={empty ? 'true' : undefined}
      onClick={() => {
        if (!empty) field.setValue(null)
      }}
    >
      <Glyph path={CLEAR_GLYPH} />
    </button>
  )
}

/**
 * What the playground draws beside a field's box (0237): a button beside the pickup point, a
 * typeahead, and beside the country, a select, the two controls that draw one, and nothing beside
 * anything else. A constant, as the form asks.
 */
export const besideDemo = (path: string): ReactNode =>
  path === 'deliveryPoint' ? <OpenPoint path={path} /> : path === 'country' ? <ClearCountry path={path} /> : null
