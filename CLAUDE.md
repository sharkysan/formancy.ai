# Working in this repository

Read this before changing anything. It is short on purpose: everything here is
either a rule that has been broken at least once, or a pointer to the document
that holds the real detail.

## Documentation is part of the change, not a follow-up

**Every change updates the documentation it makes untrue, in the same commit.**
Not "later", not in a separate pass — the whole value of this documentation set
is that a reader can trust it, and a set that is 95% true is one a reader has to
verify themselves, which is the same as having none.

Work down this list on every change and say which ones you touched:

| If the change… | Then update |
|---|---|
| adds, removes or re-ranges a third-party dependency | [`docs/regulatory/SOUP-DECLARATION.md`](docs/regulatory/SOUP-DECLARATION.md) — the composition table **and** the prose about the dependencies worth looking at closely |
| makes a decision somebody could reasonably undo | a new record in [`docs/decisions/`](docs/decisions/), with its **Verified by** line naming what fails if it is violated |
| reverses or narrows an earlier decision | the superseded record says so and points forward. Records are never edited into agreement with the present |
| changes anything a user or integrator can observe | [`CHANGELOG.md`](CHANGELOG.md) |
| changes what can go wrong, or adds a new way for data to be wrong, lost, misdirected or unattributable | [`docs/regulatory/SAFETY-ANALYSIS.md`](docs/regulatory/SAFETY-ANALYSIS.md), under whichever of A–E it belongs to |
| changes how the work itself is verified — a gate, a toolchain, a review practice | [`docs/regulatory/LIFECYCLE.md`](docs/regulatory/LIFECYCLE.md) |
| implements something the regulatory set lists as absent, or releases a version | the version statement and the "still absent" list in the SOUP declaration. **A characterisation describes one version and no other** |
| changes the schema, the public API or the storage shape | [`MIGRATIONS.md`](MIGRATIONS.md), [`RELEASING.md`](RELEASING.md) and the spec reference where relevant |

The regulatory set is not decoration and not marketing. It exists for a
manufacturer incorporating formancy under IEC 62304, who builds their own
assessment on what it says — see
[`docs/regulatory/MDR-CONTEXT.md`](docs/regulatory/MDR-CONTEXT.md) for what it is
and, importantly, what it is not. **A wrong statement there is worse than an
absent one**: an absent one prompts the question, a wrong one answers it
incorrectly.

## A claim in prose is backed by something that fails

Documentation drifts silently, because prose does not break. So where a document
states a fact about the repository, a test asserts it, and the document says
which test.

This is not a theory. All three of these were written after the drift happened:

- `apps/docs/src/soup.test.ts` — the SOUP composition table against the
  manifests. It had drifted three packages and four dependencies, and none of it
  was visible in a diff, because the table did not change; the code did.
- `packages/server/src/dockerfile.test.ts` — the image's COPY list against the
  server's workspace dependency closure. A missing package built cleanly, passed
  every test, and died on startup with `ERR_MODULE_NOT_FOUND`.
- `apps/site/src/site.test.tsx` — the counts printed on the landing page against
  the spec and the decision records. A number on a page that nothing checks is an
  adjective with extra steps.

When you find a figure or a claim with nothing behind it, the fix is a test, not
a more careful edit. And **when you write a guard, make it fail first** — revert
the thing it guards, watch it fail, put it back. A test that has never failed has
not been shown to test anything ([`LIFECYCLE.md`](docs/regulatory/LIFECYCLE.md)).

## Measure before you write a number

Numbers in this repository are measured, not estimated. The proof-of-work
challenge documented "around a tenth of a second" for 100,000 hashes; it was
3,408 ms, and measuring it is what revealed that `crypto.subtle` made the
*defender* pay 18× more than an attacker
([0059](docs/decisions/0059-proof-of-work-not-a-captcha.md)). The wrong number
was not a typo — it was hiding a design error.

## Commits and pull requests

- **Commit as `Daniel Bacher <dbacher@gmail.com>`.** Never
  `daniel.bacher@ergon.ch`.
- **Branch from `main` and target `main`.** Stacked PRs whose base was already
  merged have silently stranded work three times. If a branch replaces another,
  say "supersedes #N" in the description rather than stacking on it.
- Commit messages say what changed and why it mattered, in the imperative. The
  history is cited by the decision records, so it is read.

## Conventions that live elsewhere

Do not restate these here; go and read them.

- **Test-first, failure observed** — [`LIFECYCLE.md`](docs/regulatory/LIFECYCLE.md).
- **Decision record format and the `Verified by` field** —
  [`docs/decisions/README.md`](docs/decisions/README.md).
- **Layering: what may import what**, and why the isomorphic packages have no
  `@types/node` — [0008](docs/decisions/0008-layered-packages.md). The
  typecheck gate carries this, so a Node import in `core` is a compile error
  rather than a review finding.
- **One suite, N drivers**, and why element lookup is restricted to role and
  accessible name — [0033](docs/decisions/0033-one-suite-n-drivers.md) and
  [0034](docs/decisions/0034-accessible-name-only.md).
- **TypeScript is pinned to `~6.0.3`** because Angular 22 requires
  `>=6.0 <6.1`. It lives in the workspace catalog, once, with the reason beside
  it — [0039](docs/decisions/0039-pin-typescript.md). `latest` is 7.x and
  Angular rejects it.
- **Releasing, provenance and signing** — [`RELEASING.md`](RELEASING.md).
- **Reporting a vulnerability** — [`SECURITY.md`](SECURITY.md).

## The two spec rules worth knowing before you touch the spec

1. **The version line is a reader contract.** Version 1 is frozen; version 2 is
   a superset that adds and removes nothing. A version-1 reader cannot read a
   version-2 document, and that failure must stay a validation error rather than
   a silent one ([0051](docs/decisions/0051-spec-2-adds-types.md)).
2. **Published form versions are immutable**, enforced by a database trigger
   rather than by application code
   ([0025](docs/decisions/0025-immutability-in-the-database.md)). Submissions
   never migrate.
