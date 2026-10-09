import { describe, expect, test } from 'vitest'
import { RULE_KINDS, SPEC_2_RULE_KINDS } from './rules.js'
import type { FormSchema } from './types.js'
import { validateSchema } from './validate.js'

/**
 * `kind: "check"` — a validator the deployment answers, and the last construct
 * spec version 3 was waiting for.
 *
 * [0042](../../../docs/decisions/0042-freeze-the-spec.md) settled the shape
 * before it was built: *"they need a new rule kind"*. A CEL expression is pure
 * and synchronous by construction — that is what makes the dependency graph
 * derivable and the evaluation bounded — so an asynchronous validator cannot be
 * an expression with a flag on it. It has to be a different kind of rule.
 *
 * And it follows `optionsSource` exactly
 * ([0077](../../../docs/decisions/0077-options-may-come-from-a-named-source.md)):
 * the document names a check, the deployment supplies it, and nothing in
 * `@formancy/spec` or `@formancy/core` fetches anything. A URL here would be a
 * deployment detail frozen into a published document and an SSRF surface on an
 * instance inside a private network.
 */
const rule = (over: Record<string, unknown>): FormSchema =>
  ({
    specVersion: '3',
    id: 'signup',
    title: 'Sign up',
    model: { fields: [{ key: 'email', type: 'text', label: 'Email' }] },
    logic: { rules: [{ target: 'email', kind: 'check', check: 'email-not-taken', ...over }] },
  }) as unknown as FormSchema

const problems = (document: FormSchema): string[] => {
  const report = validateSchema(document)
  return report.valid ? [] : report.errors.map((error) => error.message)
}

describe('a check rule', () => {
  test('is a rule kind, and one version 2 did not have', () => {
    expect(RULE_KINDS).toContain('check')
    expect([...SPEC_2_RULE_KINDS]).not.toContain('check')
  })

  test('names a check and carries no expression', () => {
    expect(problems(rule({}))).toEqual([])
  })

  test('is refused in a version 2 document, with the version it needs', () => {
    const messages = problems({ ...rule({}), specVersion: '2' } as FormSchema)

    expect(messages.length).toBeGreaterThan(0)
    expect(messages[0]).toMatch(/check/)
    expect(messages[0]).toMatch(/"3"/)
  })

  test('must name something: a check with no name asks nobody', () => {
    const messages = problems(rule({ check: undefined }))
    expect(messages.length).toBeGreaterThan(0)
  })

  test('names a check rather than an address, and a URL is not a name', () => {
    // The same rule `optionsSource` holds, for the same three reasons: a URL is a
    // deployment detail in a portable format, frozen forever in a published
    // version, and an SSRF surface on an instance inside a private network.
    const messages = problems(rule({ check: 'https://example.ch/is-it-taken' }))

    expect(messages.length).toBeGreaterThan(0)
    expect(messages.join(' ')).toMatch(/name/i)
  })

  test('carries no `cel`, because there is no expression to evaluate', () => {
    // A check that also carried an expression would be two rules wearing one
    // object, with no answer to which verdict wins.
    const messages = problems(rule({ cel: 'email != ""' }))
    expect(messages.length).toBeGreaterThan(0)
  })

  test('may say where it runs, and defaults to the server', () => {
    // A uniqueness check needs the database. `both` and `client` stay expressible,
    // because a host that can answer in the browser should be able to say so —
    // but the default is the one that is always available and always authoritative.
    expect(problems(rule({ runsOn: 'server' }))).toEqual([])
    expect(problems(rule({ runsOn: 'both' }))).toEqual([])
    expect(problems(rule({ runsOn: 'client' }))).toEqual([])
  })

  test('may carry the code the field wears while it fails', () => {
    expect(problems(rule({ code: 'taken' }))).toEqual([])
  })

  test('targets a field that exists, like every other rule', () => {
    const messages = problems(rule({ target: 'nothing' }))
    expect(messages.length).toBeGreaterThan(0)
  })
})

describe('the rules that are not checks', () => {
  test('still need their expression, which a check does not have', () => {
    // The guard on the guard: a schema that made `cel` optional for every kind to
    // let `check` through would take the expression off `visible` as well, and a
    // visibility rule with no expression is a field that is never shown or never
    // hidden depending on which way the engine reads nothing.
    const messages = problems({
      specVersion: '3',
      id: 'signup',
      title: 'Sign up',
      model: { fields: [{ key: 'email', type: 'text', label: 'Email' }] },
      logic: { rules: [{ target: 'email', kind: 'visible' }] },
    } as unknown as FormSchema)

    expect(messages.length).toBeGreaterThan(0)
  })
})
