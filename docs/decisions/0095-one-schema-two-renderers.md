# 0095 — One schema, two renderers, on one page — and an engine may be told its id namespace

- **Status:** accepted
- **Date:** 2026-10-03
- **Extends:** [0021](0021-engine-owns-aria.md), which gave the engine the ids and is the
  reason this needed a decision rather than a prefix in a renderer. Pays the demonstration
  debt recorded in [0094](0094-the-second-builder-reaches-parity.md)
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/core/src/two-on-one-page.test.ts` (5 cases: the override, every
  part namespaced, the default unchanged, `aria-describedby` following the override, and a
  bad id refused **at construction**). Observed failing two ways — the option ignored, and
  the eager check removed. `apps/playground/src/two-renderers.test.tsx` (4 cases) holds that
  the Angular half renders, offers the **same controls by accessible name** as React, runs
  its logic, and that the page has no duplicate id; observed failing with the mount
  suppressed, with a capability withheld, and with the two engines given one form id.
  `apps/playground/src/accessible.test.tsx` now waits for both renderers before auditing, and
  axe reports the collision when the ids are made to collide.

## Context

The project's founding claim is a headless engine that is genuinely framework-neutral, and
the v0.1 goal was *"one schema rendering in React and Angular simultaneously, in one
screenshot"*. Both Angular packages were complete and published and **no application mounted
either of them**, so the claim was a result in two jsdom suites that had never seen each
other.

Putting them on one page turned out to need something the engine could not express.

Element ids are minted as `f:{formId}:{path}:{part}` from `schema.id`, which is what makes
them deterministic and SSR-stable. **Measured: two engines built from one schema produce
identical ids.** So a page showing one document twice emits every id twice — and a duplicate
id breaks precisely the two things the engine mints them for, because `<label for>` and
`aria-describedby` both resolve to the *first* match in the document.

The consequence is worse than "two elements share an id", and this was also measured: with
both engines on one form id, every control in the second renderer **loses its accessible name
altogether**. Not duplicated — unreachable. Each renderer is correct about the tree it
rendered, so neither can see it, and axe never looked because the audit ran before Angular
had mounted.

This is not only a demo problem. A host rendering the same form twice on one page — one per
applicant, one per line of business — has exactly the same page.

## Decision

**`createFormEngine` takes an optional `formId`, defaulting to `schema.id`.** It is the
namespace for that engine's element ids and nothing else.

**A rendering concern rather than a document one**, which is why it is an option and not a
second `schema.id`: the document is the same document, the schema hash is the same hash, and
a submission still binds to the version it was rendered against. Changing the document's id
to render it twice would make two documents out of one.

**Validated when the engine is built**, not when a field is first renders. `fieldIds` already
rejected a `:` or whitespace — lazily, which was also true of `schema.id`, and is the wrong
moment: a page that renders nothing until somebody scrolls reported the mistake then, a long
way from the argument that caused it.

**And the playground shows both renderers over one schema**, each with its own namespace,
each wearing the same theme, in a grid that stacks when there is no room for two.

## Consequences

**The claim is now visible, and so is its cost.** Measured over the built bundle:
231.4 kB brotli before, **280.9 kB after** — about 50 kB for Angular's framework and
renderer on a page that already carries React, Monaco and the builder. Published here rather
than left to be discovered, because this is a demonstration page and not the library: nothing
a consumer installs got bigger.

**The two previews hold their own answers rather than mirroring each other.** That is the
trade for the namespaces, and it is the right one: the claim is that one engine build behaves
identically under both renderers, which is shown by filling the same field in each and getting
the same validation, not by one typing into the other.

**Building it found a defect in the demo nobody could have seen.** The playground's
capabilities — the options source, the scanner, the uploader, the rich-text editor — were local
to the React component, so the Angular half was bootstrapped without them and rendered **one
control fewer**: `deliveryPoint` is a typeahead over an `optionsSource`, and with no source to
resolve it shows a message instead of a chooser. The pane was full of fields and looked right.
It was caught by comparing the two panes by accessible name, which is why that test is an
equality and not a spot check. The capabilities now live in `demo-capabilities.ts`, because
they are the *deployment* and both renderers here are one deployment.

**The accessibility audit was checking half the page.** `showing()` rendered the app and
returned, and Angular bootstraps asynchronously — so axe reported a clean page with one form
on it. It now waits, and the wait is what makes the audit mean anything: duplicate ids are
exactly what axe catches and exactly what two renderers of one schema produce.

**The engine's size budget allowed no room**, and the ratchet is strict: a listed file may not
grow by a single line. The check protocol types — `CheckRequest` and `Check` — moved to
`checks.ts` to pay for the option, which is the first and easiest piece of the seam that
entry already named. The machinery itself still needs the graph and the store and has not
followed.

**Two renderer-facing protocol types are duplicated.** `OptionsSource`, `OptionsSources` and
`Scanner` are declared independently and **byte-for-byte identically** in `@formancy/react`
and `@formancy/angular`. The shared demo capabilities typecheck structurally against both,
which is the only reason this works. Recorded as debt rather than fixed: moving a published
type changes two packages' public surfaces.

**What this does not do is mount the Angular builder.** `@formancy/builder-angular` is still
demonstrated nowhere; what is on the page is `@formancy/angular`, the renderer. The debt row
and the roadmap item say which half is left.

## Alternatives considered

**Share one engine between the renderers**, so typing in React updates Angular live. Rejected,
and it was tempting: it is the more spectacular demonstration. But one engine has one form id
by construction, so the ids collide and the second renderer's controls lose their names — the
demo would have shipped with the defect it exists to disprove. Making the renderers prefix the
ids instead would move id minting out of the engine, which is the thing
[0021](0021-engine-owns-aria.md) exists to prevent.

**Give the Angular side a copy of the schema with a different `id`.** Rejected: it needs no
code and it makes the demo a lie. Two documents rendered by two renderers shows nothing about
one document rendered by two renderers, and the hash that binds a submission would differ.

**A separate `/angular/` application**, composed under the same origin as `/playground/` and
`/docs/` already are. Rejected on what it would demonstrate: the renderers would never be on
screen together, so "no drift" would stay a test result. It is also the cheaper build — no
Angular in the React bundle — and that saving is 50 kB on one demonstration page, against the
one screenshot the project has been claiming since v0.1.

**Leave it, since the conformance suite already proves parity.** Rejected on the repository's
own rule: prose that says a feature exists and a build where nobody can see it working are two
different claims, and the second is the one an evaluator checks. The suite is why this *works*;
it is not why anybody believes it.
