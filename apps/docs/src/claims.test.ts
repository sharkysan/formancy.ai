import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { validateSchema } from '@formancy/spec/validate'
import { AGREEMENT, SIGNATORIES } from '../../../scripts/check-cla.mjs'

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
    evidence: join(repo, 'packages', 'challenge', 'src', 'challenge.ts'),
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

  test('and so does the regulatory set, which names it in three places', () => {
    /*
     * Found by re-reading the set rather than by a gate, which is why this exists.
     * `MDR-CONTEXT.md` told a manufacturer "the spec is frozen at version 1" -- true
     * when it was written, false since 0.2.0 froze version 2 and made it the version
     * the code writes. `LIFECYCLE.md` described change control on the data format and
     * named only version 1; `SAFETY-ANALYSIS.md` said "the spec is frozen" without
     * saying which.
     *
     * A manufacturer reads that set to decide whether the format their stored
     * submissions sit in is settled. Naming the wrong version does not make the
     * answer vaguer, it makes it wrong -- which is the failure this whole file is
     * about, arriving in the documents that can least afford it.
     *
     * Derived per paragraph rather than per phrase: wherever one of these documents
     * talks about the spec being frozen, the version the code implements has to be
     * one of the versions that paragraph names. A rewording changes nothing.
     */
    const types = readFileSync(join(repo, 'packages', 'spec', 'src', 'types.ts'), 'utf8')
    const current = /CURRENT_SPEC_VERSION: SpecVersion = '(\d+)'/.exec(types)?.[1]
    expect(current, 'could not read CURRENT_SPEC_VERSION').toBeDefined()

    const regulatory = join(repo, 'docs', 'regulatory')
    const claiming = readdirSync(regulatory)
      .filter((name) => name.endsWith('.md'))
      .flatMap((name) =>
        readFileSync(join(regulatory, name), 'utf8')
          .split(/\n\s*\n/)
          .filter((paragraph) => /frozen/i.test(paragraph) && /\bspec\b/i.test(paragraph))
          .map((paragraph) => ({
            name,
            opens: paragraph.trim().slice(0, 60),
            // A version is written `"2"` or "version 2"; a decision record number
            // is neither, so `[0051]` cannot be mistaken for one.
            versions: [
              ...[...paragraph.matchAll(/"(\d+)"/g)].map((m) => m[1]),
              ...[...paragraph.matchAll(/version (\d+)/gi)].map((m) => m[1]),
            ],
          })),
      )

    // A guard on the guard: no paragraph found means no claim checked, and this
    // would pass for as long as somebody kept rewording.
    expect(claiming.length).toBeGreaterThan(2)

    const stale = claiming
      .filter(({ versions }) => !versions.includes(current ?? ''))
      .map(({ name, opens, versions }) =>
        `${name}: "${opens}..." names ${versions.join(', ') || 'no version'}, and the code implements ${String(current)}`,
      )
    expect(stale).toEqual([])
  })
})

