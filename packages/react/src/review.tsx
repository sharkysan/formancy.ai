import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { parsePath } from '@formancy/core'
import { answersToReview } from '@formancy/core/words'
import type { ReviewedAnswer } from '@formancy/core/words'
import { useFormEngine, useFormText } from './context.js'
import type { FormancyFormProps } from './fields/internals.js'
import { useGoToField } from './go-to-field.js'
import { useSubmit } from './use-submit.js'

/*
 * The end of a form: sending it, or — where the form asks for it — checking the answers first
 * (0204). Apart from the form, which has no lines to give, and because this is one subject: what
 * the last control does and what follows it.
 */
export function SubmitButton({ submitLabel, onSubmit, onFailedNavigate }: FormancyFormProps & { onFailedNavigate?: (page: number) => void }) {
  const engine = useFormEngine()
  const text = useFormText()
  const submit = useSubmit()
  return (
    <button
      type="button"
      data-formancy-part="submit"
      onClick={() => {
        const outcome = submit()
        if (!outcome.ok && onFailedNavigate !== undefined) {
          const firstInvalid = engine.firstInvalid()
          if (firstInvalid !== null) onFailedNavigate(engine.pageOf(parsePath(firstInvalid)))
        }
        onSubmit?.(outcome.ok ? { ok: true, errors: outcome.errors, data: engine.value() } : { ok: false, errors: outcome.errors })
      }}
    >
      {/* The host's word when it gave one, and the form's language's otherwise (0171). */}
      {submitLabel ?? text('form.submit')}
    </button>
  )
}

/*
 * Whether the answers are being checked, and the two ways out of it: checking, which validates
 * everything as a send would and opens the review only when nothing is wrong; and changing one,
 * which leaves the review for the page the question is on and focuses it once that is drawn.
 */
export function useReview(goTo?: (page: number) => void) {
  const engine = useFormEngine()
  const submit = useSubmit()
  const [reviewing, setReviewing] = useState(false)
  const goToField = useGoToField()

  return {
    reviewing,
    check: (): void => {
      const outcome = submit()
      if (outcome.ok) return setReviewing(true)
      const firstInvalid = engine.firstInvalid()
      if (firstInvalid !== null) goTo?.(engine.pageOf(parsePath(firstInvalid)))
    },
    change: (answer: ReviewedAnswer): void => {
      setReviewing(false)
      goToField(answer.field)
    },
  }
}

/* "Check your answers", where the form would otherwise send. */
export function CheckAnswersButton({ onCheck }: { onCheck: () => void }) {
  const text = useFormText()
  return (
    <button type="button" data-formancy-part="check-answers" onClick={onCheck}>
      {text('review.open')}
    </button>
  )
}

/*
 * The answers in words, under their questions — and a question left unanswered as such — each
 * with a "Change" naming its question for a screen reader — and focus on the heading when it opens, so a screen reader says where the
 * person now is. `children` is what sends the form.
 */
export function Review({ onChange, children }: { onChange: (answer: ReviewedAnswer) => void; children: ReactNode }) {
  const engine = useFormEngine()
  const text = useFormText()
  const headingId = useId()
  const heading = useRef<HTMLHeadingElement | null>(null)
  const answers = answersToReview(engine, text)

  useEffect(() => heading.current?.focus(), [])

  return (
    <section data-formancy-part="review" aria-labelledby={headingId}>
      <h2 id={headingId} ref={heading} tabIndex={-1} data-formancy-part="review-heading">
        {text('review.heading')}
      </h2>
      {answers.length === 0 ? (
        <p data-formancy-part="review-empty">{text('review.empty')}</p>
      ) : (
        <dl data-formancy-part="review-answers">
          {answers.map((answer) => (
            <div key={answer.path} data-formancy-part="review-answer">
              <dt>{answer.label}</dt>
              {/* A question left unanswered says so, as a part a theme can mark (0214). */}
              <dd {...(answer.answered ? {} : { 'data-formancy-part': 'review-unanswered' })}>{answer.said}</dd>
              <dd>
                <button type="button" onClick={() => onChange(answer)}>
                  {text('review.change')} <span data-formancy-part="visually-hidden">{answer.label}</span>
                </button>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {children}
    </section>
  )
}
