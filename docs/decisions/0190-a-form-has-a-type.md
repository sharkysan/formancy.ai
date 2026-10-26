# 0190 — A form has a type, printed from the table the engine enforces

- **Status:** accepted
- **Date:** 2026-10-26
- **Deciders:** Daniel Bacher
- **Verified by:**
  - **`packages/cli/src/agreement.test.ts`.** For every field type, a group and a repeater,
    values the engine keeps are compiled — as `engine.value()` stores them — against the
    printed type with the TypeScript compiler, and must compile; values it refuses as `type`,
    `option` or `row` must not. Watched failing against a printer that wrote `boolean | string`
    for a checkbox and `string` for a number, naming each field. It found two defects before it
    passed: `SignatureAnswer` was not exported from `@formancy/spec`, so every printed type with
    a signature failed to compile, and a group's own value was checked by nothing (0189).
  - **`scripts/install-test.mjs`.** The packed `@formancy/cli` is installed into a plain npm
    project, its `formancy` bin prints the type of a fixture form, and `tsc` with
    `skipLibCheck` off compiles that type and a consumer of it against the installed
    `@formancy/spec`. Watched failing with `SignatureAnswer` taken out of the spec's exports.
  - **`packages/spec/src/answers-typescript.test.ts`** pins what the printer writes, and
    **`packages/cli/src/cli.test.ts`** the command — the same text as the function, the exit
    codes, and a document that is not a form refused with its errors. All twelve of the
    command's cases failed against a `run` that did nothing.
  - **`apps/docs/src/typed-submissions-page.test.ts`.** The page's example type is what the
    printer prints for the page's example form, hash included.

## Context

A form's submissions reached an integrator's code as `unknown` — `onSubmit` in both
renderers, a webhook's body, the submissions API — and the roadmap said, for months, that a
command emitted a real type per form. No such command existed
(`apps/docs/src/package-references.test.ts` now catches that kind of claim). The roadmap also
said what would make it go: the type derived from a form's model by a function in
`@formancy/spec`, so a build script and a command get one answer.

The obstacle was not the printer. A type is only worth having if it is true of stored data,
and the engine did not check an answer's shape unless a constraint read it, so a type printed
from the documented shapes would have been wrong for every unconstrained field. 0189 fixed
that first: `ANSWER_KINDS` states each type's answer as data, and the engine refuses another
shape.

## Decision

**`answersTypeScript(schema)` in `@formancy/spec` prints the type from `ANSWER_KINDS`; the
`formancy types` command in a new `@formancy/cli` package is that function and a file
write.** The command validates the document first and refuses one that is not a form, with
its errors, rather than printing a type for submissions nobody can make.

- **Every key is optional.** An unanswered field has no key, a rule may hide any field and
  take its answer with it, and `required` promises an answer only for a field shown on the
  replay. Narrowing a required field to present would be a second copy of the engine's
  hiding logic — visibility rules, skipped pages, clearing — in the printer.
- **`null` exactly where `ANSWER_KINDS` says it is unanswered**, a choice as a union of its
  options' values, a matrix as its rows mapped to those values, a group nested, a page
  transparent, a row with `_id`, and nothing for a field that collects nothing.
- **`StoredFile` and `SignatureAnswer` are imported from `@formancy/spec`**, not spelled out,
  so the printed type cannot describe a file or a signature differently from the format.
- **The header names the form, its spec version and its schema hash**, because a type
  describes one version: a submission bound to another holds that version's answers.

## Consequences

**The type is wider than the data in one place, deliberately.** A type has no spelling for
"a non-empty string", so `''` for a date, a time or a choice with no listed options compiles
although the engine refuses it. The agreement test pins that gap rather than tolerating it,
so it fails the day the gap closes and the sentence describing it stops being true.

**The renderers still hand the data over as `unknown`.** A generic parameter on
`SubmitOutcome` would let an integrator write the cast without seeing it; as it is, applying
the type is a visible statement about data the engine has just checked.

**One more published package and one more bin**, with a SOUP row of its own and nothing
outside the project at runtime. It reads a file today; fetching a published version from a
running server by path and version is the follow-up, and needs credentials the command does
not take yet.

## Alternatives considered

**A type computed by TypeScript itself** — `Answers<typeof schema>` over an `as const`
document. No generated file, and only for forms that live in source: a form authored in the
admin and published lives on the server. It would also be a second implementation of every
answer shape, in the type system, that nothing compares with the engine.

**Narrow a required field to present** when no rule can hide it. More convenient, and it
re-derives the engine's visibility from the document statically; the day the two disagree, a
type says a field is present on submissions where it is absent.

**JSON Schema for the submission data instead of TypeScript.** Useful to more languages, and
not what was promised or asked for. The table makes it a second printer whenever it is wanted.
