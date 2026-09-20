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
| §5.5 Unit implementation and verification | **Yes** | Test-first development; 1,155 automated tests, with per-package coverage reported |
| §5.6 Software integration and integration testing | **Yes** | Conformance suite across five implementations; integration tests against real PostgreSQL |
| §5.7 Software system testing | Partially | End-to-end verification performed manually and recorded; not automated end-to-end |
| §5.8 Software release | Partially | `0.1.0` released to npm from CI with provenance and a signed SBOM; the gates are mechanical and no human sign-off is recorded against a checklist |
| §6 Software maintenance | **No** | One release exists, but no maintenance process is defined for it — no support commitment, no backport policy, and no defined response time beyond `SECURITY.md` |
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
pnpm typecheck
pnpm test
pnpm check:pkg
```

Each gate exists for a reason that was paid for at least once:

- **`build`** — the Angular package is built with `ng-packagr` because the
  Angular Package Format requires partial-Ivy compilation; the TypeScript
  packages are built with `tsdown`. Two toolchains, budgeted deliberately
  ([0037](../decisions/0037-turborepo-over-nx.md)).
- **`typecheck`** — carries part of the architecture. The isomorphic packages
  have no `@types/node`, so a Node import is a compile error rather than a
  review finding ([0008](../decisions/0008-layered-packages.md)).
- **`test`** — 808 tests plus, locally and in the integration job, 21 against a
  real PostgreSQL instance through Testcontainers. Versioning defects only
  manifest against real SQL semantics, so a mocked database would not find
  them.
- **`check:pkg`** — `publint` and `@arethetypeswrong/cli` with
  `--profile esm-only`, because broken exports maps are the commonest way a
  multi-framework library fails in somebody else's application
  ([0038](../decisions/0038-esm-only.md)).

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
**frozen** as of 2026-09-20 ([0042](../decisions/0042-freeze-the-spec.md)): a
document that validates today keeps validating. A spec change from here is a
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
- The container image is neither published nor signed, because no registry has
  been chosen. It builds locally from `docker compose up`. The npm side is
  done: `0.1.0` went out from CI with a SLSA v1 provenance attestation per
  tarball and a CycloneDX SBOM signed with cosign, keylessly, so there is no
  private key to protect or leak.

A manufacturer needing any of these for their classification must either supply
it themselves as part of their own SOUP evaluation, or treat its absence as a
reason not to use this software.
