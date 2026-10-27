import { answersInWords } from './answers-in-words.js'
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
}

/*
 * What a person checks before sending (0204): what `answersInWords` says of the form as it now
 * stands — every answer that will be sent, in document order, in the form's language — with the
 * page and the control each one is changed at, so both renderers draw one list and send a
 * "Change" to one place. A question nobody answered has no line, as a submission read back has
 * none: the review is of what is sent.
 */
export function answersToReview(engine: FormEngine, text: FormText): ReviewedAnswer[] {
  return answersInWords(engine.schema(), engine.value(), text, engine.locale()).map((answer) => {
    const field = parsePath(answer.field)
    return { ...answer, page: engine.pageOf(field), controlId: engine.getFieldSnapshot(field).ids.control }
  })
}
