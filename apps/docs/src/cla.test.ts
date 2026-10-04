import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { AGREEMENT, SIGNATORIES, agreementHash, readRecord, unsigned } from '../../../scripts/check-cla.mjs'

/**
 * The contributor agreement is checked, not only stated.
 *
 * [0069](../../../docs/decisions/0069-contributions-under-a-cla.md) decided a CLA
 * and said the quiet part out loud: "a CLA nobody checks is a document in a
 * repository". For a week that was the state — the terms were in
 * `CONTRIBUTING.md`, nothing read them, and the one thing that would have caught
 * the first external pull request arriving under no terms was somebody
 * remembering.
 *
 * This file covers the half a test can cover. It cannot check that a signature
 * means anything — that is a question for a lawyer, and
 * [0098](../../../docs/decisions/0098-the-cla-is-checked-in-the-repository.md)
 * says so rather than implying a test settles it. What it checks is that the
 * record on disk is coherent with the agreement it claims to be a record of, and
 * that the function the workflow runs answers correctly on the cases that decide
 * whether anybody is actually stopped.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')

/** The terms as they stand, hashed the way a signature records them. */
const current = agreementHash(readFileSync(join(repo, AGREEMENT), 'utf8'))

/**
 * A record with one signatory, for the cases below. Built here rather than read
 * from disk so each case says which field it is about.
 */
const oneSignatory = (overrides: Record<string, unknown> = {}): unknown => ({
  agreement: AGREEMENT,
  signatories: [
    {
      name: 'A Contributor',
      login: 'contributor',
      emails: ['a@example.com'],
      signed: '2026-10-04',
      agreement: current,
      ...overrides,
    },
  ],
  machines: [],
})

describe('the record on disk', () => {
  test('is the file the workflow reads, and names at least one identity', () => {
    // A guard on the guard. Every case below would pass against an empty record
    // read from a path nothing uses, and the gate would wave through the world.
    const record = readRecord(repo)
    const covered = [...record.signatories, ...record.machines].flatMap((entry) => entry.emails)

    expect(SIGNATORIES).toBe('.github/cla/signatories.json')
    expect(covered.length).toBeGreaterThan(0)
  })

  test('records every signature against the agreement as it actually stands', () => {
    /*
     * The failure this prevents is silent and one-directional: the terms are
     * edited, every existing signature now covers text nobody agreed to, and
     * nothing anywhere says so. A signature that does not name what was signed
     * is a date next to a name.
     *
     * It fires on a typo fix in `CLA.md` too, and that is deliberate rather than
     * tolerated — see the cost paragraph in 0098. The fix is to re-record, which
     * for the present list of one is a line.
     */
    const record = readRecord(repo)

    for (const signatory of record.signatories) {
      expect(signatory.agreement, `${signatory.name} signed terms that are no longer the terms`).toBe(current)
    }
  })

  test('refuses an entry missing a field the gate reads', () => {
    // A typo'd key is the realistic way this record goes wrong, and the shape of
    // the bug decides how bad it is: `email` instead of `emails` covers nobody
    // and is loud, while a missing `agreement` would make the staleness check
    // above pass by having nothing to compare. So the shape is checked once,
    // here, and the gate gets a record it can trust.
    expect(() => readRecord(repo, oneSignatory({ emails: undefined }))).toThrow(/emails/)
    expect(() => readRecord(repo, oneSignatory({ agreement: undefined }))).toThrow(/agreement/)
  })

  test('and refuses a machine exemption that does not say why', () => {
    // An exemption is the one entry that grants cover without anybody agreeing to
    // anything, so the reason is the entry. Without it the list becomes a place
    // to put addresses that are inconvenient.
    const record = oneSignatory() as { machines: unknown[] }
    record.machines = [{ name: 'some agent', emails: ['bot@example.com'] }]

    expect(() => readRecord(repo, record)).toThrow(/reason/)
  })
})

describe('who the gate stops', () => {
  const record = readRecord(repo, oneSignatory())

  test('an author nobody has a signature for', () => {
    expect(unsigned({ authors: ['stranger@example.com'], record, hash: current })).toEqual([
      { email: 'stranger@example.com', reason: 'unsigned' },
    ])
  })

  test('and not one who signed, which is the half that makes it usable', () => {
    // Without this case the gate could refuse everybody and still look green on
    // the case above. A wall is not a gate.
    expect(unsigned({ authors: ['a@example.com'], record, hash: current })).toEqual([])
  })

  test('an author whose signature is against terms that have since changed', () => {
    /*
     * Reported as stale rather than as unsigned, because the two ask the
     * contributor for different things: one is "sign this", the other is "the
     * terms moved under you, read them again". Collapsing them into one message
     * would tell somebody who has already signed that they have not.
     */
    expect(unsigned({ authors: ['a@example.com'], record, hash: 'sha256:0000' })).toEqual([
      { email: 'a@example.com', reason: 'stale' },
    ])
  })

  test('the same address in different case, because git addresses are not case-sensitive', () => {
    // A near-miss rather than a hypothetical: one machine configured with a
    // capitalised local part makes a signatory a stranger, and the message would
    // name an address that is visibly already in the file.
    expect(unsigned({ authors: ['A@Example.COM'], record, hash: current })).toEqual([])
  })

  test('and names each address once, however many commits it authored', () => {
    // Twelve commits by one unsigned contributor is one thing to fix, and a
    // failure that repeats an address twelve times reads as twelve problems.
    //
    // Kept after a mutation run showed what it does NOT guard. The first version
    // of the implementation deduplicated with an explicit `has` check beside a
    // map that was already keyed by address, so removing that check left this
    // green — the line was redundant and the case was asserting the map. The
    // check is gone; this stays, because the property belongs to the function
    // rather than to the data structure that currently provides it, and
    // collecting into a list instead does fail here.
    expect(unsigned({ authors: ['x@example.com', 'x@example.com'], record, hash: current })).toEqual([
      { email: 'x@example.com', reason: 'unsigned' },
    ])
  })
})

