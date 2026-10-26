import type { ReactElement } from 'react'
import { answersInWords, createFormText } from '@formancy/core/words'
import type { FormSchema } from '@formancy/spec'

/**
 * One submission, question by question, as its respondent answered it (0193): "Country —
 * Switzerland", not `"country":"CH"`. The stored JSON stays one disclosure away, because it is
 * what a webhook or an export carries and an operator sometimes needs exactly that.
 *
 * Read against the version the submission was made on, which the caller has checked: read
 * against another, an answer could sit under a question that is no longer there.
 */
export function SubmissionAnswers({ schema, data }: { schema: FormSchema; data: unknown }): ReactElement {
  const answers = answersInWords(schema, data, createFormText({ locale: schema.i18n?.defaultLocale ?? '' }))
  return (
    <div className="wb-answers">
      {answers.length === 0 ? (
        <p className="wb-empty-note">No question was answered.</p>
      ) : (
        <dl>
          {answers.map(({ path, label, said }) => (
            <div key={path}>
              <dt>{label}</dt>
              <dd>{said}</dd>
            </div>
          ))}
        </dl>
      )}
      <details>
        <summary>As stored</summary>
        <code className="wb-data">{JSON.stringify(data)}</code>
      </details>
    </div>
  )
}
