# 0119 — A sentence in builder-core comes from the catalogue, and the compiler is asked

- **Status:** accepted
- **Date:** 2026-10-09
- **Deciders:** Daniel Bacher
- **Verified by:** `apps/docs/src/builder-sentences.test.ts` — every string and template in
  `packages/builder-core/src`, read through the TypeScript compiler's syntax tree, and none
  that reads as a sentence outside the catalogue, the model instructions and a thrown
  `Error`. It failed first with seven: four refusals in `session.ts`, the two halves of a
  clause in `repath.ts`, and a thrown invariant in `conditions.ts` — the last is what the
  `Error` exemption is for. Proved by writing an English refusal back into
  `translation.ts` and an English clause into `repath.ts`. `packages/builder-core/src/language.test.ts`
  reaches each of the refusals in German through its command.

## Context

[0114](0114-the-builder-speaks-the-authors-language.md) moved the builder's words into a
catalogue, and the change that did it said it had moved "every refusal a session issues".
It had not. Four refusals in `session.ts` were still English — removing the default
language, extracting a property that is not text, and two about layout settings — and
`repath.ts` built an English clause, "rule 1 (visible on "note") cannot follow the change",
that was set into a German refusal. A German author renaming a field read half a sentence
in each language.

A refusal is the sentence a person most needs to understand, and only appears when
something is refused. The catalogue's tests check the catalogue; the language tests check
the paths somebody thought to write a case for. Neither could see a refusal nobody had
listed.

## Decision

**Ask the compiler, not a pattern.** A test parses every source file in
`packages/builder-core/src` with the TypeScript compiler and looks at each string literal
and each template's literal parts. One that reads as a sentence — three words in a row —
is a sentence written into code, and is named with its file and line.

**Three exemptions, each derived from what the code is rather than what it says:** the
two catalogue files; `authoring.ts`, whose sentences are instructions to a model, asked in
English whatever the author speaks because that is what its answers are checked against —
including the problems it tells the model, which the prompt pane also shows the author
**as they were told**, so a person reads exactly what the model was asked to fix, in
English; and any literal that is the argument of `new Error(...)`, which is for a caller who broke an
invariant no correct caller reaches, and which the builders never show.

The guard lives in `apps/docs/src` beside the other source checks, because
`@formancy/builder-core` has no Node types — on purpose
([0008](0008-layered-packages.md)) — and reading files is a Node thing to do.

The refusals it found are in the catalogue now, in English and German, and `repathRules`
takes the session's language. The translation commands left `session.ts` for
`translation.ts`: the file stood exactly at its size ceiling and the fix needed a line,
and translation is the seam that ceiling's own note names.

*Amended 2026-10-09, with French:* the catalogues are no longer listed by file name.
A catalogue is found by what it is — a file whose exported constant `satisfies` a record
of messages, read off the syntax tree — so the third language was exempt without being
added to a list, and the fourth will be too.

## Consequences

**A new refusal written as a literal fails the build**, wherever in the package it is
written — not only where somebody wrote a test that reaches it.

**"Three words in a row" is a heuristic, and it errs towards noise.** A long identifier
with spaces, or a CSS value, would be named and would have to be rewritten or argued with.
None exists today; the first one is a conversation about whether it is a sentence.

**Messages from other packages pass through untouched**: a validator's error from
`@formancy/spec`, a parser's from `@formancy/expressions`, an engine's scenario failure.
They are set into catalogue sentences as values — the clause a rule cannot follow ends
with the parser's own reason — and translating them is their package's question.

## Alternatives considered

**A regular expression over the source.** It knows one spelling of a string: quotes,
backticks, a template with an expression in it, a string split across lines. The compiler
knows all of them, and is already a dependency of every package here.

**Exercise every refusal in a pseudo-language.** Only the refusals somebody lists — which
is how the four were missed.
