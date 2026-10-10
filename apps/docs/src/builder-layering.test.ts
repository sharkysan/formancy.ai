import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * The builder's core is framework-free, and stays that way.
 *
 * Seven modules — the condition compiler, the two drop models, the two tree
 * flatteners, the palette, and the property list read out of the spec's own JSON
 * Schema — lived in `@formancy/builder-react` because it was the only builder
 * there was. None of them mentioned React. A second builder is what made that
 * expensive rather than merely untidy: an Angular one would either import from
 * the React package, dragging React into an Angular application's dependency
 * closure, or copy them — two compilers turning a condition into CEL, and two
 * answers to where a drop lands.
 *
 * This is [0008](../../../docs/decisions/0008-layered-packages.md)'s rule applied
 * one layer up. The renderers have it enforced by the absence of `@types/node`,
 * which turns a Node import into a compile error. There is no equivalent trick
 * for React — importing it would simply work — so the rule is held here, and it
 * is held against the SOURCE rather than against a manifest, because a transitive
 * import compiles just as well as a declared one.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')

const sourcesOf = (pkg: string): Array<{ name: string; text: string }> => {
  const directory = join(repo, 'packages', pkg, 'src')
  return readdirSync(directory)
    .filter((name) => name.endsWith('.ts') || name.endsWith('.tsx'))
    .map((name) => ({ name, text: readFileSync(join(directory, name), 'utf8') }))
}

/** Every module specifier a file imports from, comments excluded. */
const importsOf = (text: string): string[] => {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  return [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1] ?? '')
}

