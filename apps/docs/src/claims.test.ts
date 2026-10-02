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
  } => {
    const types = readFileSync(join(repo, 'packages', 'spec', 'src', 'types.ts'), 'utf8')
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
    return {
      types: list('SPEC_2_FIELD_TYPES').filter((type) => !inOne.has(type)),
      typesInThree: list('FIELD_TYPES').filter((type) => !inTwo.has(type)),
      kinds: kinds.filter((kind) => !kindsInOne.has(kind)),
      // Widgets belong to versions too, which they did not while there were two:
      // `widget` itself arrived in 2, so every widget looked like a version 2
      // widget and the version 2 section was asked to name `tagpicker`.
      widgets: list('SPEC_2_WIDGETS'),
      widgetsInThree: list('FIELD_WIDGETS').filter(
        (widget) => !list('SPEC_2_WIDGETS').includes(widget),
      ),
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
