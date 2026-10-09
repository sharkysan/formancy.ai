# Working in this repository

## Every change keeps the documentation true

A change is not done until the documents that describe it say so. Update them
in the same pull request as the code, not in a follow-up:

- **User documentation** — `README.md` and `apps/docs` when behaviour, an API,
  a package or a command changes.
- **`CHANGELOG.md`** — a line under *Unreleased* for anything a user or
  integrator would notice, with the reason attached, not only the what.
- **`MIGRATIONS.md`** — when the spec version moves or stored data needs
  converting.
- **Decision records** (`docs/decisions/`) — a new record for every decision
  someone could helpfully undo, in the format `docs/decisions/README.md`
  describes: next free number, the cost paragraph, the alternatives, and a
  **Verified by** line naming the test or gate that fails if it is violated.
  Add it to the index in that README. A decision that changes an old one marks
  the old record `superseded by NNNN` or `reversed` rather than editing it
  away.
- **Architecture** (`docs/architecture/`, arc42) — the section the change
  touches: building blocks for a new package or module, the runtime view for a
  new flow, cross-cutting concepts, quality requirements, verification, and
  risks and debt for anything accepted rather than fixed.
- **Regulatory** (`docs/regulatory/`) — whenever a change affects what the
  software does wrong, how it is verified or what it depends on:
  - `SAFETY-ANALYSIS.md` for a new failure mode, or a new constraint or test
    against an existing one.
  - `SOUP-DECLARATION.md` for a new or changed runtime dependency, required
    environment, or known anomaly. The composition table is checked against the
    manifests by `apps/docs/src/soup.test.ts`, so a new dependency fails a test
    until the table names it at the range the manifest asks for.
  - `LIFECYCLE.md` when the way work is done or verified changes (a new CI
    gate, a new kind of test).
  - `MDR-CONTEXT.md` only if the scope of what this set claims changes.

The regulatory set is not decoration and not marketing. It exists for a
manufacturer incorporating formancy under IEC 62304, who builds their own
assessment on what it says. **A wrong statement there is worse than an absent
one**: an absent one prompts the question, a wrong one answers it incorrectly.
That cuts both ways — a document still listing something as unimplemented after
it ships is wrong too, because a characterisation describes one version and no
other.

Keep the voice of the existing documents: say what it costs and what it does
not do, and never claim more than a test shows.

## A claim in prose is backed by something that fails

Documentation drifts silently, because prose does not break. So where a document
states a fact about the repository, something fails when it stops being true,
and the document says what.

Three shapes, in order of preference —
[0060](docs/decisions/0060-documentation-is-checked.md) has the argument:

1. **Derive it.** `apps/site/decision-records.ts` counts the directory when the
   site is built, so the landing page's figure cannot be stale.
2. **Check it.** `apps/docs/src/soup.test.ts` parses the SOUP composition table
   and compares it to the manifests; `packages/server/src/dockerfile.test.ts`
   derives the image's COPY list from the server's dependency closure. This is
   the right shape when the prose around the fact is worth writing by hand —
   which, in a regulatory document, it is.
3. **Measure it.** See below.

Counts written into prose go stale: the README once said "Forty-eight decision
records" when there were sixty. **Prefer wording without a number.** Where a
number is the point, derive it at build time rather than typing it; where
neither is possible, date it and say it is re-measured rather than incremented.

**When you write a guard, make it fail first.** Revert the thing it guards,
watch it fail, put it back. A test that has never failed has not been shown to
test anything — the repository's ordinary test-first rule
([`LIFECYCLE.md`](docs/regulatory/LIFECYCLE.md)) — and guards are the tests most
likely to be written green and to stay that way for the wrong reason.

Watching it fail once is necessary and not sufficient. Both of these have happened
here:

- **A guard that passes for the wrong reason.** A documentation check matched the
  prose for a phrase like "not released". Reverting the fix left that phrase
  elsewhere in the paragraph, so it passed — green, and asserting nothing.
  **Derive the fact from the code or the data, never from wording.**
