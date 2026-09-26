# Architecture decision records

Every decision here was actually made, in the order the numbers suggest, while
building formancy. They are written after the fact from the real history —
commits, review findings and the arguments that changed direction — and not
reconstructed to look tidier than the work was. Where a decision was reversed
or narrowed later, the record says so and points at the one that superseded it.

## Why these exist

Three audiences, in decreasing frequency:

1. **Contributors**, who need to know why the obvious simpler thing was not
   done, so they do not helpfully undo it.
2. **Evaluators**, deciding whether to build on formancy, who want the
   reasoning and not just the result.
3. **Manufacturers** incorporating formancy into a regulated product, who need
   design rationale traceable to design outputs. See
   [`../regulatory/MDR-CONTEXT.md`](../regulatory/MDR-CONTEXT.md) for what this
   documentation set is and — importantly — what it is not.

## Format

[MADR](https://adr.github.io/madr/)-shaped, trimmed to what is load-bearing:

```markdown
# NNNN — Title in the imperative

- **Status:** accepted | superseded by NNNN | reversed
- **Date:** YYYY-MM-DD
- **Deciders:** who
- **Verified by:** the tests, gates or files that hold this decision in place

## Context

The forces. What was true when the decision was made.

## Decision

What was decided, in one or two sentences.

## Consequences

What this buys, what it costs, and what it forecloses. The cost paragraph is
not optional: a record with no downside is marketing, not a decision.

## Alternatives considered

Each with the reason it lost.
```

**Status** means:

| Status | Meaning |
|---|---|
| `accepted` | In force. The code does this. |
| `superseded by NNNN` | Replaced. The old record stays, because the reasoning is still how we got here. |
| `reversed` | Tried and undone. Kept so nobody tries it again without reading why. |

**Verified by** is the field that distinguishes a decision record from an
opinion. If a decision is load-bearing, something in the repository fails when
it is violated — a test, a lint rule, a CI gate, a database constraint. A
record whose only enforcement is "we remember" says so plainly.

## Index

### Product and scope

| # | Decision | Status |
|---|---|---|
| [0001](0001-purpose-built-spec.md) | Write a new schema spec rather than adopt form.io's | accepted |
| [0002](0002-apache-2-0.md) | Apache-2.0 for everything, no dual licensing | accepted |
| [0003](0003-open-core-line.md) | Give away the engine, sell operating the platform | accepted |

### Architecture

| # | Decision | Status |
|---|---|---|
| [0004](0004-headless-core.md) | A headless isomorphic core with framework-native bindings | accepted |
| [0005](0005-not-web-components.md) | Do not distribute the renderers as Web Components | accepted |
| [0006](0006-one-engine-build.md) | One engine build runs in the browser and on the server | accepted |
| [0007](0007-react-and-angular-first.md) | React and Angular first; Vue deferred | accepted |
| [0008](0008-layered-packages.md) | Layer the packages and enforce the dependency direction | accepted |

### The spec

| # | Decision | Status |
|---|---|---|
| [0009](0009-independent-spec-version.md) | Version the spec independently of the packages | accepted |
| [0010](0010-canonical-hash.md) | Canonically serialise and hash every schema | accepted |
| [0011](0011-declared-renames.md) | Field keys are identity; renames are declared | accepted |
| [0012](0012-pages-scope-nothing.md) | Pages scope nothing; groups and repeaters scope paths | accepted |
| [0013](0013-hidden-field-semantics.md) | Specify what happens to a hidden field's answer | accepted |
| [0014](0014-presentation-sections.md) | Keep words and arrangement in optional sections | accepted |
| [0015](0015-diff-before-server.md) | Build `diffSchemas` before there is data to corrupt | accepted |
| [0041](0041-repeater-row-identity.md) | A repeater row carries its own identity | accepted |
| [0042](0042-freeze-the-spec.md) | Freeze the spec at version 1 | accepted |
| [0043](0043-runs-on.md) | A validation rule says which side it runs on | accepted |

### The engine

| # | Decision | Status |
|---|---|---|
| [0016](0016-cel.md) | Use CEL for conditional logic and calculations | accepted |
| [0017](0017-expression-facade.md) | Wrap the CEL implementation behind our own facade | accepted |
| [0018](0018-static-dependencies.md) | Extract dependencies statically and reject cycles at save time | accepted |
| [0019](0019-injected-capabilities.md) | Inject the clock and randomness; never read them ambiently | accepted |
| [0020](0020-identity-stable-snapshots.md) | Make snapshot identity the reactivity contract | accepted |
| [0021](0021-engine-owns-aria.md) | The engine owns element ids and ARIA composition | accepted |
| [0022](0022-fail-open-fail-closed.md) | Fail open on metadata, fail closed on validation | accepted |
| [0023](0023-model-properties-in-engine.md) | Model properties are honoured by the engine, not by renderers | accepted |

### The server

| # | Decision | Status |
|---|---|---|
| [0024](0024-postgres-over-mongodb.md) | Postgres with JSONB, not MongoDB | accepted |
| [0025](0025-immutability-in-the-database.md) | Enforce version immutability with a database trigger | accepted |
| [0026](0026-bind-by-fk-and-hash.md) | Bind a submission to its version by foreign key and by hash | accepted |
| [0027](0027-lazy-draft-migration.md) | Migrate drafts lazily on resume, never eagerly | accepted |
| [0028](0028-server-core-split.md) | Separate the use cases from the HTTP framework | accepted |
| [0029](0029-rest-and-openapi.md) | REST with OpenAPI, not tRPC and not GraphQL | accepted |
| [0030](0030-never-trust-client-state.md) | Recompute every derived value on the server | accepted |
| [0031](0031-enumeration-resistant-login.md) | Make a failed login indistinguishable from an unknown user | accepted |
| [0032](0032-csv-formula-neutralisation.md) | Neutralise formulas in exported CSV | accepted |
| [0044](0044-access-outside-the-document.md) | Who may submit is a property of the deployment, not of the document | accepted |
| [0045](0045-reject-backtracking-patterns.md) | Refuse a pattern that can be made to backtrack | accepted |
| [0046](0046-keyboard-before-drag.md) | Build the builder UI keyboard path before its drag surface | accepted |
| [0047](0047-layouts-render.md) | Render layouts, with the DOM as the arrangement | accepted |
| [0048](0048-webhook-delivery.md) | Deliver webhooks from a transactional outbox, to an address we checked | accepted |
| [0049](0049-one-polling-worker.md) | Drain the outbox from one polling worker, and say so | accepted |
| [0050](0050-arrange-in-two-places.md) | Edit the arrangement in two places, over one document | accepted |
| [0051](0051-spec-2-adds-types.md) | Spec 2 adds field types; spec 1 documents keep working | accepted |
| [0052](0052-richtext-is-not-html.md) | A formatted-text answer is not HTML | accepted |
| [0053](0053-the-page-is-the-product.md) | The landing page renders a real form, and no effect is load-bearing | accepted |

### Verification

| # | Decision | Status |
|---|---|---|
| [0033](0033-one-suite-n-drivers.md) | Specify behaviour once as data, run it through every implementation | accepted |
| [0034](0034-accessible-name-only.md) | Conformance drivers resolve elements by role and accessible name only | accepted |
| [0035](0035-publish-the-suite.md) | Publish the conformance suite so others can self-certify | accepted |
| [0036](0036-pin-the-cel-corpus.md) | Run the official CEL corpus and pin the result | accepted |

### Tooling and distribution

Decision numbers are global across this index, not per section; 0041–0053 are
listed under the sections they belong to above.

| # | Decision | Status |
|---|---|---|
| [0037](0037-turborepo-over-nx.md) | pnpm workspaces with Turborepo, not Nx | accepted |
| [0038](0038-esm-only.md) | Publish ESM only | accepted |
| [0039](0039-pin-typescript.md) | Pin TypeScript to the range Angular accepts | accepted |
| [0040](0040-no-eval.md) | No `eval` and no `new Function`, anywhere | accepted |
| [0054](0054-expressions-that-never-work.md) | Refuse an expression that compiles and then never works | accepted |
| [0055](0055-files-are-claimed.md) | A file belongs to a submission, or it is rubbish | accepted |
| [0056](0056-agents-get-the-checks.md) | An agent gets the checks, not just the API | accepted |
| [0057](0057-the-audit-log-records-reads.md) | The audit log records reads, and never the data | accepted |
| [0058](0058-a-breaker-per-destination.md) | A breaker per destination, and a way to replay what died | accepted |
| [0059](0059-proof-of-work-not-a-captcha.md) | Proof of work, not a captcha service | accepted |
| [0060](0060-documentation-is-checked.md) | Documentation claims are checked by tests, not by care | accepted |
