import { readAnswers } from './answers-in-words.js'
import type { SaidAnswer } from './answers-in-words.js'
import type { FormEngine } from './engine.js'
import { parsePath } from './path.js'
import type { FormText } from './words.js'

/** One answer as a person checks it before sending: in words, and where to go to change it. */
export interface ReviewedAnswer extends SaidAnswer {
  /** The page its question is on, which a "Change" goes back to. */
  readonly page: number
  /** The element a "Change" focuses: its question's control, or its group. */
  readonly controlId: string
  /**
   * Whether the question has an answer. One that has none is a question the person is being
   * asked and left — `said` is the words for "not answered" — and nothing of it is sent (0214).
   */
  readonly answered: boolean
}

/*
 * What a person checks before sending (0204): every question the form now asks, in document
 * order, in the form's language — an answer in words, or that it was left unanswered (0214) —
 * with the page and the control each one is changed at, so both renderers draw one list and
 * send a "Change" to one place.
 *
 * A question is asked when it is shown, takes an answer and is the person's to give: not one a
 * rule hides or a skipped page holds, not one a rule disables or computes, and never a `hidden`
 * field, which nobody sees. Read by the walk `answersInWords` takes, so the review and a
 * submission read back agree about what was answered.
 */
export function answersToReview(engine: FormEngine, text: FormText): ReviewedAnswer[] {
  const schema = engine.schema()
  const asked = (field: string): boolean => {
    const snapshot = engine.getFieldSnapshot(parsePath(field))
    return snapshot.type !== 'hidden' && snapshot.visible && !snapshot.disabled && !snapshot.readOnly
  }
  return readAnswers(schema, engine.value(), text, engine.locale(), asked).map(({ line, answered }) => {
    const field = parsePath(line.field)
    return { ...line, answered, page: engine.pageOf(field), controlId: engine.getFieldSnapshot(field).ids.control }
  })
}