- **A guard that cannot run where it matters.** The documentation link check sat for
  weeks in a script no workflow ran, so it fired on the hosting provider after merge
  instead of on the pull request before it. **A guard that is not a gate is a
  comment.** Equally, a check needing git tags or the network answers differently in
  CI than locally, because `actions/checkout` fetches neither — also not a gate, and
  there the honest move is prose with a date rather than a test that lies.

## Measure before you write a number

Numbers here are measured, not estimated. The proof-of-work challenge was
documented at "around a tenth of a second" for 100,000 hashes; measured, it was
3,408 ms. The wrong number was not a typo — it was hiding a design error, that
`crypto.subtle` made the *defender* pay about 18× what an attacker pays
([0059](docs/decisions/0059-proof-of-work-not-a-captcha.md)). Nobody would have
found that by proofreading the sentence.

## Branch names

Name a branch after what it changes, with a prefix for the kind of change:
`feat/proof-of-work`, `fix/admin-test-timeout`, `docs/readme-showcase`. Not a
generated name: the branch is what a reviewer sees first in the pull request
list.

## Branch from `main`, and target `main`

Stacked pull requests whose base was already merged have silently stranded work
three times. Branch from `main`, target `main`, and where a branch replaces
another say "supersedes #N" in the description rather than stacking on it.
Before pushing to a branch you have been away from, check that its pull request
is still open — a commit pushed onto an already-merged branch goes nowhere.

**Commit as `Daniel Bacher <dbacher@gmail.com>`**, never
`daniel.bacher@ergon.ch`.

**No tool attribution.** No "Generated with Claude Code" line or session link in
pull request descriptions, and no `Co-Authored-By: Claude` or `Claude-Session`
trailers in commits. The author is the person above.

## Tests, and what the bar actually is

**Coverage is reported, not gated.** There is no threshold in
`vitest.coverage.ts` and none is wanted: a percentage is a number somebody can
raise without raising confidence, and the exclusions in that file — barrels,
composition roots, generated code — exist so the figure means something rather
than so it looks good. The bar is not a number. It is this:

- **New behaviour arrives with a test that fails without it.** Test-first, and the
  failure observed — [`LIFECYCLE.md`](docs/regulatory/LIFECYCLE.md) is the rule,
  this is the reminder.
- **Every case says which failure it prevents**, in a comment, in the same voice as
  the code. "tests the happy path" is not that; "a rule that errors fails open and
  shows the field it was meant to hide" is.
- **A code path no test reaches is a claim nobody checked.** If it is hard to
  reach, that is usually the design saying something — listen to it before
  reaching for a mock.
- Run `pnpm test:coverage` for what you changed and read the report. A file whose
  number dropped is the question, not the failure.

### When the test is wrong and the code is right

It happens often enough to expect it. Seven times here the defect was the guard's own
regular expression, not the thing it guarded. `[A-Z_]+` stopped at the digit in
`FORMANCY_S3_BUCKET` and collapsed five variable names into one meaningless match.
Most recently a check on which published packages anybody imports matched only
`from '<name>'`, and reported `@formancy/themes` as consumed by nothing — a theme is
consumed for its *effect*, `import '@formancy/themes/blueprint.css'`, which has no
`from` in it at all.

**Match the whole property, not the shape it usually has**, and when a test disagrees
with the code, work out which is wrong before changing either. Both of those were the
pattern knowing one spelling of a thing that has several.

## The code reads as though a senior wrote both halves

The standard is not "it works". It is that somebody who knows the patterns — a
senior front-end engineer reading the renderers and the builders, a senior
back-end engineer reading the server and the engine — recognises the shape
immediately and finds nothing to explain away.

**Idiomatic for the thing it is written in**, not a translation of another
framework's habits. React is `useSyncExternalStore` against a snapshot whose
identity is stable, not a `useEffect` that copies state into state. Angular is
signals, zoneless and `OnPush`, never `ChangeDetectorRef` and never a `Subject`
standing in for a value. The server is ports and adapters: a use-case takes
storage, not a connection. A file that reads as though it were ported from the
other framework is a file to rewrite, even when it passes.

