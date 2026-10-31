# 0226 — A pattern is analysed as it runs, from the one definition of how it runs

- **Status:** accepted
- **Date:** 2026-10-30
- **Deciders:** Daniel Bacher
- **Verified by:**
  - **`packages/server-core/src/use-cases.test.ts`**, in *patterns that backtrack are refused at
    publish*:
    - *a pattern is analysed with the Unicode semantics the engine runs it with*: `(\p{L}+)+` is
      refused as exponential. It published before the change.
    - *a stored version whose pattern backtracks is refused when it is published again
      unchanged*: it failed when an unchanged document was answered as current before the
      analysis.
  - **`packages/spec/src/validate.test.ts`**, *a pattern is compiled when the form is saved, as
    the engine runs it*:
    - `a{` is refused, which failed when the validator compiled without `u`;
    - `a)|(b` is refused, which failed when it compiled the anchored expression.

## Context

[0045](0045-reject-backtracking-patterns.md) refuses at publish a `pattern` that `recheck` finds
can be made to backtrack, and analyses it anchored, "because that is how the engine runs them".

The engine runs a pattern with the `u` flag, and has since its first model validators. The
validator compiles it with `u` when a form is saved. The analysis ran without it. Without `u`,
`\p{L}` is the letter p followed by a brace, so `recheck` analysed another expression and rated
`(\p{L}+)+` and `(\p{L}|\p{Lu})+` linear. With `u` it rates both exponential. Measured on Node 22,
the engine took 98 ms to refuse 24 letters and a NUL against the first, and 392 ms for 26: four
times as long for every two letters more. Every release from `0.2.0` through `0.11.0` published
such a pattern, and anyone who could reach the form could then hold a server's CPU with one answer.

Three places spelled out one rule, and the one that drifted was the security check. CodeQL's
`js/regex-injection` alert 39, on the engine's `new RegExp`, pointed at the line. The alert itself
describes the feature: compiling an author's pattern is what `pattern` means.

## Decision

**`@formancy/spec` defines how a pattern runs**, in `pattern.ts`: `anchoredPattern` wraps it as
`^(?:…)$`, and `PATTERN_FLAGS` is `u`. The engine compiles `anchoredPattern(pattern)` with
`PATTERN_FLAGS`, and the server's analysis checks the same expression with the same flags.

**The validator compiles the pattern unwrapped, with the same flags.** Wrapped, `a)|(b` compiles
and means "starts with a, or ends with b". Refused on its own, it can never escape the anchors.

## Consequences

The analysis decides about the expression the engine runs, and a change to how a pattern runs is
made in one place that all three read.

**What it costs.**

- **A pattern that published before may now be refused**: one that backtracks only with Unicode
  semantics. The publish names its field and complexity, as any refusal under 0045 does.
- **A version already published is not analysed again until it is republished.** Nothing searches
  stored documents for one. The analysis runs before the server compares a document with the one it
  holds, so sending the same document again refuses it. The version stays current until a corrected
  one is published.

## Alternatives considered

- **Pass `'u'` to `recheck` where it is called.** It fixes this case, and keeps three spellings of
  one rule, which is how this one drifted.
- **Analyse every stored version when the server starts.** It would find what older releases
  published, at the cost of a `recheck` run per pattern on every start, and a refusal at start has
  no author to tell. Republishing finds the same patterns when somebody can act on them.
