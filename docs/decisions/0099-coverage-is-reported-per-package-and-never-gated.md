# 0099 — Coverage is reported per package, and gated nowhere

- **Status:** accepted
- **Date:** 2026-10-04
- **Deciders:** Daniel Bacher
- **Verified by:** `apps/docs/src/codecov.test.ts`. It asserts that `codecov.yml` is
  exactly what `scripts/codecov-config.mjs` produces, so a package added without a
  component fails rather than going unreported; that every status the generator emits
  is `informational` and that it emits no `target` or `threshold`; and that
  `vitest.coverage.ts` has grown no `thresholds` key, which is the other place one
  would go. Seven mutations were applied and each observed failing the case meant to
  catch it. The file itself was checked against Codecov's own validator before
  committing, because an invalid configuration is ignored silently and falls back to
  the defaults this record exists to replace.

## Context

`CLAUDE.md` has said from early on that coverage is reported and not gated, and
`vitest.coverage.ts` carries the argument: a percentage is a number somebody can raise
without raising confidence, and the exclusions in that file exist so the figure means
something rather than so it looks good. The bar is a test that fails without the
behaviour it covers.

**Codecov's defaults are the opposite of that, and nothing said so.** With no
`codecov.yml` in the repository it applies a `project` and a `patch` status against an
`auto` target, which is a *failing check* when the number drops. So the policy was
written in two documents and contradicted by the tool, which is the arrangement where
the documents lose.

It was visible and had not been read. The comment on pull request #145 said:

> :x: Patch coverage is `87.87879%` with `4 lines` in your changes missing coverage.
> Please review.

Three things wrong in one sentence. A red cross and "Please review" frame a reported
number as a failure. `87.87879%` claims five decimal places of precision for a line
count. And the report gave no indication which of nineteen packages the lines were in —
one number for the whole workspace, in a repository whose central claim is that two
implementations of one decision must not drift apart, where a renderer losing coverage
and the server gaining it are the same number.

## Decision

**`codecov.yml`, generated from the workspace, with every status informational and one
component per package that measures coverage.**

- **Informational everywhere.** Both top-level statuses and the component statuses.
  Codecov reports the movement and blocks nothing, which is what the policy already
  said.
- **`precision: 1`, rounded down.** One decimal, because the second one was noise.
- **A component per package.** Eighteen of them — every package with a `test:coverage`
  script, which is all of them except `packages/themes`, which is CSS. The comment then
  says *which* package moved.
- **Generated, not hand-written.** `scripts/codecov-config.mjs` reads the manifests and
  emits the file. A component list typed by hand goes stale the way the publication
  checks did: three packages sat on a weaker check than their twelve siblings until
  somebody counted, and the symptom of a missing component is absence rather than
  error — the package is not reported wrongly, it is not reported.
- **No `ignore` list.** What is left out of the measurement is left out in
  `vitest.coverage.ts`, where each exclusion has its argument written beside it, so it
  never reaches the uploaded report. A second list in `codecov.yml` would be one
  decision in two places.

**The reasoning lives in the generator**, not in the generated file, because a comment
in a generated file survives until the next run — which has happened here before, to a
hand-written table in the spec reference.

## Consequences

**Nothing now fails when coverage drops, and that is the point rather than a
side-effect.** The previous arrangement had a gate nobody had chosen, on a threshold
nobody had set, that would have been read as rigour. What replaces it is a report that
names the package, and the existing bar: a test that fails without the behaviour it
covers. A reader who wants the drop to block something is asking for a threshold, and
the argument against one is in `vitest.coverage.ts` and now in a test.

**A new package must be added to the report, and the test says how.** Adding one
without regenerating fails `codecov.test.ts` with the command to run. That is a step,
and it is the step whose absence is invisible.

**Editing `codecov.yml` by hand is undone by the next generator run**, and the file says
so in its first line. The same trap as the spec reference, named in the same place.

**Codecov's GitHub App is still not installed on this repository**, and its warning
banner is on every comment. That is organisation configuration rather than anything in
this tree, so no file here can assert it; without it uploads and comments are processed
on a best-effort basis. Recorded here because the banner is easy to read as noise.

**The configuration is only as good as Codecov's acceptance of it**, and an invalid file
is ignored rather than rejected — the failure would be this record describing behaviour
that never happened. Hence the validator check before committing, and hence the test
comparing the committed file to its generator rather than merely asserting the file
exists.

## Alternatives considered

**Leaving the defaults.** Rejected once the comment on #145 was actually read: the
default is a gate, and a gate the repository has argued against twice in prose is worse
than one it chose, because nobody will go looking for it.

**A threshold, since there is going to be a status anyway.** The honest version of the
opposite case: pick a number, hold the line, let it ratchet. Rejected on the argument
already in `vitest.coverage.ts` — the number can be raised by covering the lines that
are easy to reach, which is the opposite of the reason to write a test — and on the
exclusions, which exist so the figure is meaningful and would become a lever the moment
the figure gated anything.

**Flags instead of components.** Codecov's older mechanism, and the one most examples
use. Rejected because flags require one upload per package: fourteen more steps in CI,
each able to fail separately, for the same breakdown that components compute from the
single report already being uploaded.

**A hand-written `codecov.yml` with a test checking the components against the
manifests.** The first plan, and it needed a YAML parser, which the workspace does not
have — so it would have meant a new dependency for a test, or a regular expression over
YAML. This repository has recorded six guards whose own expression was the defect.
Generating the file and comparing strings needs neither.