**A pattern is chosen for a force it resolves, and the comment names the
force.** A factory because construction has a precondition worth enforcing once;
a strategy because the deployment supplies the behaviour and the document only
names it; a port because the thing behind it is genuinely swappable and there is
a second implementation or a test double that proves it. A pattern applied
because it has a name costs every later reader the price of working out which
force it was for, and finding there wasn't one. **The cargo-cult version of this
rule is worse than the rule's absence**, so: no interface with one implementation
and no second one planned, no layer that only forwards, no event bus where a
function call would do, no abstract base class for two concrete cases.

**Duplication is cheaper than the wrong abstraction, and both are cheaper than a
silent divergence.** Two renderers implementing one control by hand is
deliberate ([0033](docs/decisions/0033-one-suite-n-drivers.md)); two
implementations of the *same decision* is the thing this project exists to
prevent, which is why the condition compiler, the destination list and the
property list live in a core both builders read
([0091](docs/decisions/0091-a-second-builder-is-a-binding.md)). The question is
never "is this repeated" but **"if these two ever disagree, would anybody find
out?"**

### Size is a signal, and there is a gate on it

A long file is not automatically wrong — `engine.ts` is one subject, its parts
coupled through the graph. What is wrong is a file that has become the place things go. So
there is a budget, and `apps/docs/src/size.test.ts` enforces it:

- **600 lines** for a source file, tests excluded.
- Anything over it is in that test's allow-list **with its current size as its
  ceiling**, so it cannot grow — and when it shrinks past its ceiling the test
  fails too, forcing the number down rather than letting a stale entry sit there
  granting room nobody needs. The list is meant to empty.
- A new file over the budget does not get added to the list. Split it.

Split by **the reason to change**, never by line count. Three 600-line files that
must be edited together are worse than the 1,800-line file they came from,
because now the reader has to find all three. The seams that have worked here:
one control per file in a renderer, one concern's commands per file in a session,
one route family per plugin on the server.

The same applies below the file: a function past about 60 lines, a component
doing two jobs, a `switch` growing a case per feature, a class whose name needs
"and" to describe it. Each is a signal to look, not a verdict.

## A new feature is demonstrated, not only documented

Prose that says a feature exists and a build where nobody can see it working are two
different claims, and the second is the one an evaluator checks. So:

- **The playground shows it.** `apps/playground/src/starter.ts` is the schema somebody
  opens to find out what this does. A field type, a widget, a layout kind or a bound
  belongs in it — with the property set to something that actually demonstrates the
  behaviour rather than merely present. A `time` field with no `earliest` shows a
  control; one with a bound shows what a bound does.
- **The site shows it when it changes the argument.** `apps/site` is the landing page,
  and it makes a case rather than listing features. Something that strengthens or
  weakens that case belongs there; a fourth field type does not. When it is a number,
  derive it — `apps/site/decision-records.ts` counts both the decision records and the
  field types at build time, because both literals went stale.
- **The docs describe it**, under the rules above — and remember that the spec
  reference is generated, so the prose belongs in the JSON Schema's own `title` and
  `description`.

`apps/playground/src/starter.test.ts` enforces the first of these. The demo must use
every field type the spec defines, minus the two that nest, **and every widget** — or
name the widget in a short list saying why not, which is how a control that does not
exist yet is handled. Putting a widget in the demo before its control is built would be
worse than leaving it out: the document validates, the renderer falls back to the
default control, and a visitor cannot tell which they are looking at. That is the
documented-but-inert failure this repository has already shipped once.

## Some files are generated, and editing them is silently undone

Prose written into a generated file survives until the next build. It has happened:
a hand-written table in the spec reference was overwritten, and the change looked
merged.

- **`apps/docs/src/content/docs/reference/spec.md`** — generated from
  `packages/spec/formancy.schema.json` by `apps/docs/scripts/generate-spec-reference.mjs`.
  The durable place for that prose is the schema's own `title` and `description`,
  which is also where the builder's property panel reads it from. Two readers, one
  source.
