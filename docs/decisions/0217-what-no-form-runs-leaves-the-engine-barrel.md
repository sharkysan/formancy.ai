# 0217 — What only an author's tools run leaves the engine's barrel, for `@formancy/core/authoring`

- **Status:** accepted
- **Date:** 2026-10-29
- **Deciders:** Daniel Bacher
- **Builds on:** [0206](0206-a-forms-responses-are-summarised-by-question.md), whose summary of
  responses is an entry no form loads, and
  [0208](0208-the-published-javascript-carries-no-jsdoc.md), which made core's 18 kB budget a gate
- **Verified by:**
  - **`packages/core/src/authoring.test.ts`**: `expressionProblems`,
    `MIXED_NUMERIC_LITERAL_EXAMPLE`, `runScenarios` and `unknownReferences` are not in the
    engine's barrel, and are in `@formancy/core/authoring`. The first case failed while the
    barrel still exported them.
  - **`apps/docs/src/bundles.test.ts`**: the barrel and every chunk it imports measure within a
    tenth of §9.3's 16.1 kB, and hold the 18 kB budget.
  - **`pnpm test:e2e:install`**, whose consumer imports `expressionProblems` and
    `unknownReferences` from the installed tarball's `@formancy/core/authoring`, through its
    exports map.

## Context

Every form loads `@formancy/core`: both renderers import the engine from it. Since 0208 its barrel
is held to 18 kB. On 2026-10-29, once a computed field was drawn as its answer in words (0216),
it measured 17.97 kB. So almost any change to the engine would have failed the gate.

Three of its exports are tools an author runs before anybody fills a form in, and no form calls
any of them:

- **`expressionProblems`** checks a document's expressions for a builder or a publish.
- **`unknownReferences`** finds paths the rules read that no field provides, for a publish's
  warnings (0097).
- **`runScenarios`** runs a document against its written-down examples (0110), for the scenario
  pane, the MCP server and a publish.

Measured without them, the barrel was 15.32 kB.

A second entry was tried for `runScenarios` once before and reverted. The guard then measured
`index.mjs` alone, which a code-split build makes a file of re-exports, so it would have reported
an improvement that was only accounting (§9.3). The guard now measures the barrel's whole import
closure, so a split can show nothing it does not take out.

## Decision

**`@formancy/core/authoring`** is a fourth entry of the package. It exports `expressionProblems`
and `MIXED_NUMERIC_LITERAL_EXAMPLE`, `runScenarios` with `Scenario` and its result types, and
`unknownReferences` with `UnknownReference`. The barrel exports none of them. Every consumer in
the repository imports them from the new entry: both builders, the builders' core, the MCP
server, the server's publish and examples, the admin, the playground, the site and the install
fixture.

The engine stays in the barrel. `runScenarios` runs it, so the build puts the engine in a chunk
both entries import. The barrel's closure, that chunk included, measures **16.06 kB**, where it
measured 17.97 kB.

## Consequences

The engine has about two kilobytes of room under its gate again, and a form's download no longer
carries an author's tools.

**What it costs.**

- **A breaking change for a host that imported these from `@formancy/core`.** It must import them
  from `@formancy/core/authoring`, types included, and [`MIGRATIONS.md`](../../MIGRATIONS.md)
  says so. Pre-1.0, that makes the next release a minor one.
- **The split costs 0.74 kB.** The barrel measures 16.06 kB, against 15.32 kB with these exports
  simply gone: what a code-split chunk adds in imports and exports.
- **One more entry for the package checks** — `publint`, `@arethetypeswrong/cli` and the install
  gate — to hold to its exports map.

**What it does not do.** A host whose bundler tree-shakes paid for none of this before either: the
package declares `sideEffects: false`. The gate measures the barrel, not what a bundler keeps, and
the barrel is what a host without tree-shaking, or a CDN import, loads.

## Alternatives considered

- **Raise the budget.** It was set before the gate held it, and a threshold moved to pass is the
  guard written green that §9.3 refuses.
- **Keep the types in the barrel as well.** Types cost nothing at runtime, but `Scenario` in one
  entry and `runScenarios` in another splits one API over two import paths.
