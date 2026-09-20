<!-- Part of formancy: https://github.com/sharkysan/formancy.ai -->

# @formancy/expressions

CEL for formancy forms: parse, type-check, compile and evaluate, with the safety
policy that makes it safe to run author-written expressions on a server.

## Why CEL, and why wrapped

Conditional logic and computed values are written in the
[Common Expression Language](https://cel.dev) rather than a JavaScript subset.
CEL cannot loop, cannot recurse and has no user-defined functions — termination
is a property of the language, not of a sandbox somebody maintains. It is typed,
so errors surface when an author saves. And its syntax tree names exactly which
variables an expression reads, which is what lets the engine build a dependency
graph and reject a cyclic form before it ever runs.

The CEL implementation is wrapped, never re-exported: exactly one file imports
it. Swapping implementations is a one-file change rather than an ecosystem
migration.

## Two load-bearing decisions

**`referencedPaths` must never miss a dependency.** It is what the engine's
dependency graph is built from, so a missed read means a field that silently
stops recomputing. Comprehension iteration variables are scoped correctly,
dynamic indices are coarsened to the whole collection, and over-reporting is
preferred to under-reporting in every ambiguous case.

**Cost is metered deterministically, never by a clock.** Steps are charged for
data reads, comprehension iterations and the size of collections an expression
*produces*; values entering evaluation are bounded at the boundary. A wall-clock
budget would let a submission pass in a browser and fail its replay on a busy
server, which would break the one-engine guarantee.

Capabilities (`now`, `today`, `random`) arrive as frozen values. This package
structurally cannot read a clock.

## Use

```ts
import { compile, evaluate, captureCapabilities } from '@formancy/expressions'

const program = compile('country == "CH"', {
  kind: 'visible',
  variables: { country: 'dyn' },
})
if (!program.ok) throw new Error(program.error.message)

const outcome = evaluate(program.program, { country: 'CH' }, {
  capabilities: captureCapabilities({ now: Date.now, today: () => '2026-09-20', random: Math.random }),
})
```

Money is a `decimal` backed by scaled integers, and mixing it with plain numbers
is a check-time error with a hint naming the fix — `price * 0.19` is refused,
`price * dec("0.19")` is exact.

Docs: `apps/docs` (Concepts → Logic and expressions).