- **`packages/spec/src/generated/document-validator.js`** — compiled from the schema
  by `packages/spec/scripts/generate-validator.mjs`, because ajv compiling at runtime
  needs code generation and the product documents a strict CSP. Run it after every
  schema change; `csp.test.ts` fails on a stale stamp.

If a generated page cannot express something, teach the generator — and make it
**throw** on input it has no vocabulary for rather than emit something malformed. A
block gated on a widget rather than a field type published an empty heading for
exactly that reason.

## Checks before pushing

CI runs `pnpm build`, `pnpm build:web`, `pnpm typecheck`, `pnpm test:coverage`,
`pnpm check:pkg`, `pnpm test:e2e:install` and `pnpm test:browser`. Run the ones
for the packages you changed.

`build:web` is not redundant with `build`: it composes the landing page, the
playground and the docs under one origin, and it carries the check for
root-absolute documentation links, which resolve against the landing page rather
than `/docs/`, build cleanly and 404 in production.

The server's integration tests need Docker and run in CI — real PostgreSQL, and
real Garage for the object store.

`test:e2e:install` is the only gate that looks at the packages from outside. It
packs them, installs the tarballs into a plain npm project, type-checks it with
`skipLibCheck` **off**, runs it and bundles it — because every other gate
resolves a package through a symlink to its source, so an `exports` map that is
wrong for a consumer can be right for the whole suite. It takes about twenty
seconds and needs `pnpm build` first. Its fixture is real files under
`scripts/install-fixture/`, not strings in the runner: generating TypeScript
inside a template literal inside a script cost two broken attempts before it ran
once.

`test:browser` is the only gate that uses a real browser, and the only one that
can see CSS. jsdom applies none, resolves no media queries and performs no
layout — every box measures zero — so an inline style shadowing a media query and
a `touch-action` that lived only in a theme both shipped through every other gate
in one week. It loads the composed site after `pnpm build:web`, at four
viewports, and asks Chromium for computed values and geometry. **Not
screenshots**: the renderers ship no styling, so a pixel baseline would be
testing demo CSS, and a baseline is a file somebody updates when it goes red
([0102](docs/decisions/0102-what-jsdom-cannot-see-is-checked-in-a-browser.md)).
It needs the Chromium download once: `pnpm exec playwright install chromium`.

## Conventions that live elsewhere

Do not restate these here; go and read them.

- **Test-first, failure observed**, and the verification gates —
  [`LIFECYCLE.md`](docs/regulatory/LIFECYCLE.md). What that means in practice is
  above, under *Tests*.
- **Layering: what may import what**, and why the isomorphic packages have no
  `@types/node`, so a Node import in `core` is a compile error rather than a
  review finding — [0008](docs/decisions/0008-layered-packages.md).
- **One suite, N drivers**, and why element lookup is restricted to role and
  accessible name — [0033](docs/decisions/0033-one-suite-n-drivers.md) and
  [0034](docs/decisions/0034-accessible-name-only.md).
- **TypeScript is pinned to `~6.0.3`** because Angular 22 requires
  `>=6.0 <6.1`; it lives in the workspace catalog once, with the reason beside
  it — [0039](docs/decisions/0039-pin-typescript.md). `latest` is 7.x and
  Angular rejects it.
- **The spec version is a reader contract.** Version 1 is frozen; version 2 is
  a superset that removes nothing, and a version-1 reader failing on a
  version-2 document must stay a validation error rather than a silent one
  ([0051](docs/decisions/0051-spec-2-adds-types.md)). Published form versions
  are immutable, enforced by a database trigger
  ([0025](docs/decisions/0025-immutability-in-the-database.md)), and
  submissions never migrate.
- **Releasing, provenance and signing** — [`RELEASING.md`](RELEASING.md).
- **Reporting a vulnerability** — [`SECURITY.md`](SECURITY.md).
