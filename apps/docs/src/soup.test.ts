import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * The SOUP declaration's composition table has to be the manifests.
 *
 * `docs/regulatory/SOUP-DECLARATION.md` exists for a manufacturer incorporating
 * formancy under IEC 62304, and §7.1.2 asks them to record what the software
 * needs from third parties. They do not read our `package.json` files; they
 * read that table and build their own dependency assessment on it.
 *
 * Which is why it must not be maintained by hand. It drifted three packages
 * (`challenge`, `builder-react`, `mcp`) and four dependencies (`server-core`
 * acquired two while the table still said "none", and `server` grew `undici`)
 * before this test existed. None of that is visible in a diff of the table,
 * because the table did not change — the code did.
 *
 * **A composition list that is wrong is worse than one that is absent**, since
 * an absent one prompts the question and a wrong one answers it incorrectly.
 * So the table is checked rather than trusted, and the check is cheap enough to
 * run on every commit.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')
const declaration = join(repo, 'docs', 'regulatory', 'SOUP-DECLARATION.md')

interface Manifest {
  readonly name: string
  readonly version: string
  readonly private?: boolean
  readonly dependencies?: Record<string, string>
  readonly peerDependencies?: Record<string, string>
}

function manifests(): Manifest[] {
  return readdirSync(join(repo, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map(
      (entry) =>
        JSON.parse(
          readFileSync(join(repo, 'packages', entry.name, 'package.json'), 'utf8'),
        ) as Manifest,
    )
    .filter((manifest) => manifest.private !== true)
}

/**
 * What the table should say for one package.
 *
 * Workspace dependencies are excluded deliberately: they are not SOUP. The
 * whole repository is delivered as one version under one licence, so a
 * manufacturer assessing `@formancy/server` is not separately assessing
 * `@formancy/spec` — that is the point of the single version line.
 */
function externalDependencies(manifest: Manifest): string[] {
  return Object.entries(manifest.dependencies ?? {})
    .filter(([name]) => !name.startsWith('@formancy/'))
    .map(([name, range]) => `${name} ${range}`)
    .sort()
}

/** The rows of the one Markdown table under "Composition". */
function tableRows(): Map<string, string> {
  const text = readFileSync(declaration, 'utf8')
  const section = text.slice(text.indexOf('## Composition and third-party dependencies'))
  const rows = new Map<string, string>()

  for (const line of section.split('\n')) {
    // `| `@formancy/spec` | `ajv ^8.20.0`, `@noble/hashes ^2.4.0` |`
    const match = /^\|\s*`(@formancy\/[a-z-]+)`\s*\|(.*)\|\s*$/.exec(line)
    if (match?.[1] === undefined || match[2] === undefined) continue
    rows.set(match[1], match[2].trim())
  }

  return rows
}

/** The dependencies a row claims, in the same shape `externalDependencies` gives. */
function claimed(cell: string): string[] {
  // A parenthesised aside names the peer, which is not a dependency: "none
  // (React is a peer)", "`tslib ^2.8.0` (Angular is a peer)".
  const withoutAside = cell.replace(/\([^)]*\)/g, '').trim()
  if (withoutAside === 'none' || withoutAside === '') return []

  return [...withoutAside.matchAll(/`([^`]+)`/g)]
    .map((match) => match[1]!)
    .sort()
}

describe('the SOUP composition table', () => {
  test('lists every published package, and nothing that is not one', () => {
    const published = manifests()
      .map((manifest) => manifest.name)
      .sort()

    expect([...tableRows().keys()].sort()).toEqual(published)
  })

  test('states the count it actually lists', () => {
    // "Ten packages" survived three packages being added, because a word is
    // not a number to anybody reading quickly.
    const WORDS: Readonly<Record<number, string>> = {
      10: 'Ten',
      11: 'Eleven',
      12: 'Twelve',
      13: 'Thirteen',
      14: 'Fourteen',
      15: 'Fifteen',
      16: 'Sixteen',
    }
    const count = manifests().length
    const word = WORDS[count]

    expect(word, `no spelling for ${count} packages — add it above`).toBeDefined()
    expect(readFileSync(declaration, 'utf8')).toContain(`${word!} published packages`)
  })

  test('names each package’s third-party dependencies, at the pinned ranges', () => {
    const rows = tableRows()

    const wrong = manifests()
      .map((manifest) => ({
        package: manifest.name,
        declared: claimed(rows.get(manifest.name) ?? ''),
        actual: externalDependencies(manifest),
      }))
      .filter((row) => JSON.stringify(row.declared) !== JSON.stringify(row.actual))

    // A range matters as much as a name here: the document opens by telling the
    // manufacturer to pin an exact version, so a table quoting a range the
    // manifest no longer asks for is characterising software nobody installs.
    expect(wrong).toEqual([])
  })

  test('names the peer dependency wherever a package has one', () => {
    // A peer is the manufacturer's to supply, so leaving it unsaid makes the
    // row read as "needs nothing" for a package that does not work alone.
    const unsaid = manifests()
      .filter((manifest) => Object.keys(manifest.peerDependencies ?? {}).length > 0)
      .filter((manifest) => !/\bis a peer\)/.test(tableRows().get(manifest.name) ?? ''))
      .map((manifest) => manifest.name)

    expect(unsaid).toEqual([])
  })
})

describe('the declaration’s own claims about the repository', () => {
  test('the engine really has no third-party runtime dependency', () => {
    // The table's headline sentence, and the one a reviewer is most likely to
    // quote back. It is a property of `@formancy/core`, so it can be checked.
    const core = manifests().find((manifest) => manifest.name === '@formancy/core')

    expect(core).toBeDefined()
    expect(externalDependencies(core!)).toEqual([])
  })

  test('the version it characterises is the version the packages carry', () => {
    // "This document describes version 0.1.0" is the sentence the whole
    // document depends on. One version line across the repository is what
    // makes that checkable.
    const text = readFileSync(declaration, 'utf8')
    const stated = /\*\*This document describes version `([^`]+)`\.\*\*/.exec(text)?.[1]

    expect(stated).toBeDefined()
    // A mismatch is not necessarily an error in the code — it means a release
    // happened and the characterisation has not been redone. Which is exactly
    // the thing a manufacturer must not discover for themselves.
    const versions = new Set(manifests().map((manifest) => manifest.version))
    expect([...versions]).toEqual([stated])
  })
})

