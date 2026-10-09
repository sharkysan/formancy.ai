import { describe, expect, test } from 'vitest'
import { RULE_KINDS } from './rules.js'
import type { FormSchema } from './types.js'
import { validateSchema } from './validate.js'

/**
 * `kind: "skip"` — a page a form can walk past.
 *
 * The last thing the roadmap deferred, and it was deferred for a reason that has
 * stopped being true: conditional routing was not worth building while a wizard
 * was something only a developer could make. It is a rule kind, so it costs a
 * spec version — which is why it belongs in version 3 beside `check` rather than
 * being the only thing in version 4.
 *
 * **Its target is a page KEY, not a data path**, and that is why it is its own
 * kind rather than `visible` pointed at a page. Measured before any of this was
 * written: a `visible` rule targeting a page is refused with *"No field has the
 * data path p2"*, because pages are transparent for data and a page therefore has
 * no path at all. Overloading `target` to mean a key here and a path everywhere
 * else is the ambiguity this format refuses elsewhere.
 */
const paged = (over: Record<string, unknown> = {}): FormSchema =>
  ({
    specVersion: '3',
    id: 'trip',
    title: 'Trip',
    model: {
      fields: [
        {
          key: 'p1',
          type: 'page',
          label: 'About you',
          fields: [{ key: 'needsVisa', type: 'checkbox', label: 'Do you need a visa?' }],
        },
        {
          key: 'p2',
          type: 'page',
          label: 'Visa details',
          fields: [{ key: 'passport', type: 'text', label: 'Passport number' }],
        },
      ],
    },
    logic: { rules: [{ target: 'p2', kind: 'skip', cel: 'needsVisa != true', ...over }] },
  }) as unknown as FormSchema

const problems = (document: FormSchema): string[] => {
  const report = validateSchema(document)
  return report.valid ? [] : report.errors.map((error) => error.message)
}

describe('a skip rule', () => {
  test('is a rule kind', () => {
    expect(RULE_KINDS).toContain('skip')
  })

  test('targets a page by its key, which no other rule does', () => {
    expect(problems(paged())).toEqual([])
  })

  test('is refused in a version 2 document, with the version it needs', () => {
    const messages = problems({ ...paged(), specVersion: '2' } as FormSchema)

    expect(messages.length).toBeGreaterThan(0)
    expect(messages[0]).toMatch(/skip/)
    expect(messages[0]).toMatch(/"3"/)
  })

  test('is refused when it targets something that is not a page', () => {
    // A skip rule on a text field is an author who believes they wrote a
    // conditional page and wrote a rule that can never do anything.
    const messages = problems(paged({ target: 'needsVisa' }))

    expect(messages.length).toBeGreaterThan(0)
    expect(messages.join(' ')).toMatch(/page/i)
  })

  test('is refused when it targets nothing at all', () => {
    expect(problems(paged({ target: 'p9' })).length).toBeGreaterThan(0)
  })

  test('carries an expression, unlike a check', () => {
    expect(problems(paged({ cel: undefined })).length).toBeGreaterThan(0)
  })

  test('cannot choose where it runs, because a skipped page must be skipped everywhere', () => {
    // Which pages a form has is not a matter of opinion. If the browser walked
    // past a page the server did not, the server would validate answers the
    // person was never shown — the same reason `visible` cannot carry `runsOn`.
    const messages = problems(paged({ runsOn: 'client' }))

    expect(messages.length).toBeGreaterThan(0)
    expect(messages.join(' ')).toMatch(/where it runs/i)
  })
})
