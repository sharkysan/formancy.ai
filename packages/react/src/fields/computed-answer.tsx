import { answerInWords } from '@formancy/core/words'
import { useFormEngine, useFormText } from '../context.js'
import { useField } from '../use-field.js'
import { FieldShell } from './internals.js'
import type { FieldComponentProps } from './internals.js'

/**
 * A field a computed rule writes, where its own control has no read-only state: its answer in
 * words, in a read-only box (0216).
 *
 * A computed value is the engine's, and is read rather than operated (0181). A tick box, a
 * choice, a list, a ranking, a matrix, a rating or a signature drawn as itself took a change the
 * engine refused. `readOnly`, never `disabled`, as a computed number's box is: it stays in the
 * tab order and is not greyed out. The words are a submission read back's, so this box says what
 * the review and the admin say of the same answer. The Angular binding draws the same box.
 */
export function ComputedAnswerField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  const engine = useFormEngine()
  const text = useFormText()
  return (
    <FieldShell path={path} field={field} label={label}>
      <input type="text" readOnly {...field.controlProps} value={answerInWords(engine.schema(), field.def, field.value, text, engine.locale())} />
    </FieldShell>
  )
}
