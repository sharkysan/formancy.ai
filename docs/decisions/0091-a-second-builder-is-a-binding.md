# 0091 — A second builder is a binding, not a second builder

- **Status:** accepted
- **Date:** 2026-09-29
- **Extends:** [0008](0008-layered-packages.md), which drew the line under the renderers;
  this draws the same line under the builders
- **Deciders:** Daniel Bacher
- **Verified by:** `apps/docs/src/builder-layering.test.ts`, which reads every file in
  `@formancy/builder-core` and fails on an import of React **or** Angular, against the
  source rather than the manifest. `packages/builder-core/src/view.test.ts` holds what both
  builders read off a session. `packages/builder-angular/src/builder.test.ts` holds the
  Angular tree to the same behaviours as `packages/builder-react/src/builder.test.tsx`, by
  role and accessible name only. Five of those were observed failing against the effect
  shape this record rejects.

## Context

The builder was React-only and nothing said why. The README's headline — *"The
open-source visual form builder for Angular and React"* — is resolved by the sentence after
it, *"embed your **form** in Angular or React"*, but an Angular team judging the project in
ten minutes reads the headline. Asked directly: *"why is there no builder for angular?"*

Measured before answering: `builder-core` was 2,007 lines and `builder-react` 4,088. But
**915 of those 4,088 mentioned no framework** — the compiler that turns a structured
condition into CEL, the two drop models, the two tree flatteners, the palette, and the
editable property list read out of the spec's own JSON Schema. They were in the React
package because it was the only builder there was.

That is the difference between a second builder costing a rewrite and costing components.

## Decision

**What decides anything lives in `@formancy/builder-core`; a builder package is markup and
a subscription.** The seven modules moved, and `builderView(session)` — everything a
builder's interface reads off a session, including the destination list with the
field's own position filtered out — moved with them.

`@formancy/builder-angular` is Angular 22, zoneless, `OnPush`, standalone components, one
signal per session. `injectBuilderView` is the Angular half of the protocol React binds with
`useSyncExternalStore`: `revision()` is the whole subscription, because the session
increments it once per accepted command and no document has to be diffed.

**The structure tree first, and alone.** It is the command surface — add, move, delete,
page, unwrap, undo — and the one an evaluator opens. The arrangement tree, the property
panel, the condition editor and the translations pane follow, and each is now a component
rather than a design, because the part that had to be decided is decided in one place.

## Consequences

**A destination list cannot differ between the builders**, which is the property worth
having. It is also the one that would have been impossible to notice: somebody using the
Angular builder alone would have had no way to know the React one offered something else.

**Two test suites hold one behaviour**, by role and accessible name in both, the way the
renderers hold the signature control. The conformance fixtures cannot carry these — their
vocabulary is filling in and clicking on a rendered *form*, and there is no way to say
"press `m` and choose a destination" in it ([0033](0033-one-suite-n-drivers.md) is why that
restriction exists, and this is where it runs out). So the parity is by hand, and stated
as such rather than implied.

**An Angular effect may not read the signal it writes.** This cost an afternoon and is
worth writing down: the first version kept focus on a field across an edit with an effect
that read the focused position and set it, which is how the React version reads during
render with a ref guard. Angular treats that as a cycle and answers by **not scheduling any
further change detection** — and there is no error. It looks exactly like a component whose
bindings have frozen: the key handler runs, the signal changes, the DOM keeps the value from
the first render. It was found by probing the signal and the DOM in the same test and
watching them disagree. The correction is guarded on the *document* changing, with the
position read and written inside `untracked`.

**`@formancy/builder-react` keeps working unchanged**, re-exporting everything that moved.

## Alternatives considered

**Wrap the React builder for Angular**, through a custom element or a React root inside an
Angular host. Rejected for the reason [the architecture](../architecture/05-building-blocks.md)
rejected Web Components for the renderers, plus one worse: the builder's whole surface is
markup the consumer is meant to theme, and a wrapped React tree is markup an Angular design
system cannot reach. It would also put React in an Angular application's dependency closure
to edit a JSON document.

**Copy the seven modules into the Angular package.** Rejected: two compilers turning a
condition into CEL is the drift this project exists to prevent between the renderers, and
there is no reason to accept it one layer up. The copies would agree on the day they were
made.

**Build every pane at once.** Rejected as the shape that produces a half-finished pane in
each. The structure tree is the command surface and is complete — every command, every
refusal announced, the legend listing all of them — which is a thing somebody can use,
rather than five things somebody can look at.

**Say the builder is React-only and leave it.** Rejected once the measurement was in: the
expensive half was already framework-free, and the remaining cost is components against a
core that is now shared. The honest version of "not coming" needs a reason, and *"it would
be a rewrite"* had stopped being one.
