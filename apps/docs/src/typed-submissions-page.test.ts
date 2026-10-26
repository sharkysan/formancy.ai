import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { answersTypeScript } from '@formancy/spec'
import { validateSchema } from '@formancy/spec/validate'

/**
 * The typed-submissions page shows what the printer prints, for the form it shows (0190).
 *
 * The page's example is the first thing a reader copies, and a type written out by hand
 * there would stay the same while the printer changed. So both halves come from the page —
 * the form as JSON, and the type it says that form prints — and the printer is run on the
 * one and compared with the other, byte for byte, hash included.
 */
const here = dirname(fileURLToPath(import.meta.url))
const page = readFileSync(join(here, 'content', 'docs', 'concepts', 'typed-submissions.md'), 'utf8')

/** The first fenced block of `language` after `marker`. */
function blockAfter(marker: string, language: string): string {
  const from = page.indexOf(marker)
  expect(from, `the page no longer says "${marker}"`).toBeGreaterThan(-1)
  const open = page.indexOf(`\`\`\`${language}\n`, from)
  const close = page.indexOf('\n```', open)
  return page.slice(open + language.length + 4, close + 1)
}

describe('the typed-submissions page', () => {
  test('shows exactly the type its example form prints', () => {
    const document = JSON.parse(blockAfter('For this form:', 'json')) as unknown
    const validated = validateSchema(document)
    // A form the page shows must be one the command would accept, or the example is of an error.
    expect(validated.valid).toBe(true)
    if (!validated.valid) return

    expect(blockAfter('it prints:', 'ts')).toBe(answersTypeScript(validated.schema))
  })
})