describe('what the builder core may import', () => {
  test('is reading the package at all', () => {
    // A guard on the guard: an empty listing would make every assertion vacuous,
    // and the ones below are all absence.
    const sources = sourcesOf('builder-core')
    expect(sources.length).toBeGreaterThan(10)
    expect(sources.some(({ name }) => name === 'conditions.ts')).toBe(true)
  })

  test('is not React, in any file, however it is spelled', () => {
    const offenders = sourcesOf('builder-core')
      .filter(({ text }) =>
        importsOf(text).some((specifier) => /^react(-dom)?($|\/)|^@formancy\/(react|builder-react)$/.test(specifier)),
      )
      .map(({ name }) => name)

    expect(offenders).toEqual([])
  })

  test('and is not Angular either, which is the same rule seen from the other side', () => {
    // Said explicitly rather than left implied by the React case. The point of
    // moving these was that a builder core belongs to neither framework, and a
    // rule written only against the one that happened to be there first is a rule
    // that permits the second.
    const offenders = sourcesOf('builder-core')
      .filter(({ text }) =>
        importsOf(text).some((specifier) => /^@angular\/|^@formancy\/(angular|builder-angular)$/.test(specifier)),
      )
      .map(({ name }) => name)

    expect(offenders).toEqual([])
  })

  test('and the manifest agrees, so a dependency cannot arrive ahead of an import', () => {
    const manifest = JSON.parse(
      readFileSync(join(repo, 'packages', 'builder-core', 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> }
    const declared = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ]

    expect(declared.filter((name) => /react|angular/.test(name))).toEqual([])
  })

  test('the modules that moved are exported from it, or nothing gained by moving', () => {
    // The other half. Moved and not exported, they would be unreachable from a
    // second builder — which is the entire reason they moved.
    const barrel = readFileSync(join(repo, 'packages', 'builder-core', 'src', 'index.ts'), 'utf8')
    for (const name of [
      'compileCondition',
      'dropLocation',
      'layoutDropLocation',
      'flatten',
      'flattenLayout',
      'paletteEntries',
      'editablePropertiesFor',
    ]) {
      expect(barrel, `${name} is not exported`).toContain(name)
    }
  })
})

/**
 * What each builder offers, derived from its barrel.
 *
 * The README said *"the Angular package carries the structure tree today; the
 * arrangement tree, the property panel, the condition editor and the
 * translations pane are React-only"*. Every clause of that was true when it was
 * written and false by the time anybody read it: all four shipped, over four
 * releases, and the sentence changed in none of them.
 *
 * So the pairing is read off the two barrels instead. A pane that exists in one
 * builder and not the other has to be named here, with the reason, and the day
 * it is built the list fails until the name comes out.
 */
describe('what the two builders each offer', () => {
  /** The exported component names of one builder package. */
  const componentsOf = (pkg: string): Set<string> => {
    const barrel = readFileSync(join(repo, 'packages', pkg, 'src', 'index.ts'), 'utf8')
    const names = new Set<string>()
    for (const match of barrel.matchAll(/^export \{ ([^}]+) \}/gm)) {
      for (const name of match[1]!.split(',')) {
        const clean = name.trim().split(/\s+as\s+/)[0]!.trim()
        // Components only: a hook, a helper and a type are not panes.
        if (/^(Formancy|[A-Z])/.test(clean) && !/^(use|inject)/.test(clean)) names.add(clean)
      }
    }
    return names
  }

  /**
   * One pane, under the two names its builders give it.
   *
   * The spellings differ because Angular components are matched by selector and
   * carry a prefix, which is why this cannot be a set comparison.
   */
  const PANES: ReadonlyArray<{ pane: string; react: string; angular: string }> = [
    { pane: 'the whole builder', react: 'FormancyBuilder', angular: 'FormancyBuilder' },
    { pane: 'the arrangement tree', react: 'FormancyLayoutPane', angular: 'FormancyLayoutPane' },
    { pane: 'the property panel', react: 'PropertyPanel', angular: 'FormancyPropertyPanel' },
    { pane: 'the options of a select', react: 'OptionsEditor', angular: 'FormancyOptionsEditor' },
    {
      pane: 'the layout property panel',
      react: 'LayoutPropertyPanel',
      angular: 'FormancyLayoutPropertyPanel',
    },
    { pane: 'the condition editor', react: 'LogicPanel', angular: 'FormancyLogicPanel' },
    { pane: 'the translations pane', react: 'TranslationsPane', angular: 'FormancyTranslationsPane' },
    {
      // A model asked for what a language is missing, and its answer reviewed message by
      // message. Both from the start: what is asked, kept and marked is builder-core's, and
      // the translations pane draws it in either builder
      // ([0161](../../../docs/decisions/0161-a-model-translates-only-what-is-missing.md)).
      pane: 'a model’s translation, under review',
      react: 'TranslationReview',
      angular: 'FormancyTranslationReview',
    },
    {
      pane: 'arranging on the rendered form',
      react: 'FormancyArrangeSurface',
      angular: 'FormancyArrangeSurface',
    },
    {
      // Was React-only, and this list said so. Angular got it when the pane
      // grew a review step and the two had to agree about what reviewing is
      // ([0109](../../../docs/decisions/0109-an-ai-edit-is-reviewed-before-it-lands.md)).
      pane: 'describing a form in words',
      react: 'PromptPane',
      angular: 'FormancyPromptPane',
    },
    {
      // A model's turn carried by a person, for a host whose page may not call one. Both
      // from the start: when a paste counts is `createRelay`'s, and a turn asked from
      // either builder's prompt pane has to be carried in that builder
      // ([0160](../../../docs/decisions/0160-a-person-carries-the-models-turn.md)).
      pane: 'carrying a model’s turn by hand',
      react: 'RelayPane',
      angular: 'FormancyRelayPane',
    },
    {
      // What the form is supposed to do, rerun after every edit. Both from
      // the start, because what counts as a regression is one decision
      // ([0111](../../../docs/decisions/0111-a-scenario-panel-names-what-stopped-holding.md)).
      pane: 'checking a form against examples',
      react: 'ScenarioPane',
      angular: 'FormancyScenarioPane',
    },
    {
      // Every rule, and why a field is hidden now. What it says is builder-core's,
      // so the two cannot explain the same rule differently
      // ([0128](../../../docs/decisions/0128-a-form-says-why-a-field-is-hidden.md)).
      pane: 'every rule in the form',
      react: 'RulesOverview',
      angular: 'FormancyRulesOverview',
    },
  ]

  /**
   * Exported by one builder and not the other, on purpose.
   *
   * Empty is not the goal: a pane one framework has and the other does not is a
   * real state, and naming it here with the reason is how it stays a decision
   * rather than an oversight. Two of the three are not panes at all — they are
   * parts React keeps internal and Angular has to export, because a template
   * refers to a component by selector and cannot reach an unexported one.
   */
  const ONE_SIDED: ReadonlyArray<{ name: string; side: 'react' | 'angular'; why: string }> = [
    {
      name: 'FormancyProperty',
      side: 'angular',
      why: 'One row of the property panel. React composes it inline; an Angular template has to name a component, so it is exported.',
    },
    {
      name: 'FormancyColumnsEditor',
      side: 'angular',
      why: "A datagrid's columns, for the same reason: the property panel's template refers to it by selector.",
    },
  ]

  test('is read off both barrels, which is a guard on this guard', () => {
    // Every assertion below is a comparison, and two empty sets compare equal.
    expect(componentsOf('builder-react').size).toBeGreaterThan(5)
    expect(componentsOf('builder-angular').size).toBeGreaterThan(5)
  })

  test('pairs every pane across the two, or names it as one-sided', () => {
    const react = componentsOf('builder-react')
    const angular = componentsOf('builder-angular')

    const missing: string[] = []
    for (const { pane, react: there, angular: here } of PANES) {
      if (!react.has(there)) missing.push(`${pane}: builder-react no longer exports ${there}`)
      if (!angular.has(here)) missing.push(`${pane}: builder-angular does not export ${here}`)
    }

    expect(missing).toEqual([])
  })

  test('and accounts for everything either one exports alone', () => {
    const paired = new Set(PANES.flatMap(({ react: a, angular: b }) => [a, b]))
    const excused = new Set(ONE_SIDED.map(({ name }) => name))
    const unaccounted = (['react', 'angular'] as const).flatMap((side) =>
      [...componentsOf(`builder-${side}`)].filter(
        (name) => !paired.has(name) && !excused.has(name),
      ),
    )

    // Anything added to one builder shows up here until it is either paired or
    // excused with a reason, which is the drift the README sentence had.
    expect(unaccounted.sort()).toEqual([])
  })

  test('and every excuse is on the side that claims it', () => {
    // So the list cannot rot in the other direction: a pane written for the
    // second framework stays excused forever unless something checks.
    const wrong = ONE_SIDED.filter(({ name, side }) => {
      const other = side === 'react' ? 'angular' : 'react'
      return componentsOf(`builder-${other}`).has(name)
    }).map(({ name, side }) => `${name} is excused as ${side}-only and exists in both`)

    expect(wrong).toEqual([])
  })

  test('and the README singles out a pane as React-only exactly when one is', () => {
    /*
     * Both directions, derived from the list above rather than from the name
     * of the pane that used to be one.
     *
     * This guard was written when the prompt pane was React-only, and it said
     * so twice — once in a regular expression and once in an assertion naming
     * `PromptPane`. Then Angular got the pane, and what should have been a
     * sentence to delete was a guard insisting the sentence stay. A guard that
     * encodes today's answer rather than today's *question* has to be edited
     * every time the answer moves, which is the moment somebody edits it
     * wrongly.
     */
    const readme = readFileSync(join(repo, 'README.md'), 'utf8')
    const singledOut = /The (.+?) — [^—]*? — is React-only\./.exec(readme)
    const reactOnly = ONE_SIDED.filter(({ side }) => side === 'react')

    if (reactOnly.length === 0) {
      expect(
        singledOut?.[1],
        'the README calls a pane React-only and the barrels say none is',
      ).toBeUndefined()
      return
    }

    expect(singledOut, 'a pane is React-only and the README no longer says which').not.toBeNull()
  })
})
