import { readFileSync, readdirSync } from 'node:fs'
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
