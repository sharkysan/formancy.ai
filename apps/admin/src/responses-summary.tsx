import type { ReactElement } from 'react'
import { summariseAnswers } from '@formancy/core/summary'
import type { QuestionSummary } from '@formancy/core/summary'
import { createFormText } from '@formancy/core/words'
import type { FormSchema } from '@formancy/spec'

/**
 * A form's responses together, question by question, before any one of them (0206): how many
 * answered, how many chose each option, a number's range and mean.
 *
 * Only the version whose document the admin has, which is the current one: an older version's
 * questions may differ, and counting its answers against these would put them under the wrong
 * question. How many it leaves out is said, so a total is never mistaken for every response.
 */
export function ResponsesSummary({
  schema,
  version,
  data,
  earlier,
}: {
  schema: FormSchema
  version: number
  data: readonly unknown[]
  earlier: number
}): ReactElement {
  const questions = summariseAnswers(schema, data, createFormText({ locale: schema.i18n?.defaultLocale ?? '' }))
  return (
    <section className="wb-summary" aria-label="Summary">
      <p className="wb-summary-scope">
        {data.length === 1 ? '1 response' : `${String(data.length)} responses`} to version {version}
        {earlier === 0 ? '.' : `; ${earlier === 1 ? '1 to an earlier version' : `${String(earlier)} to earlier versions`} below, not counted here, since its questions may differ.`}
      </p>
      {questions.map((question) => (
        <Question key={question.field} question={question} />
      ))}
    </section>
  )
}

function Question({ question }: { question: QuestionSummary }): ReactElement {
  return (
    <div className="wb-summary-question">
      <h3>{question.label}</h3>
      <p className="wb-summary-answered">{question.answered} answered</p>
      {question.kind === 'number' ? (
        <p>
          Lowest {question.min}, highest {question.max}, mean {Math.round(question.mean * 100) / 100}
        </p>
      ) : null}
      {question.kind === 'choices' ? (
        <table className="wb-summary-counts">
          <thead>
            <tr>
              <th scope="col">Option</th>
              <th scope="col">Chosen</th>
              <th scope="col">Of those who answered</th>
            </tr>
          </thead>
          <tbody>
            {question.counts.map((option) => {
              const share = question.answered === 0 ? 0 : Math.round((option.count / question.answered) * 100)
              return (
                <tr key={String(option.value)}>
                  <th scope="row">{option.label}</th>
                  <td>{option.count}</td>
                  <td>
                    {/* The bar repeats the figure beside it, so it is hidden from a screen reader. */}
                    <span className="wb-summary-bar" aria-hidden="true" style={{ inlineSize: `${String(share)}%` }} />
                    {share}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : null}
    </div>
  )
}