describe('what it does when it cannot tell', () => {
  test('refuses a pull request it could read no authors from', () => {
    /*
     * The failure mode that matters most here, because it is the one that looks
     * like success. `git log base..head` answering nothing is indistinguishable
     * from a range that is genuinely empty, and both happen: a wrong base SHA, a
     * shallow clone where the base commit is absent, a rebase that moved the
     * range. Returning an empty list of offenders would make every one of those
     * a pass.
     *
     * So it throws. A gate that cannot see what it is gating says so.
     */
    expect(() => unsigned({ authors: [], record: readRecord(repo), hash: current })).toThrow(/no commit authors/)
  })

  test('and refuses a record whose agreement is not the one being checked', () => {
    // The record names the file it is a record of. If that stops being the file
    // the gate hashes, every signature is being compared against the wrong text
    // and the staleness check becomes noise.
    expect(() => readRecord(repo, oneSignatory({}) as object, 'OTHER.md')).toThrow(/OTHER\.md/)
  })
})

describe('the workflow that runs it', () => {
  const workflow = readFileSync(join(repo, '.github', 'workflows', 'cla.yml'), 'utf8')

  /**
   * The `on:` block, and only it.
   *
   * Read structurally rather than searched for, because searching the file for
   * `pull_request_target` finds the comment that explains why this workflow does
   * not use it — green, and asserting nothing. That exact shape of green has
   * happened here before, and the fix is the same each time: take the thing the
   * tool actually reads, not the prose around it.
   */
  const triggers = (): string => {
    const lines = workflow.split('\n')
    const from = lines.indexOf('on:')
    const rest = lines.slice(from + 1)
    const to = rest.findIndex((line) => /^\S/.test(line))
    return rest.slice(0, to === -1 ? rest.length : to).join('\n')
  }

  test('on pull requests, which is when there is anything to check', () => {
    expect(triggers()).toContain('pull_request:')
    expect(workflow).toContain('scripts/check-cla.mjs')
  })

  test('and not on `pull_request_target`, which is the trigger 0098 rejected a bot over', () => {
    /*
     * `pull_request_target` runs with the base repository's permissions against
     * code from a fork. It is what a CLA bot needs in order to comment and to
     * write a signature back, and it is the best-documented way to hand a
     * repository away. This check needs neither, so the combination should not
     * appear — and if somebody later adds the bot, this is where the trade gets
     * argued rather than slipped in.
     */
    expect(triggers()).not.toContain('pull_request_target')
    expect(workflow).toContain('contents: read')
    expect(workflow).not.toContain('contents: write')
  })

  test('with the whole history, because a shallow clone has neither end of the range', () => {
    // Without this the base commit is absent, `git merge-base` fails, and the
    // check refuses — loudly, but looking like the contributor's problem rather
    // than the workflow's.
    expect(workflow).toContain('fetch-depth: 0')
  })
})

describe('the agreement itself', () => {
  test('is hashed over content rather than bytes, so a checkout cannot change a signature', () => {
    /*
     * `.gitattributes` says `eol=lf` and the working tree obeys it today, so this
     * costs one `replaceAll` and buys the case where it does not: a contributor
     * whose git is configured differently, or a tool that rewrites the file on
     * save, would otherwise invalidate every signature in the file by checking
     * out. That failure would arrive as "the terms changed", which is the one
     * message it must not send falsely.
     */
    expect(agreementHash('a\r\nb\r\n')).toBe(agreementHash('a\nb\n'))
  })

  /*
   * There is deliberately no case here asserting that `CLA.md` says what 0069
   * decided. Matching it for "sublicense" and "patent" would pass whether the
   * document granted those rights or refused them, and 0069 already states that
   * no test can check the terms — a green assertion next to that sentence would
   * imply one does. What *is* checked, in `claims.test.ts`, is that the
   * documents a contributor reads point at this file and at the record, because
   * those are paths rather than prose.
   */
})
