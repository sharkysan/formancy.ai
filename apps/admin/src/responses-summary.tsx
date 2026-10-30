import type { ReactElement } from 'react'
import type { QuestionSummary } from '@formancy/core/summary'
import type { VersionSummary } from './api.js'

/**
 * A form's responses together, question by question, before any one of them (0206): how many
 * answered, how many chose each option, a number's range and mean.
 *
 * One version's responses against that version's document, as the server counted them (0223):
 * another version's questions may differ, and counting its answers against these would put them
 * under the wrong question. The pane draws one of these per version (0207).
 */
export function ResponsesSummary({ summary }: { summary: VersionSummary }): ReactElement {
  const { version, responses, questions } = summary
  return (
    <section className="wb-summary" aria-label={`Summary of version ${String(version)}`}>
      <p className="wb-summary-scope">
        {responses === 1 ? '1 response' : `${String(responses)} responses`} to version {version}.
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