describe('the claim a regulated buyer reads', () => {
  /*
   * "Built to be incorporated. formancy is not a medical device and claims no
   * conformity..." — and the second sentence is the load-bearing one. Conformity under
   * the MDR attaches to a device with an intended purpose in a clinical context. A
   * component has none, so there is nothing for it to be compliant *with*, and
   * `MDR-CONTEXT.md` tells a manufacturer to be suspicious of any supplier who says
   * otherwise.
   *
   * The risk this guards is not that somebody writes a false claim. It is that somebody
   * trims the flattering half out of a true one — "ships the characterisation a
   * manufacturer needs under IEC 62304" reads, on its own, as exactly the claim the next
   * sentence exists to refuse.
   *
   * Checked on the two surfaces where the claim travels without the document that
   * explains it. `MDR-CONTEXT.md` is not one of them: it makes the disclaimer its own
   * first section and then spends pages on 62304.
   */
  const surfaces = (): Array<{ name: string; text: string }> => [
    { name: 'README.md', text: readFileSync(join(repo, 'README.md'), 'utf8') },
    {
      name: 'apps/site/src/app.tsx',
      // Comments stripped first, and not as a nicety: a guard that reads the comment
      // explaining the claim is the exact shape of guard this file exists to prevent.
      text: readFileSync(join(repo, 'apps', 'site', 'src', 'app.tsx'), 'utf8')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, ''),
    },
  ]

  test('never names IEC 62304 without denying conformity in the same breath', () => {
    const naming = surfaces().flatMap(({ name, text }) =>
      text
        .split(/\n\s*\n/)
        .filter((block) => /62304/.test(block))
        .map((block) => ({ name, block })),
    )

    // A guard on the guard: the page and the README each name it once, and a guard
    // that found neither would pass for as long as the claim was gone.
    expect(naming.length).toBeGreaterThan(1)

    const alone = naming
      .filter(({ block }) => !/not a medical device/i.test(block))
      .map(({ name }) => `${name}: names IEC 62304 with no "not a medical device" beside it`)
    expect(alone).toEqual([])
  })

  test('and the documents it offers are where it says they are', () => {
    // The claim names four artefacts and links each one. A rename makes the sentence
    // point at nothing, which on a due-diligence paragraph is worse than not linking:
    // the reader concludes the material does not exist rather than that it moved.
    const linked = surfaces().flatMap(({ name, text }) =>
      [
        ...text.matchAll(/(?:blob|tree)\/main\/(docs\/[A-Za-z0-9/._-]+)/g),
        ...text.matchAll(/\]\(\.\/(docs\/[A-Za-z0-9/._-]+?)\/?\)/g),
      ].map((match) => ({ name, path: match[1] ?? '' })),
    )

    expect(linked.length).toBeGreaterThan(4)

    const missing = linked
      .filter(({ path }) => !existsSync(join(repo, path)))
      .map(({ name, path }) => `${name} links ${path}, which is not in the repository`)
    expect(missing).toEqual([])
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

/**
 * The spec-2 freeze, enforced rather than announced.
 *
 * `MIGRATIONS.md` says version 2 is frozen and lists what it added. A list in prose is
 * the kind of claim this file exists for — except this one cannot rot by being *added
 * to*, because after a freeze nothing is added. Which is exactly what makes it a gate:
 * a new field type, layout kind or widget that reaches version 2 without appearing in
 * that list is the freeze being broken, and this is what fails then.
 *
 * Derived from the code and the schema on one side and from the document on the other,
 * so neither can be edited into agreement on its own.
 */
describe('the spec version 2 freeze', () => {
  /** What version 2 adds to version 1, read out of the code and the document schema. */
  const additions = (): {
    types: string[]
    typesInThree: string[]
    kinds: string[]
    widgets: string[]
    widgetsInThree: string[]
    widgetsInFour: string[]
    typesInFour: string[]
  } => {
    /*
     * Both files, because the layout vocabulary moved out of `types.ts` when spec
     * 4 pushed that file past its size ceiling. Reading one of them returned an
     * empty list for `SPEC_1_LAYOUT_KINDS`, so every layout kind looked like a
     * version 2 addition and `field` — a version 1 kind since the beginning — was
     * reported as missing from the version 2 section.
     */
    const types = ['types.ts', 'layout.ts']
      .map((name) => readFileSync(join(repo, 'packages', 'spec', 'src', name), 'utf8'))
      .join('\n')
    const list = (name: string): string[] => {
      const found = new RegExp(`export const ${name}[^=]*=\\s*\\[([^\\]]*)\\]`, 's').exec(types)
      return [...(found?.[1] ?? '').matchAll(/'([^']+)'/g)].map((match) => match[1] ?? '')
    }

    const inOne = new Set(list('SPEC_1_FIELD_TYPES'))
    const kindsInOne = new Set(list('SPEC_1_LAYOUT_KINDS'))

    // The layout kinds come from the document schema, which is where they are exhaustive:
    // each branch of `layoutNode` declares its own `kind` as a const.
    const schema = JSON.parse(
      readFileSync(join(repo, 'packages', 'spec', 'formancy.schema.json'), 'utf8'),
    ) as { $defs: Record<string, { oneOf?: Array<{ properties?: { kind?: { const?: string } } }> }> }
    const kinds = (schema.$defs['layoutNode']?.oneOf ?? [])
      .map((branch) => branch.properties?.kind?.const)
      .filter((kind): kind is string => kind !== undefined)

    // Per version, since there are three. Attributing every non-version-1 type to
    // version 2 was right while 2 was the newest and became a lie the moment 3
    // existed -- it would have demanded that the version 2 section name
    // `signature`, which version 2 does not have.
    // Unioned, because `SPEC_2_FIELD_TYPES` is written as "version 1's, plus…":
    // it spreads the first list rather than repeating it, and a regex over the
    // source reads the five literals and not the spread. Reading only those five
    // made every version 1 type look like a version 3 addition.
    const inTwo = new Set([...list('SPEC_1_FIELD_TYPES'), ...list('SPEC_2_FIELD_TYPES')])
    // And again for version 3, whose list spreads version 2's: its literals ARE its
    // additions. "Every type not in version 2" was version 3's answer only while 3 was the
    // newest — the moment version 4 added `ranking`, that subtraction handed version 3's
    // section a type it has never had.
    const inThree = new Set([...inTwo, ...list('SPEC_3_FIELD_TYPES')])
    return {
      types: list('SPEC_2_FIELD_TYPES').filter((type) => !inOne.has(type)),
      typesInThree: list('SPEC_3_FIELD_TYPES').filter((type) => !inTwo.has(type)),
      typesInFour: list('FIELD_TYPES').filter((type) => !inThree.has(type)),
      kinds: kinds.filter((kind) => !kindsInOne.has(kind)),
      // Widgets belong to versions too, which they did not while there were two:
      // `widget` itself arrived in 2, so every widget looked like a version 2
      // widget and the version 2 section was asked to name `tagpicker`.
      widgets: list('SPEC_2_WIDGETS'),
      /*
       * Each version's own list, not a subtraction from the whole.
       * `FIELD_WIDGETS` minus version 2's was version 3's answer only while 3 was
       * the newest: the moment spec 4 added `rating` and `slider`, that
       * subtraction handed version 3's section two widgets it has never had.
       *
       * Reading the literals in `SPEC_3_WIDGETS` is exactly right, because it is
       * written as "version 2's, plus one" — it spreads the earlier list rather
       * than repeating it, so the literals written there ARE its additions.
       */
      widgetsInThree: list('SPEC_3_WIDGETS'),
      widgetsInFour: list('SPEC_4_WIDGETS'),
    }
  }

  /**
   * One heading's worth of the document, and no more.
   *
   * The first version of this read the whole freeze section, and it PASSED with a sixth
   * field type added to the code -- because that section's closing paragraph says
   * `signature` is a spec 3 feature, which is the same word in the opposite claim. A
   * substring search over a long enough section finds every word it looks for.
   */
  const under = (heading: string): string => {
    const text = readFileSync(join(repo, 'MIGRATIONS.md'), 'utf8')
    const start = text.indexOf(heading)
    expect(start, `MIGRATIONS.md has no "${heading}" section`).toBeGreaterThan(-1)
    // The next heading at the same level or above, so a `###` slice ends at the next one
    // rather than at the end of the document.
    const rest = text.slice(start + heading.length)
    const next = /\n#{1,3} /.exec(rest)
    return next === null ? rest : rest.slice(0, next.index)
  }

  test('names every field type, layout kind and widget that version 2 added', () => {
    const { types, kinds, widgets } = additions()
    // A guard on the guard: empty lists would pass forever, and version 2 added all three.
    expect(types.length).toBeGreaterThan(0)
    expect(kinds.length).toBeGreaterThan(0)
    expect(widgets.length).toBeGreaterThan(0)

    const text = under('### What version 2 added')
    const missing = [...types, ...kinds, ...widgets].filter(
      (name) => !text.includes(`\`${name}\``),
    )
    expect(missing).toEqual([])
  })

  test('and names every field type version 3 added', () => {
    // `SPEC_2_FIELD_TYPES` is the seam: a type added to `FIELD_TYPES` and not to
    // it belongs to version 3, and a reader pinned to 2 refuses a document that
    // carries one rather than dropping the answer it cannot render.
    const { typesInThree, widgetsInThree } = additions()
    expect(typesInThree.length).toBeGreaterThan(0)
    expect(widgetsInThree.length).toBeGreaterThan(0)

    const text = under('### What version 3 added')
    expect(
      [...typesInThree, ...widgetsInThree].filter((name) => !text.includes(`\`${name}\``)),
    ).toEqual([])
  })

  test('and names every widget and field type version 4 added', () => {
    /*
     * The same shape as version 3's case, and it has to exist for the same
     * reason: a section that does not name an addition is a reader who cannot
     * find out what a version costs them. Version 4 is the one where that
     * matters most, because it is **not frozen** — anybody reading it is reading
     * a moving target and the list is how they tell what has moved so far.
     */
    const { widgetsInFour, typesInFour } = additions()
    expect(widgetsInFour.length, 'version 4 has added no widget to name').toBeGreaterThan(0)
    expect(typesInFour.length, 'version 4 has added no field type to name').toBeGreaterThan(0)

    const text = under('### What version 4 added')
    expect(
      [...widgetsInFour, ...typesInFour].filter((name) => !text.includes(`\`${name}\``)),
    ).toEqual([])
  })

  test('and says every version the code speaks is frozen, and none is open', () => {
    // Version 4 was open, and this case said so; it froze with the two types it was opened
    // for (0140). Read from the code's own list of versions, so a version 5 the code learns
    // to speak has to arrive with a heading here saying which it is — and while it is open,
    // this case is where that has to be written down.
    const text = readFileSync(join(repo, 'MIGRATIONS.md'), 'utf8')
    const types = readFileSync(join(repo, 'packages', 'spec', 'src', 'types.ts'), 'utf8')
    const versions = [
      ...(/export const SPEC_VERSIONS = \[([^\]]*)\]/.exec(types)?.[1] ?? '').matchAll(/'(\d+)'/g),
    ].map((match) => match[1]!)

    expect(versions.length, 'no versions were read out of the code').toBeGreaterThan(3)
    for (const version of versions) {
      expect(text, `version ${version}`).toContain(`## Spec version ${version} is FROZEN`)
    }
    expect(text).not.toMatch(/^## Spec version \d+ is OPEN/m)
  })

  test('says the version is frozen and what a version 1 document may not carry', () => {
    // The properties, which are the half that caught people out: `widget`, a temporal
    // bound and `optionsSource` are not types, and a version 1 reader refuses the whole
    // document over any of them rather than ignoring it.
    const text = under('### A property is as much a version as a type')
    for (const property of ['widget', 'earliest', 'latest', 'optionsSource', 'span', 'columns']) {
      expect(text, `the freeze does not mention \`${property}\``).toContain(`\`${property}\``)
    }
  })
})

describe('the files the coverage policy excludes as configuration', () => {
  /*
   * The same argument the barrel guard below makes, for the exclusion added
   * beside them: anything dropped from the measurement for having no behaviour
   * must have none. An exclusion nobody checks is an escape hatch, and this one
   * is a glob — `src/content.config.ts` in any package — so it could quietly
   * cover a file that grew logic.
   *
   * What makes it safe is not its name but its size and its shape: a config that
   * wires a loader to a schema has no branches, no functions and nothing to
   * assert. If one grows any of those, it is code and belongs in the figure.
   */
  test('contain no logic, because a config that computes is code', () => {
    const configs: Array<{ path: string; text: string }> = []
    for (const group of ['packages', 'apps']) {
      for (const entry of readdirSync(join(repo, group), { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const path = join(group, entry.name, 'src', 'content.config.ts')
        if (!existsSync(join(repo, path))) continue
        configs.push({ path, text: readFileSync(join(repo, path), 'utf8') })
      }
    }

    // A guard on the guard: no file found means nothing checked, and the
    // exclusion would sit there unexamined.
    expect(configs.length, 'the excluded config was not found').toBeGreaterThan(0)

    for (const { path, text } of configs) {
      const body = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      const lines = body.split(/\r?\n/).filter((line) => line.trim() !== '')
      expect(lines.length, `${path} is long enough to hide logic`).toBeLessThan(20)
      for (const keyword of ['if (', 'for (', 'while (', '=>', 'function ']) {
        expect(body.includes(keyword), `${path} contains \`${keyword}\`, so it is code rather than wiring`).toBe(
          false,
        )
      }
    }
  })
})

describe('the files the coverage policy excludes as barrels', () => {
  /*
   * `vitest.coverage.ts` drops every `src/index.ts` from the measurement, and gives the
   * reason: "Barrels (index.ts that only re-exports). They have no behaviour." The
   * exclusion is right exactly as long as the reason is true.
   *
   * It was not. `@formancy/challenge` reported 0% statements with fifteen passing tests,
   * because its whole implementation — mint, verify, hash, the encoding both sides share
   * — lives in `index.ts` and was excluded as though it were a re-export list.
   * `@formancy/tiptap` had the same shape. A zero there does not read as "not measured",
   * it reads as "not tested", and the opposite was true.
   *
   * So: anything excluded for having no behaviour must have none.
   */
  /*
   * What counts is RUNTIME code, not every line that is not an import. The first version
   * asked for lines that were neither import nor export and flagged
   * `childrenAt as layoutChildrenAt,` -- a renamed member of a re-export written across
   * several lines, which is the most ordinary thing a barrel contains.
   *
   * A `type` or an `interface` is fine here too: it compiles to nothing, so it cannot be
   * wrong at runtime and cannot be covered either.
   */
  const runtimeDeclaration = /^(export\s+)?(default\s+)?(async\s+)?(function|class|const|let|var)\s/

  test('contain re-exports and nothing that could be wrong', () => {
    const offenders: string[] = []
    for (const group of ['packages', 'apps']) {
      const root = join(repo, group)
      if (!existsSync(root)) continue
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        const barrel = join(root, entry.name, 'src', 'index.ts')
        if (!entry.isDirectory() || !existsSync(barrel)) continue

        const behaviour = readFileSync(barrel, 'utf8')
          .split('\n')
          .map((line, index) => ({ line: line.trim(), at: index + 1 }))
          .filter(({ line }) => runtimeDeclaration.test(line))
          // `export const` of a plain re-export is not a thing, but `export type` is, and
          // the pattern above already lets it through.
          .filter(({ line }) => !line.startsWith('export type'))

        if (behaviour.length > 0) {
          offenders.push(
            `${group}/${entry.name}/src/index.ts holds behaviour at line ${String(
              behaviour[0]?.at,
            )}: ${behaviour[0]?.line ?? ''}`,
          )
        }
      }
    }

    expect(offenders).toEqual([])
    // A guard on the guard: a wrong path would find no barrels and pass forever.
    expect(existsSync(join(repo, 'packages', 'core', 'src', 'index.ts'))).toBe(true)
  })
})

/**
 * The roadmap names absences, and an absence is the claim most likely to rot.
 *
 * Three sentences in it were measured false on the same afternoon, all three
 * describing something as missing that had shipped: the drag gesture that makes a
 * row (shipped two days earlier), and the draft endpoint and token (shipped in
 * 0062, with routes, a signed id and a notice in both renderers). Nothing failed,
 * because prose does not break — and one of the three had been *written* in the
 * commit that shipped the feature it said was missing.
 *
 * So the two that can be derived, are. Both read the source of `@formancy/
 * server-core` rather than any wording about it, because deriving the fact from
 * the code is the only half of this a test can hold.
 */
/**
 * The landing page's promise about the playground, held against the playground.
 *
 * *"Open the form builder to add and arrange fields yourself, then preview your
 * form in React and Angular."* That sentence was on the landing page — the most
 * visible prose in the project — while the playground rendered **React only**.
 * Nobody wrote it dishonestly: the Angular package existed, was published, and
 * was mounted by no application, so the sentence described the product as
 * designed rather than as built.
 *
 * Derived from the page that has to deliver it, in both directions, so the claim
 * and the capability cannot drift apart again
 * ([0095](../../../docs/decisions/0095-one-schema-two-renderers.md)).
 */
describe('what the landing page promises the playground does', () => {
  const read = (...parts: string[]): string => readFileSync(join(repo, ...parts), 'utf8')

  /**
   * Every source file of the playground, concatenated.
   *
   * Scanned rather than named, because the claim is about what the *playground*
   * mounts and not about which file does it. A first version of this read
   * `app.tsx`, and the next change — moving the builder pane into its own file
   * when the size budget asked for it — broke the guard without changing
   * anything it was guarding.
   */
  const playgroundSources = (): string => {
    const directory = join(repo, 'apps', 'playground', 'src')
    const names = readdirSync(directory).filter(
      (name) => /\.tsx?$/.test(name) && !/\.test\./.test(name),
    )
    expect(names.length, 'the playground has no sources, so nothing below is checked').toBeGreaterThan(5)
    return names.map((name) => readFileSync(join(directory, name), 'utf8')).join('\n')
  }

  const BOTH_RENDERERS = /preview your form in React and Angular/

  test('is a sentence that is actually there, which is a guard on this guard', () => {
    expect(read('apps', 'site', 'src', 'app.tsx')).toMatch(BOTH_RENDERERS)
  })

  test('and the playground mounts both renderers, not only the one it used to', () => {
    /*
     * Derived from what the page MOUNTS rather than from anything it says about
     * itself. `FormancyForm` is the React renderer and `AngularPane` is the
     * Angular one bootstrapped into a host; losing either makes the landing
     * page's sentence false, and this is where that is noticed.
     */
    const playground = playgroundSources()

    expect(playground, 'the playground stopped rendering the React form').toMatch(
      /<FormancyForm\s/,
    )
    expect(playground, 'the playground stopped mounting the Angular renderer').toMatch(
      /<AngularPane\s/,
    )
  })

  test('and mounts the Angular BUILDER too, over the same session as the React one', () => {
    /*
     * The roadmap asked for this as its own item until the day it shipped. Both
     * builders bind one `BuilderSession` — there is one document, so there is
     * one undo stack — and the guard is that the pane mounts it at all, since
     * the package was for a long time mounted by nothing and, it turned out,
     * importable by nothing either
     * ([0096](../../../docs/decisions/0096-two-builders-one-session.md)).
     */
    expect(
      playgroundSources(),
      'the playground stopped mounting the Angular builder',
    ).toMatch(/<AngularBuilderPane\s/)

    // One session, passed to both. A `session=` that was not the same expression
    // would be two documents pretending to be one.
    const pane = read('apps', 'playground', 'src', 'angular-builder-pane.tsx')
    expect(pane, 'the Angular builder stopped using the session it was given').toMatch(
      /mountAngularBuilder\(element, session,/,
    )

    // And the package can be imported at all, which is the defect that hid this.
    const manifest = JSON.parse(read('packages', 'builder-angular', 'package.json')) as {
      exports?: unknown
      types?: unknown
    }
    expect(manifest.exports, '@formancy/builder-angular is unimportable again').toBeDefined()
    expect(manifest.types).toBeDefined()
  })

  test('and gives each renderer its own id namespace, or they break each other', () => {
    // Two engines over one schema mint identical element ids, and `label[for]`
    // resolves to the first match — so the second renderer's controls lose their
    // accessible names entirely. Measured. The namespaces are what prevent it,
    // and they are easy to remove while the page still looks right.
    const namespaces = [...playgroundSources().matchAll(/forRenderer\('([a-z]+)'\)/g)].map(
      (match) => match[1]!,
    )

    expect(namespaces.length).toBe(2)
    expect(new Set(namespaces).size, 'both renderers were given the same form id').toBe(2)
  })
})

describe('what the roadmap says is still to do', () => {
  const roadmap = (): string =>
    readFileSync(join(repo, 'apps', 'docs', 'src', 'content', 'docs', 'project', 'roadmap.md'), 'utf8')

  /** The numbered list of what is still to do, and nothing after it. */
  const stillToDo = (): string => {
    const text = roadmap()
    const from = text.indexOf('## What comes next')
    const to = text.indexOf('### Done since this list was written', from)
    expect(from, 'the roadmap has no "what comes next" section').toBeGreaterThan(-1)
    expect(to, 'the roadmap has no "done since" section').toBeGreaterThan(from)
    return text.slice(from, to)
  }

  /** The refusal kinds one outcome union declares, read off the union itself. */
  function kindsOf(union: string, file: string): string[] {
    const source = readFileSync(join(repo, 'packages', 'server-core', 'src', file), 'utf8')
    const at = source.indexOf(`export type ${union} =`)
    if (at === -1) return []
    const body = source.slice(at, source.indexOf('\n\n', at))
    return [...body.matchAll(/kind: '([a-z_]+)'/g)].map((match) => match[1]!)
  }

  test('no longer asks for collision control, because publishing refuses a stale base', () => {
    /*
     * This asserted the opposite until the day the feature shipped, which is
     * what it was for: *"the 409 pattern exists on the submission path and wants
     * extending to the editor"*, derived from the two outcome unions so that
     * adding the refusal would fail here and force the roadmap item out.
     *
     * It did. Turned around rather than deleted: the same derivation now holds
     * that both paths refuse a stale version, and that the list has stopped
     * asking.
     */
    expect(kindsOf('SubmissionOutcome', 'use-cases.ts')).toContain('version_changed')
    expect(kindsOf('PublishOutcome', 'publishing.ts')).toContain('version_changed')

    // The section that ASKS, not the whole document: written against the file it
    // also banned the phrase from the paragraph recording that it is done, which
    // is a guard policing words rather than the claim behind them.
    expect(stillToDo()).not.toMatch(/Collision control on form editing/)
  })

  test('no longer asks the builder to keep rules in step, because it does', () => {
    /*
     * The item this replaces said both `renameField` and `unwrapField` refused
     * a document a rule mentioned. One did. The other succeeded and left the
     * rule reading a path no field had, which is why a list item was the wrong
     * artefact for it and a test is the right one
     * ([0093](../../../docs/decisions/0093-a-rule-follows-the-path-it-reads.md)).
     *
     * Derived from the capability rather than from the wording: the day
     * `rewritePath` stops being exported, or `repath.ts` stops rewriting a
     * rule's three path-bearing places, this fails.
     */
    const exported = readFileSync(
      join(repo, 'packages', 'expressions', 'src', 'index.ts'),
      'utf8',
    )
    expect(exported).toMatch(/export \{ rewritePath \}/)

    const repath = readFileSync(join(repo, 'packages', 'builder-core', 'src', 'repath.ts'), 'utf8')
    for (const place of ['next.target =', 'rewritePath(rule.cel', 'repathEditor(rule.editor']) {
      expect(repath, `repath.ts no longer moves ${place}`).toContain(place)
    }

    expect(stillToDo()).not.toMatch(/Rewriting a data path inside a rule's condition/)
  })

  test('no longer asks for detection, because a publish warns about it', () => {
    /*
     * Turned around rather than deleted, and the original is worth keeping in
     * view because it was asserting the wrong thing for the right reason.
     *
     * It validated a document whose rule reads `noSuchField` and asserted
     * `validateSchema` accepts it — which is true, and which is not what the
     * roadmap item was about. PUBLISHING refuses that document: the engine
     * compiles each rule against the fields that exist, so an unknown root is
     * fatal. The gap was only ever the deeper cases, `address.nope` and
     * `item.nope`, which type-check because a member of a `map` is `dyn`.
     *
     * So this now derives the capability rather than the gap. `validateSchema`
     * still accepts the document — the decision was to warn, not to tighten
     * what a reader accepts
     * ([0097](../../../docs/decisions/0097-a-publish-may-warn.md)) — and the
     * warning has to exist and travel.
     */
    const document = {
      specVersion: '1',
      id: 'gap',
      title: 'Gap',
      model: { fields: [{ key: 'note', type: 'text' }] },
      logic: { rules: [{ target: 'note', kind: 'visible', cel: 'noSuchField == 1' }] },
    }
    // Unchanged on purpose: refusing here is the thing 0097 decided against.
    expect(validateSchema(document).valid).toBe(true)

    const core = readFileSync(join(repo, 'packages', 'core', 'src', 'index.ts'), 'utf8')
    expect(core, 'the unknown-path check is no longer exported').toMatch(
      /export \{ unknownReferences \}/,
    )

    const publishing = readFileSync(
      join(repo, 'packages', 'server-core', 'src', 'publishing.ts'),
      'utf8',
    )
    expect(publishing, 'publishing no longer computes warnings').toContain('unknownReferences(')
    expect(publishing, 'a successful publish no longer carries them').toContain('warnings')

    expect(stillToDo()).not.toMatch(/Detecting a rule that reads a path no field has/)
  })

  test('and does not describe the draft routes as missing, because they exist', () => {
    // The sentence that was wrong: "what is missing is an endpoint and a token".
    // Derived from the routes the server actually registers, not from the
    // roadmap's own wording about them.
    const app = readFileSync(join(repo, 'packages', 'server', 'src', 'app.ts'), 'utf8')
    const draftRoutes = [...app.matchAll(/app\.(post|put|get)\(\s*'(\/f\/:path\/drafts[^']*)'/g)].map(
      (match) => `${match[1]!.toUpperCase()} ${match[2]!}`,
    )
    // Start, save, resume. Anything fewer and the paragraph below is the wrong
    // paragraph.
    expect(draftRoutes.length).toBeGreaterThanOrEqual(3)

    const said = roadmap()
    expect(said).not.toMatch(/missing is an endpoint and a token/)
  })
})

/**
 * Where a rule runs when it does not say.
 *
 * `runsOn` has ONE declared default and the engine applies TWO, and the gap was
 * silent in the worst direction. A `validate` rule with no `runsOn` falls back to
 * `both`, which is what the JSON Schema says. A `check` falls back to `server` —
 * the safe choice, since only the server can always answer one — and the schema
 * said `both`, so a check written the obvious way never ran in the browser: no
 * error, no request, an answer accepted that nothing had checked.
 *
 * Found by building a demo of it rather than by reading either file. Both values
 * are derived from `engine.ts` here, because the document is the thing that can
 * be wrong and the code is the thing that decides.
 */
describe('where a rule runs when it does not say', () => {
  const engineSource = (): string =>
    readFileSync(join(repo, 'packages', 'core', 'src', 'engine.ts'), 'utf8')

  const runsOnProperty = (): { description?: string; default?: string } => {
    const schema = JSON.parse(
      readFileSync(join(repo, 'packages', 'spec', 'formancy.schema.json'), 'utf8'),
    ) as Record<string, unknown>
    const found: Array<Record<string, unknown>> = []
    const walk = (node: unknown): void => {
      if (node === null || typeof node !== 'object') return
      const record = node as Record<string, unknown>
      const properties = record['properties'] as Record<string, unknown> | undefined
      if (properties?.['runsOn'] !== undefined) {
        found.push(properties['runsOn'] as Record<string, unknown>)
      }
      for (const value of Object.values(record)) walk(value)
    }
    walk(schema)
    expect(found.length).toBeGreaterThan(0)
    return found[0] as { description?: string; default?: string }
  }

  /** The fallback applied to a validation rule, read off the filter that applies it. */
  const validateFallback = (): string => {
    const found = /kind === 'validate' && \(entry\.rule\.runsOn \?\? '(\w+)'\)/.exec(engineSource())
    expect(found, 'the validate filter has moved; this guard is reading nothing').not.toBeNull()
    return found?.[1] ?? ''
  }

  /** And the one applied to a check, read off the list of checks this side runs. */
  const checkFallback = (): string => {
    const source = engineSource()
    const at = source.indexOf('const activeChecks')
    expect(at, 'activeChecks has been renamed; this guard is reading nothing').toBeGreaterThan(0)
    const found = /rule\.runsOn \?\? '(\w+)'/.exec(source.slice(at))
    expect(found).not.toBeNull()
    return found?.[1] ?? ''
  }

  test('is reading two different fallbacks, which is the whole point', () => {
    // A guard on the guard: if these ever agree, the paragraph this protects is
    // saying something more complicated than the truth and should be simplified
    // rather than left.
    expect(validateFallback()).not.toBe(checkFallback())
  })

  test("the schema's declared default is the one a validate rule gets", () => {
    expect(runsOnProperty().default).toBe(validateFallback())
  })

  /** What the check branch of the rule's conditional block overrides. */
  const checkBranchDefault = (): unknown => {
    const schema = JSON.parse(
      readFileSync(join(repo, 'packages', 'spec', 'formancy.schema.json'), 'utf8'),
    ) as { $defs: Record<string, { allOf?: Array<Record<string, any>> }> }
    const block = (schema.$defs['logicRule']?.allOf ?? []).find(
      (entry) => entry['if']?.properties?.kind?.const === 'check',
    )
    return block?.['then']?.properties?.runsOn?.default
  }

  test('and the check branch declares the different one a check gets', () => {
    // Compared as VALUES, and that is the whole of why the schema states this on
    // the branch rather than in a sentence. Written as a phrase match first, this
    // passed immediately -- the shared description happens to contain the words
    // "check" and "server" in a paragraph about neither. Green, asserting
    // nothing, which is the failure this repository has shipped before.
    expect(checkBranchDefault()).toBe(checkFallback())
  })

  test('and the generated reference carries it, because that is what is read', () => {
    // The reference is generated from the schema, and the generator did not read
    // the rule's conditional block at all -- so everything the schema said per
    // kind was published nowhere. This is the value arriving where a developer
    // meets it.
    const reference = readFileSync(
      join(repo, 'apps', 'docs', 'src', 'content', 'docs', 'reference', 'spec.md'),
      'utf8',
    )
    expect(reference).toContain('default `"' + checkFallback() + '"`')
  })
})

describe('a question an accepted decision record has settled', () => {
  /*
   * The failure this exists for, in the shape it actually took.
   *
   * 0069 decided the contributor agreement on 2026-09-27. A week later arc42
   * §11.5 still listed "CLA or DCO" under *Open decisions*, and it was found by
   * somebody asking what was still open and reading that section instead of the
   * decision records -- so the answer given was the stale one. A section called
   * *Open decisions* is read as an answer, which makes a settled question listed
   * there a wrong statement rather than a missing one.
   *
   * Derived from the record's own status, not from any wording: flip 0069 to
   * `proposed` and these cases go quiet, which is the only honest way to express
   * "this is no longer open".
   */
  const AGREEMENT_RECORD = '0069-contributions-under-a-cla.md'

  /** The status line of a decision record, read off the record. */
  const statusOf = (file: string): string => {
    const text = readFileSync(join(repo, 'docs', 'decisions', file), 'utf8')
    return /- \*\*Status:\*\*\s*(.+)/.exec(text)?.[1]?.trim() ?? ''
  }

  /**
   * The bullets of arc42 §11.5, each one whole.
   *
   * Bullets rather than the section's text, and this is the whole point: the
   * paragraph *recording* that the contributor agreement left this list says
   * "CLA or DCO" in order to say it is gone. A check over the section would
   * match that and fail; a check that then got "fixed" by deleting the
   * paragraph would have cost the repository the only place the mistake is
   * written down. The same trap caught a documentation check here once already,
   * in the other direction -- it passed because the banned phrase survived
   * elsewhere in the paragraph.
   *
   * Continuation lines are joined in, because the bullets in that section wrap
   * and a subject on the second line is still that bullet's subject.
   */
  const openDecisions = (): string[] => {
    const text = readFileSync(join(repo, 'docs', 'architecture', '11-risks-and-debt.md'), 'utf8')
    const from = text.indexOf('## 11.5 Open decisions')
    expect(from, 'arc42 has no open-decisions section').toBeGreaterThan(-1)
    const after = text.indexOf('\n## ', from + 1)
    const section = text.slice(from, after === -1 ? text.length : after)

    const bullets: string[] = []
    for (const line of section.split('\n')) {
      if (line.startsWith('- ')) bullets.push(line)
      else if (/^\s+\S/.test(line) && bullets.length > 0) bullets[bullets.length - 1] += ` ${line.trim()}`
      else if (line.trim() === '') continue
      else bullets.push('')
    }
    return bullets.filter((bullet) => bullet !== '')
  }

  test('is one the section being checked still lists several of, or it checks nothing', () => {
    // A guard on the guard. An emptied or renamed section would make the case
    // below pass while asserting that nothing is listed, which is true of a
    // section that is not there.
    expect(openDecisions().length).toBeGreaterThan(1)
    expect(statusOf(AGREEMENT_RECORD)).toBe('accepted')
  })

  test('is not the contributor agreement, which 0069 settled', () => {
    if (statusOf(AGREEMENT_RECORD) !== 'accepted') return

    for (const bullet of openDecisions()) {
      expect(bullet, 'arc42 §11.5 lists a question 0069 has already decided').not.toMatch(/\bCLA\b|\bDCO\b/)
    }
  })

  test('and the documents a contributor reads name the agreement and the record', () => {
    /*
     * The other half of what 0069 asked for: "a guard would go [here] if
     * GOVERNANCE.md and CONTRIBUTING.md ever disagree about the answer".
     *
     * Asserted as paths rather than as prose, and the paths come from the check
     * that reads them. A document still describing the question as open would
     * not be naming an agreement file, and a check whose record moved would take
     * both documents with it instead of leaving them pointing at nothing.
     */
    for (const name of ['CONTRIBUTING.md', 'GOVERNANCE.md']) {
      const text = readFileSync(join(repo, name), 'utf8')
      expect(text, `${name} does not name ${AGREEMENT}`).toContain(AGREEMENT)
      expect(text, `${name} does not name ${SIGNATORIES}`).toContain(SIGNATORIES)
    }
  })
})

describe('what a reader found that nineteen guards had not', () => {
  /*
   * Two stale claims, both found by somebody reading this repository against a
   * competitor's feature list rather than by anything here.
   *
   * 1. The README said "The visual editor is built in React" — true until the
   *    Angular builder shipped, and then false in the one sentence a visitor
   *    reads before the paragraph that contradicts it. It gave away the single
   *    thing this project has that the obvious commercial comparison does not.
   * 2. The roadmap listed `toggle` in a table of things that are not here,
   *    unstruck, while the widget had been in the spec since version 2.
   *
   * Both are the shape this file exists for: a sentence that was true when
   * written, is false now, and changed nothing in any diff. What the existing
   * cases guarded was the roadmap's *what comes next* list and the playground's
   * mounts — neither of which covers a table of names or a one-line summary.
   */
  /** Every field type, widget and layout kind the document schema defines. */
  const vocabulary = (): Set<string> => {
    const schema = JSON.parse(
      readFileSync(join(repo, 'packages', 'spec', 'formancy.schema.json'), 'utf8'),
    ) as Record<string, unknown>

    const found = new Set<string>()
    const VOCABULARY_KEYS = ['fieldType', 'widget', 'kind']

    /*
     * The context is carried down, which is the whole trick. These three are
     * each spelled differently in the schema: a `widget` is an `enum`, a layout
     * `kind` is a `const` on the key itself, and a **field type is eighteen
     * `oneOf` branches each with its own `const`** — so a walk that only looked
     * at the keyed node found ten names and missed every type. The guard on the
     * guard caught that, which is the one job it has.
     */
    const walk = (node: unknown, key: string, within: string | undefined): void => {
      if (node === null || typeof node !== 'object') return
      const record = node as Record<string, unknown>
      const context = VOCABULARY_KEYS.includes(key) ? key : within

      if (context !== undefined) {
        if (typeof record['const'] === 'string') found.add(record['const'])
        if (Array.isArray(record['enum'])) {
          for (const value of record['enum']) if (typeof value === 'string') found.add(value)
        }
      }
      for (const [childKey, child] of Object.entries(record)) walk(child, childKey, context)
    }
    walk(schema, '', undefined)
    return found
  }

  /** The first cell of each row in the reserved-names table. */
  const reservedNames = (): Array<{ cell: string; names: string[] }> => {
    const roadmap = readFileSync(
      join(repo, 'apps', 'docs', 'src', 'content', 'docs', 'project', 'roadmap.md'),
      'utf8',
    )
    const from = roadmap.indexOf('## Field type names that were reserved')
    expect(from, 'the roadmap has no reserved-names section').toBeGreaterThan(-1)
    const after = roadmap.indexOf('\n## ', from + 1)
    const section = roadmap.slice(from, after === -1 ? roadmap.length : after)

    return section
      .split('\n')
      .filter((line) => line.startsWith('| '))
      .map((line) => line.split('|')[1] ?? '')
      .map((cell) => ({ cell, names: [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1]!) }))
      .filter(({ names }) => names.length > 0)
  }

  test('is read correctly, which is what lets the two cases below fail', () => {
    // A guard on the guard, and it earns it twice over: these read a table out of
    // prose and an enum out of a generated schema, and either returning nothing
    // would make both cases pass while asserting that nothing is wrong.
    /*
     * **One name per spelling, not a count.** A count was the first version and
     * it let a real mutation through: dropping the context from the walker loses
     * all eighteen field types and still leaves twelve widgets and layout kinds,
     * which cleared a `> 10` threshold. A number nobody chose for a reason is a
     * number that passes for the wrong one.
     *
     * So each of the three spellings the walker has to handle is pinned by a name
     * that cannot go away: a field type is a `oneOf` branch with a `const`, a
     * widget is an `enum`, a layout kind is a `const` on the key. All four names
     * belong to frozen spec versions, which is what makes them safe to write by
     * hand — version 1, 2 and 3 remove nothing, ever
     * ([0051](../../../docs/decisions/0051-spec-2-adds-types.md)).
     */
    const defined = vocabulary()
    expect(defined.has('text'), 'no spec 1 field type: the oneOf branches were missed').toBe(true)
    expect(defined.has('signature'), 'no spec 3 field type').toBe(true)
    expect(defined.has('toggle'), 'no widget: the enums were missed').toBe(true)
    expect(defined.has('section'), 'no layout kind: the kind consts were missed').toBe(true)

    expect(reservedNames().length, 'no rows were read out of the reserved-names table').toBeGreaterThan(3)
  })

  test('the roadmap does not list, as missing, a name the schema already defines', () => {
    /*
     * Derived from the schema rather than from a list kept beside it, so the next
     * reserved name to ship cannot sit here quietly either. A row that has shipped
     * is struck through and says what it became — the table's own convention, and
     * the reason it reads as a record rather than a backlog.
     */
    const defined = vocabulary()

    for (const { cell, names } of reservedNames()) {
      if (cell.includes('~~')) continue
      for (const name of names) {
        expect(defined.has(name), `the roadmap lists \`${name}\` as not here yet, and the schema defines it`).toBe(
          false,
        )
      }
    }
  })

  test('and the names it says are absent from the type list are absent from it', () => {
    /*
     * The sentence under the missing list named `signature` as a reserved name "simply
     * absent from the type list" for two spec versions after `signature` became a type.
     * The table above is held by the case before this one; the sentence was not, because
     * it is prose rather than a row.
     */
    const roadmap = readFileSync(
      join(repo, 'apps', 'docs', 'src', 'content', 'docs', 'project', 'roadmap.md'),
      'utf8',
    )
    const sentence = roadmap
      .split('\n\n')
      .find((paragraph) => paragraph.startsWith('Field **type names**'))
    expect(sentence, 'the roadmap no longer has the reserved-names sentence').toBeDefined()
    const names = [...(sentence ?? '').matchAll(/`([^`]+)`/g)].map((match) => match[1]!)
    expect(names.length, 'no names were read out of the sentence').toBeGreaterThan(0)

    const defined = vocabulary()
    for (const name of names) {
      expect(defined.has(name), `the roadmap says ${name} is absent, and the schema defines it`).toBe(
        false,
      )
    }
  })

  test('and no document says the editor is built in one framework when two build it', () => {
    /*
     * Derived from the packages. A builder package per framework is the fact; a
     * sentence naming fewer of them is the claim that went wrong, and it went
     * wrong in the summary paragraph rather than in the section about builders —
     * which is why a reader hit it and the guards did not.
     */
    const frameworks = readdirSync(join(repo, 'packages'))
      .filter((name) => name.startsWith('builder-') && name !== 'builder-core')
      .map((name) => name.slice('builder-'.length))

    expect(frameworks.length, 'no builder packages were found to compare against').toBeGreaterThan(1)

    for (const { name, text } of liveDocuments()) {
      for (const [sentence, named] of text.matchAll(/(?:visual editor|builder) is built in ([^.;\n]*)/gi)) {
        for (const framework of frameworks) {
          expect(
            named!.toLowerCase().includes(framework),
            `${name} says the editor ${sentence.trim()} — there is a ${framework} builder too`,
          ).toBe(true)
        }
      }
    }
  })

  test('and the README names both builder packages, so deleting the sentence is not the fix', () => {
    // The case above is satisfied by a document that says nothing at all. This is
    // the positive half: the thing the project is unusual for has to be findable.
    const readme = readFileSync(join(repo, 'README.md'), 'utf8')

    expect(readme).toContain('@formancy/builder-react')
    expect(readme).toContain('@formancy/builder-angular')
  })

  test('and the README’s map of the repository names every package and app in it', () => {
    /*
     * Derived from the directories. The map had lost three of twenty — the proof-of-work
     * challenge, the rich-text editor and the Angular starter — while saying "7 fixtures"
     * of a suite with eleven and "two reference themes" of five: a map is read as complete,
     * so a missing row reads as a missing package.
     */
    const readme = readFileSync(join(repo, 'README.md'), 'utf8')
    const map = readme.slice(readme.indexOf('## Layout'))
    const mapped = new Set(
      [...map.matchAll(/^((?:packages|apps)\/[\w-]+)/gm)].map((match) => match[1]!),
    )
    const present = ['packages', 'apps'].flatMap((top) =>
      readdirSync(join(repo, top), { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(join(repo, top, entry.name, 'package.json')))
        .map((entry) => `${top}/${entry.name}`),
    )

    expect(present.length, 'no packages or apps were found to compare against').toBeGreaterThan(10)
    expect(present.filter((path) => !mapped.has(path)), 'not on the README’s map').toEqual([])
  })
})
