import { createSummary } from '@formancy/core/summary'
import type { QuestionSummary, Summary } from '@formancy/core/summary'
import { createFormText } from '@formancy/core/words'
import type { ServerDeps } from './deps.js'
import type { SubmissionPlace } from './ports.js'

/** How many responses are read into memory at a time to be counted. */
const PAGE = 1000

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
 * Counted here with `createSummary`, what `summariseAnswers` counts with, the function the admin
 * called when it counted in the browser, so the counting rules are written once (0206): each
 * version against its own document, whose questions may not be another's (0207), and in that
 * document's language, as the admin read it.
 *
 * **A page at a time** (0224): the responses are read from the storage as the listing pages them,
 * from where the last page ended, and each is counted as it is read, so the server holds a page of
 * them and the counts, never the form's every response.
 */
export async function summariseResponses(deps: ServerDeps, path: string): Promise<VersionSummary[] | undefined> {
  const form = await deps.storage.getFormByPath(path)
  if (form === undefined) return undefined

  const versions = await deps.storage.listVersionsByForm(form.id)
  const counting = new Map<string, { responses: number; summary: Summary }>(
    versions.map((version) => [
      version.id,
      { responses: 0, summary: createSummary(version.schema, createFormText({ locale: version.schema.i18n?.defaultLocale ?? '' })) },
    ]),
  )
  let before: SubmissionPlace | undefined
  for (;;) {
    const page = await deps.storage.pageSubmissionsByForm(form.id, PAGE, before)
    for (const record of page) {
      const counted = counting.get(record.formVersionId)
      if (counted === undefined) continue
      counted.responses += 1
      counted.summary.add(record.data)
    }
    const last = page.at(-1)
    if (page.length < PAGE || last === undefined) break
    before = { submittedAt: last.submittedAt, id: last.id }
  }
  return versions.flatMap((version) => {
    const counted = counting.get(version.id)
    if (counted === undefined || counted.responses === 0) return []
    return [{ version: version.version, responses: counted.responses, questions: counted.summary.questions() }]
  })
}
