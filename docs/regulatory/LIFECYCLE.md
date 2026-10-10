# How this software is actually developed

Written in the shape of IEC 62304's process areas so that a manufacturer
assessing formancy as SOUP can see which of them are covered and which are not.
It describes what is actually done. Where a process area is absent, it says so.

Read [`MDR-CONTEXT.md`](MDR-CONTEXT.md) first: **the project does not operate a
quality management system, and this is not a claim of IEC 62304 conformity.**

## Summary against the standard's process areas

| IEC 62304 | Covered? | Where |
|---|---|---|
| §5.1 Software development planning | Partially | A written plan exists as the design document; it predates the code but is not a controlled QMS document |
| §5.2 Software requirements analysis | Partially | Requirements exist as the spec, the conformance fixtures and the quality budgets; not as a numbered requirements list |
| §5.3 Software architectural design | **Yes** | [the architecture documents](../architecture/01-introduction-and-goals.md) and [`../decisions/`](../decisions/) |
| §5.4 Software detailed design | Partially | In code and in comments, which are unusually dense about *why*; no separate detailed design documents |
| §5.5 Unit implementation and verification | **Yes** | Test-first development, with per-package coverage reported; the suite size is stated as a dated floor under [Verification gates](#verification-gates) rather than transcribed twice — this row said 1,155 while that one said 1,661, both written on one day |
| §5.6 Software integration and integration testing | **Yes** | Conformance suite across five implementations; integration tests against real PostgreSQL |
| §5.7 Software system testing | Partially | End-to-end verification performed manually and recorded; not automated end-to-end |
| §5.8 Software release | Partially | Released to npm from CI with provenance and a signed SBOM, and the server image to GHCR signed by digest; the gates are mechanical and no human sign-off is recorded against a checklist. The packed tarballs are installed into a project outside the workspace and run before release (`test:e2e:install`), but nothing re-checks a version once it is on the registry |
| §6 Software maintenance | **No** | Releases exist, and no maintenance process is defined for them — no support commitment, no backport policy, and no defined response time beyond `SECURITY.md` |
| §7 Risk management | Partially | [`SAFETY-ANALYSIS.md`](SAFETY-ANALYSIS.md) identifies failure modes; no ISO 14971 file, by design |
| §8 Configuration management | **Yes** | Git, pinned dependencies, lockfile, immutable published schema versions |
| §9 Problem resolution | Partially | Defects are fixed with a regression test; no formal problem-report record |

## How work is done

### Test-first, with the test expected to fail first

Every behaviour is written as a failing test before the code that satisfies it,
and the failure is observed rather than assumed. This is not a stylistic
preference: a test that has never failed has not been shown to test anything.
The practice is visible in the commit history.

### Behaviour is specified once, as data

The most significant verification decision is that correctness is specified in
JSON fixtures and executed against **every** implementation — the engine in
Node, the engine in a browser, the React renderer, the Angular renderer and the
server's revalidation endpoint
([0033](../decisions/0033-one-suite-n-drivers.md)). A behaviour is written once
and verified in five places, and a renderer that deviates fails a test nobody
wrote against it specifically.

The driver interface deliberately restricts element lookup to role and
accessible name ([0034](../decisions/0034-accessible-name-only.md)), which makes
accessibility a structural property of passing the suite rather than a separate
workstream.

### Adversarial review of the load-bearing packages

Packages whose failure would be expensive were reviewed adversarially — a
review whose brief is to find the defect, not to approve the change. This found
three critical defects that ordinary testing had not:

| Package | Defect found |
|---|---|
| `spec` | `diffSchemas` was blind to changes inside nested containers, so a breaking change could be classified as compatible |
| `conformance` | An assertion failing was confused with the driver crashing, so some failures presented as passes |
| `expressions` | An unmetered `split()` allowed a small expression to allocate without bound |

Each is recorded in the decision record for the area it affected. They are
listed here because a review process that has never found anything is not
evidence of quality.

### Decisions are recorded with what enforces them

Every record in [`../decisions/`](../decisions/) carries a **Verified by** line
naming the test, lint rule, CI gate or database constraint that fails when the
decision is violated. Where nothing enforces a decision, the record says "Not
mechanically enforced" rather than implying otherwise. That field is what makes
the set auditable instead of aspirational.

## Verification gates

CI runs on every push to `main` and every pull request, on Node 22, with a
frozen lockfile:

```
pnpm install --frozen-lockfile
pnpm build
pnpm build:web
pnpm typecheck
pnpm test
pnpm check:pkg
pnpm test:e2e:install
pnpm test:e2e:angular
pnpm test:browser
```

Each gate exists for a reason that was paid for at least once:

- **`build`** — the Angular package is built with `ng-packagr` because the
  Angular Package Format requires partial-Ivy compilation; the TypeScript
  packages are built with `tsdown`. Two toolchains, budgeted deliberately
  ([0037](../decisions/0037-turborepo-over-nx.md)).
- **Container-backed integration tests** — the server's suite runs against a real
  PostgreSQL and, since the object store landed, a real Garage. Both exist for the
  same reason: the defects only appear against a real implementation. The S3 case
  is sharper than the database one, because the signing code is ours and Garage is
  the only thing in the repository that can say the signature is *right* rather
  than merely self-consistent — so that suite carries a case asserting a wrong
  secret is refused, without which the rest of it would prove nothing.
- **`build:web`** — composes the landing page, the playground, the docs and the
  Angular starter under one origin, which `build` does not do, and carries the check
  for root-absolute documentation links and for an app's asset URLs pointing outside
  where it is served. Added as a gate after it had existed for a while as a
  script nothing ran: two links resolving against the landing page instead of
  `/docs/` reached production, built cleanly all the way through, and were found
  in a deploy log. A guard that is not a gate is a comment.
- **`typecheck`** — carries part of the architecture. The isomorphic packages
  have no `@types/node`, so a Node import is a compile error rather than a
  review finding ([0008](../decisions/0008-layered-packages.md)).
- **`test`** — **over 1,600 tests**, of which 62 run against a real
  PostgreSQL instance through Testcontainers. Versioning defects only manifest
  against real SQL semantics, so a mocked database would not find them. The
  figure is a floor rather than a count: it was 1,661 when measured on
  2026-09-26, and an exact number here goes stale on the next commit that adds
  a test — which happened to this line twice while it was being corrected.
  Stating the floor is what makes it true tomorrow as well
  ([0060](../decisions/0060-documentation-is-checked.md)). A manufacturer who
  needs the exact figure for a pinned version should read it from that
  version's CI run.
- **`check:pkg`** — `publint` and `@arethetypeswrong/cli` with
  `--profile esm-only`, because broken exports maps are the commonest way a
  multi-framework library fails in somebody else's application
  ([0038](../decisions/0038-esm-only.md)). It runs for **every** published
  package: three of them were on a weaker check than their twelve siblings until
  somebody counted, two with no `attw` at all and one with no check whatsoever.
- **`test:e2e:install`** — the tarballs `pnpm pack` produces, installed into a
  plain npm project which is then type-checked with `skipLibCheck` **off**, run
  under Node, and built with Vite. Every other gate runs *inside* the workspace,
  where a sibling resolves a package through a symlink to its source directory —
  so an `exports` map that is wrong for a real consumer can be right for every
  test here. That is not hypothetical: `@formancy/builder-angular` shipped with
  no `exports` at all for four releases, and its own ninety-five tests could not
  see it because they import by relative path
  ([0096](../decisions/0096-two-builders-one-session.md)). Verified by breaking
  it three ways — an entry point removed, an `exports` path pointing at a file
  the tarball does not contain, and a runtime assertion inverted — and watching
  each one fail. It runs once per React version in `compatibility.json` — the lowest the
  peer range admits and the newest — and renders a form with that React under Node, since the
  bundle it builds is never executed ([0134](../decisions/0134-the-versions-it-says-are-the-versions-it-runs.md)).
- **`test:e2e:angular`** — the Angular packages' equivalent, once per Angular version in
  `compatibility.json`: the tarballs installed into an Angular project at that version, with
  Material at the same one, built by that project's own Angular and run in Chromium. The
  install test above cannot: an Angular package is consumed by an Angular build, whose linker
  is the consumer's. The engine and the server also run once per Node version, in CI's `node` job
  ([0134](../decisions/0134-the-versions-it-says-are-the-versions-it-runs.md)).
- **The contributor agreement**, in a workflow of its own rather than in the list
  above, because it is not a `pnpm` script and needs no install:
  `node scripts/check-cla.mjs` reads the commit authors of a pull request and
  fails naming any the record in `.github/cla/signatories.json` has no signature
  for ([0098](../decisions/0098-the-cla-is-checked-in-the-repository.md)). Added
  a week after [0069](../decisions/0069-contributions-under-a-cla.md) decided the
  agreement, which had written down that until a check existed the terms were
  "stated and unverified". Verified by ten mutations, each observed failing the
  case meant to catch it — among them a fail-open on a commit range the check
  cannot read, which is the one that looks like success.

- **`test:browser`** — the composed site loaded in Chromium at four viewports,
  asserting what jsdom cannot represent: that nothing scrolls sideways, how many
  columns the pane row computes, and the computed `touch-action` of both
  renderers' signature surfaces with and without a theme
  ([0102](../decisions/0102-what-jsdom-cannot-see-is-checked-in-a-browser.md)).
  It also reads the stylesheets the composed site serves, before opening a page, and
  fails on `:dir()` rewritten as a list of languages — a file check rather than a
  browser one, placed here because this is the gate that runs on what
  `pnpm build:web` produced
  ([0123](../decisions/0123-the-builder-reads-right-to-left.md)). And it opens the Angular
  page and waits for the starter inside its frame to render, the one thing on the site jsdom
  cannot load at all
  ([0136](../decisions/0136-the-angular-page-runs-the-starter.md)), then opens the starter
  itself and asks whether Material's labels are drawn in a Roboto face the document loaded,
  and whether the builder and the controls Material does not draw resolve to Material's own
  colours ([0142](../decisions/0142-the-angular-starter-is-dressed-in-materials-tokens.md)),
  and whether its date field shows a calendar button, read from the pixels at the end of the
  input because the button is a pseudo-element the cascade will not describe
  ([0149](../decisions/0149-a-material-date-keeps-the-platforms-calendar-button.md)).
  And it drags on the playground's preview: it measures the space between two stacked fields
  and between two top-level sections, asks what a browser reports under it, drops a node there
  in both renderers' markup and reads back where it landed
  ([0146](../decisions/0146-a-drop-between-two-nodes-is-read-from-where-they-were-drawn.md)),
  and that afterwards as much of the preview can be picked up as before, as can a field a
  rule has just shown, a static text and a repeater
  ([0150](../decisions/0150-every-field-an-arrangement-places-names-itself.md); [0148](../decisions/0148-the-arrange-surfaces-marks-follow-the-dom.md)).
  And since 2026-10-09 it **records every request**, which is not a question about layout at
  all and needed a browser for the same reason — jsdom, as every suite here runs it, fetches
  nothing: the landing page, the
  templates, the Angular page with its frame, the playground and one page of the documentation
  are opened with every request routed through the gate, and any addressed to another origin
  is aborted and named, as is a `preconnect` or `dns-prefetch` hint to another host. Aborted
  rather than let through, so the answer does not depend on the runner's network. It also asks
  whether each page's text is drawn in a face the document loaded and whether the playground's
  editor arrived, so a page that dropped what it used to fetch elsewhere cannot pass, and
  whether the playground's content security policy refuses a picture and a connection on
  another host. Committed before the fix and watched failing on `main` against Google Fonts
  and jsDelivr ([0154](../decisions/0154-the-website-makes-no-request-to-any-other-site.md)).
  Since 2026-10-10 it also opens the playground a second time and carries a model's turn
  through its relay in each builder, React and then Angular — describe a change, copy the
  request with the clipboard granted to the page's own origin, paste an answer, review and
  apply — with every request the page makes on the way counted the same, and each step that
  did not happen named
  ([0159](../decisions/0159-a-person-carries-the-models-turn.md)).
  **A different kind of test from the rest of this list**, and the reason is
  structural rather than a coverage gap: jsdom applies no CSS, resolves no media
  queries and performs no layout, so every box measures zero and every cascade
  question has no answer. Two defects shipped through every other gate in one
  week for exactly that reason. Verified by reverting both of them and watching
  this one redden, which is the only evidence that mattered. Deliberately not
  screenshots: the renderers ship no styling, so a pixel baseline would be
  testing demo CSS, and a baseline is a file somebody updates when it goes red.

**None of these gates is mechanically required.** `main` carries no branch
protection rule, so every one of them reports and a maintainer decides. That is
recorded in [§11.6](../architecture/11-risks-and-debt.md) rather than left to be
inferred from the fact that the gates exist.

Additionally, performance budgets are measured rather than asserted: a
keystroke on a large form at ≈0.38 ms against a 1 ms budget, and cold graph
compilation at ≈1.7 ms against a 30 ms budget.

## Configuration management

- **Source control.** Git, with the complete history. Every decision record
  points at code that exists at the commit it describes.
- **Dependencies.** Pinned through a pnpm lockfile and a workspace catalog, so
  a version such as the TypeScript pin exists in exactly one place with the
  reason written beside it ([0039](../decisions/0039-pin-typescript.md)).
- **Generated artefacts.** The ahead-of-time schema validator is committed and
  stamped with the hash of the schema it was generated from, so a stale artefact
  is detectable rather than silent ([0040](../decisions/0040-no-eval.md)).
- **Data format versions.** Published form versions are immutable, enforced by a
  database trigger ([0025](../decisions/0025-immutability-in-the-database.md)),
  and submissions never migrate. This is configuration management applied to
  user data rather than to source, and it is the part that cannot be retrofitted.

## Change control on the data format

The spec carries its own version, independent of the packages
([0009](../decisions/0009-independent-spec-version.md)). Version `"1"` is
**frozen** as of 2026-09-20 ([0042](../decisions/0042-freeze-the-spec.md)) and
version `"2"` as of 0.2.0 ([0051](../decisions/0051-spec-2-adds-types.md)): a
document that validates today keeps validating, in either version. Version `"3"` is
**frozen** as of 2026-09-29 with 0.3.0, and carries `signature`, the `tagpicker`
widget and the `check` and `skip` rule kinds
([0088](../decisions/0088-spec-3-freezes-with-four-constructs.md)). Version `"4"` is
**frozen** as of 2026-10-09, first released with 0.4.0, and carries the `ranking` and
`matrix` field types, the `rating` and `slider` widgets and the `step`, `mask` and
option `image` properties ([0140](../decisions/0140-spec-4-freezes-with-the-two-types-it-opened-for.md)). No version is open: a construct
needing one opens version 5, and `spec-version.test.ts` fails on a type that belongs to no
version's list. Version 2 is
a superset — it adds field types and layout kinds and removes nothing — so a
version 1 document is also a valid version 2 document, while a version 1 reader
refuses a version 2 document rather than ignoring the parts it does not know.
A spec change from here is a
major event, documents are rewritten forward by an explicit migration, and
**submissions never migrate** — they stay bound to the version that produced
them.

The three semantics the freeze waited on are themselves an example of the
lifecycle working: each was a question that could only be answered by building
the renderer and server that would reveal it, and each was answered before the
version was committed to rather than guessed at beforehand.

Breaking changes before 1.0 may land in minor releases and are documented in
`MIGRATIONS.md`.

## What is absent

Stated plainly, because a gap named is more useful than a gap implied:

- No quality management system, certified or otherwise.
- No software development plan as a controlled document predating the code.
- No numbered software requirements specification with traceability to tests.
  Traceability exists in substance — a fixture names the behaviour it verifies —
  but not as a matrix.
- No formal problem-report and resolution record. Defects are fixed with a
  regression test and described in the commit.
- No formal release *review*. Releases are cut from CI and the gates are
  mechanical — tests, typecheck, package linting, licence presence, tag-to-
  manifest version agreement — but no human sign-off is recorded against a
  checklist. See [`RELEASING.md`](../../RELEASING.md).
- No manual accessibility audit and no published VPAT.
- Nothing verifies a release **after it is published**. `test:e2e:install` packs
  the tarballs and installs them into a project outside the workspace, which is
  most of this gap closed — but it talks to no registry, so a release that packed
  differently from `pnpm pack` would still slip through, and nothing re-checks a
  version once it is on npm. The two Angular packages are also outside that gate:
  consuming one needs the Angular build toolchain rather than an import, so
  `apps/playground` building them from the workspace is what covers them.
- The container image's SBOM describes npm dependencies and not the base image or
  its system packages, so a manufacturer characterising the container has half of
  what they need. The signing side is done: the image goes to GHCR signed by
  digest with the SBOM attached as an attestation, and each npm tarball carries a
  SLSA v1 provenance attestation, all keylessly — there is no private key to
  protect or leak.

A manufacturer needing any of these for their classification must either supply
it themselves as part of their own SOUP evaluation, or treat its absence as a
reason not to use this software.

### Template examples as verification inputs

Starter templates carry fictional samples and scenario expectations alongside their
JSON documents. The docs test task runs those scenarios in client and server modes;
the site and playground tasks exercise their presentation. The existing browser gate
also verifies built gallery navigation, downloads, modal focus and phone/desktop
layout. These are software checks of the supplied examples, not domain approval of
the template content.
