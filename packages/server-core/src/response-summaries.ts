import { summariseAnswers } from '@formancy/core/summary'
import type { QuestionSummary } from '@formancy/core/summary'
import { createFormText } from '@formancy/core/words'
import type { ServerDeps } from './deps.js'

/** One version's responses, summarised by question against that version's own document. */
export interface VersionSummary {
  version: number
  /** How many responses this version has. */
  responses: number
  questions: QuestionSummary[]
}

/**
 * A form's responses summarised by question, one summary per version that has any, newest first
 * (0223). Undefined for an unknown form, as the listing answers.
 *
 * Counted here with `summariseAnswers`, the function the admin called when it counted in the
 * browser, so the counting rules are written once (0206): each version against its own document,
 * whose questions may not be another's (0207), and in that document's language, as the admin
 * read it.
 *
 * Every submission of the form is read into the server's memory to count it. What leaves it is
 * the counts, a few lines per question, where the admin was sent every answer to count them itself.
 */
export async function summariseResponses(deps: ServerDeps, path: string): Promise<VersionSummary[] | undefined> {
  const form = await deps.storage.getFormByPath(path)
  if (form === undefined) return undefined

  const versions = await deps.storage.listVersionsByForm(form.id)
  const answersByVersion = new Map<string, unknown[]>()
  for (const record of await deps.storage.listSubmissionsByForm(form.id)) {
    const answers = answersByVersion.get(record.formVersionId) ?? []
    answers.push(record.data)
    answersByVersion.set(record.formVersionId, answers)
  }
  return versions.flatMap((version) => {
    const answers = answersByVersion.get(version.id)
    if (answers === undefined) return []
    const text = createFormText({ locale: version.schema.i18n?.defaultLocale ?? '' })
    return [{ version: version.version, responses: answers.length, questions: summariseAnswers(version.schema, answers, text) }]
  })
}
