import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * Claims that a decision record contradicts.
 *
 * Narrower than it sounds: no test can check prose against an argument. What it
 * can check is a specific sentence that has already gone wrong, and this one went
 * wrong in **four** documents at once, including the regulatory set.
 *
 * All four said adding a field type is "a compatible change". The format half is
 * true — a new type removes nothing and every older document stays valid — but
 * the version line is a contract for READERS, and a reader on the older version
 * does not half-understand a type it has never heard of: it renders nothing,
 * collects nothing, and drops the answer, which looks exactly like a field
 * somebody left blank ([0051](../../../docs/decisions/0051-spec-2-adds-types.md)).
 *
 * The claim was written before spec 2 existed, was true of the plan at the time,
 * and nobody went back to it when 0051 settled the rule. That is the failure mode
 * this file exists for: a sentence that was true when written, is false now, and
 * changed nothing in any diff.
 *
 * **The changelog is excluded on purpose.** It records what was said at the time.
 * Rewriting an old entry to agree with a later decision would be falsifying the
 * record, which is a worse fault than the stale sentence.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')

/** Every document a reader is expected to trust as current. */
function liveDocuments(): Array<{ name: string; text: string }> {
  const out: Array<{ name: string; text: string }> = []

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue
        walk(full)
        continue
      }
      if (!entry.name.endsWith('.md') && !entry.name.endsWith('.mdx')) continue
      // A changelog is a record of the past, not a claim about the present.
      if (entry.name === 'CHANGELOG.md') continue
      // Decision records may quote a claim in order to reverse it.
      if (full.includes(join('docs', 'decisions'))) continue
      out.push({ name: full.slice(repo.length + 1), text: readFileSync(full, 'utf8') })
    }
  }

  walk(join(repo, 'docs'))
  walk(join(repo, 'apps', 'docs', 'src', 'content'))
  out.push({ name: 'README.md', text: readFileSync(join(repo, 'README.md'), 'utf8') })
  return out
}

/**
 * Capabilities the server has, and the words a document uses to deny them.
 *
 * The second failure of the same kind, found the same way. Two pages said the
 * server had "no proof-of-work challenge", and one of them went on to say "no
 * audit logging" while its sibling page correctly listed audit logging as
 * present. Both were written before those things shipped, both were true then,
 * and neither changed in the diff that made them false.
 *
 * A pre-alpha notice is the most load-bearing paragraph in the documentation:
 * it is the one a reader uses to decide whether to deploy. `CLAUDE.md` puts it
 * plainly — an absent statement prompts a question, a wrong one answers it
 * incorrectly — and a notice that under-claims is not the safe direction. It
 * tells somebody to leave off a defence the software already has.
 *
 * `evidence` is a file that would have to be deleted for the denial to become
 * true again, so the pair cannot rot in the other direction either: remove the
 * challenge and this test stops asserting anything about it.
 */
const capabilities = [
  {
    what: 'the proof-of-work challenge',
    evidence: join(repo, 'packages', 'server-core', 'src', 'challenge.ts'),
    denied: /no proof-of-work|no\s+challenge\b/i,
  },
  {
    what: 'audit logging',
    evidence: join(repo, 'packages', 'server-core', 'src', 'audit.ts'),
    denied: /no audit logging/i,
  },
] as const

describe('the spec version the documents name', () => {
  test('is the one the code implements', () => {
    // The landing page said "The schema spec is at `specVersion: \"2\"`" beside
    // "They are on npm ... at `0.1.0`", while both quickstarts said the schema is
    // frozen at version 1. The quickstarts were right: the released 0.1.0 predates
    // spec versioning and its schema pins specVersion to `{ "const": "1" }`, so it
    // does not ignore a version 2 document, it refuses it. A reader following the
    // landing page installed from npm and could not write the version it named.
    //
    // What is guarded is the half that IS derivable. Whether a version has been
    // released depends on npm and on git tags, which CI does not fetch -- a check
    // of that would answer differently in CI than locally, which is not a gate. But
    // the version the code implements is right here, and a landing page naming a
    // different one is always wrong. Bump CURRENT_SPEC_VERSION without touching the
    // page and this fails.
    const types = readFileSync(
      join(repo, 'packages', 'spec', 'src', 'types.ts'),
      'utf8',
    )
    const current = /CURRENT_SPEC_VERSION: SpecVersion = '(\d+)'/.exec(types)?.[1]
    expect(current, 'could not read CURRENT_SPEC_VERSION').toBeDefined()

    const landing = liveDocuments().find(({ name }) => name.endsWith(join('docs', 'index.md')))
    expect(landing, 'the landing page was not found').toBeDefined()

    const named = [...(landing?.text ?? '').matchAll(/specVersion: ?.?"(\d+)"/g)].map((m) => m[1])
    // A guard on the guard: a page that named no version would pass forever.
    expect(named.length).toBeGreaterThan(0)
    // `toContain`, not equality: the page legitimately names two versions right
    // now -- the one the code implements, and the one a reader must actually write
    // because the released package refuses the newer one. What must hold is that
    // the implemented version appears at all, so bumping the code without touching
    // the page fails here.
    expect(named).toContain(current)
  })
})

describe('what the documents say the server cannot do', () => {
  test.each(capabilities)('$what exists, so nothing denies it', ({ evidence, denied }) => {
    // The guard on the guard, per capability: an assertion about a file that is
    // not there is an assertion about nothing.
    expect(existsSync(evidence)).toBe(true)

    const offending = liveDocuments()
      .filter(({ text }) => denied.test(text))
      .map(({ name }) => name)

    expect(offending).toEqual([])
  })
})

describe('the documents a reader is expected to trust', () => {
  test('are actually being read', () => {
    // A guard on the guard: a walk that found nothing would pass forever.
    const documents = liveDocuments()
    expect(documents.length).toBeGreaterThan(8)
    expect(documents.some((document) => document.name.includes('SOUP'))).toBe(true)
  })

  test('do not call adding a field type a compatible change', () => {
    // The sentence, in the shapes it actually appeared in. Checked rather than
    // trusted because it survived in four places at once, and because the
    // additive half being true is what makes it sound reasonable.
    const offending = liveDocuments()
      .filter(({ text }) => {
        const near = /(field )?type[^.]{0,120}compatible change|compatible change[^.]{0,120}type/i
        return near.test(text)
      })
      .map(({ name }) => name)

    expect(offending).toEqual([])
  })
})
