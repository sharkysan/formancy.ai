import { useEffect, useRef, useState } from 'react'
import { countSentence } from '@formancy/core/words'
import { useFormText } from '../context.js'
import type { FieldBinding } from '../use-field.js'

/* How long typing pauses before the count is spoken: long enough not to talk over a word. */
const PAUSE_MS = 1000

/*
 * A character count under a box with a `maxLength` (0203): the limit, then what is left, shown at
 * once and read with the control through `aria-describedby`; and said in a polite live region
 * once typing pauses, so a screen reader hears it without hearing every keystroke. Nothing is
 * spoken until the person types — a page whose every counted field spoke its limit on load would
 * talk over them.
 */
export function CharacterCount({ field }: { field: FieldBinding }) {
  const text = useFormText()
  const said = countSentence(text, field.def, field.value)
  const [spoken, setSpoken] = useState('')
  const first = useRef(said)

  useEffect(() => {
    if (said === undefined || said === first.current) return
    first.current = undefined
    const timer = setTimeout(() => setSpoken(said), PAUSE_MS)
    return () => clearTimeout(timer)
  }, [said])

  if (said === undefined) return null
  return (
    <>
      <p id={field.props.count.id} data-formancy-part="count">
        {said}
      </p>
      <p role="status" data-formancy-part="visually-hidden">
        {spoken}
      </p>
    </>
  )
}