describe('what the declaration says is not implemented', () => {
  /*
   * The rot this catches, and it had happened: the anomaly list said "async validators,
   * remote option sources, signature and date-time types are **not implemented**" while
   * `time`, `datetime` and `optionsSource` were all built and shipping. A manufacturer
   * reading that would leave out three features the software has — and a regulatory
   * document's wrong sentence is worse than an absent one, because an absent one prompts
   * the question.
   *
   * So the declaration names them as a list of backticked identifiers under one heading,
   * and this checks every one against the format's own vocabulary. Both directions come
   * from data: the names from the document, the vocabulary from the code and the schema.
   */
  const UNIMPLEMENTED_HEADING = '### Reserved, and not implemented'

  /** Every name the format actually knows: a field type, a widget, a layout kind or a rule property. */
  const vocabulary = (): Set<string> => {
    const types = readFileSync(join(repo, 'packages', 'spec', 'src', 'types.ts'), 'utf8')
    const names = new Set<string>()
    for (const constant of ['FIELD_TYPES', 'FIELD_WIDGETS']) {
      const found = new RegExp(`export const ${constant}[^=]*=\\s*\\[([^\\]]*)\\]`, 's').exec(types)
      for (const match of (found?.[1] ?? '').matchAll(/'([^']+)'/g)) names.add(match[1] ?? '')
    }

    const schema = JSON.parse(
      readFileSync(join(repo, 'packages', 'spec', 'formancy.schema.json'), 'utf8'),
    ) as {
      $defs: Record<
        string,
        {
          oneOf?: Array<{ properties?: { kind?: { const?: string } } }>
          properties?: Record<string, unknown>
        }
      >
    }
    for (const branch of schema.$defs['layoutNode']?.oneOf ?? []) {
      const kind = branch.properties?.kind?.const
      if (kind !== undefined) names.add(kind)
    }
    for (const property of Object.keys(schema.$defs['logicRule']?.properties ?? {})) {
      names.add(property)
    }
    return names
  }

  const listed = (): string[] => {
    const text = readFileSync(declaration, 'utf8')
    const start = text.indexOf(UNIMPLEMENTED_HEADING)
    expect(start, `the declaration has no "${UNIMPLEMENTED_HEADING}" section`).toBeGreaterThan(-1)
    const rest = text.slice(start + UNIMPLEMENTED_HEADING.length)
    const next = /\n#{1,3} /.exec(rest)
    const section = next === null ? rest : rest.slice(0, next.index)
    // One backticked identifier per bullet, at its start: the name being reserved.
    return [...section.matchAll(/^- `([A-Za-z][A-Za-z0-9]*)`/gm)].map((match) => match[1] ?? '')
  }

  test('names nothing the format already knows', () => {
    const known = vocabulary()
    // A guard on the guard: an empty vocabulary or an empty list would pass forever.
    expect(known.size).toBeGreaterThan(15)
    expect(listed().length).toBeGreaterThan(0)

    expect(listed().filter((name) => known.has(name))).toEqual([])
  })
})
