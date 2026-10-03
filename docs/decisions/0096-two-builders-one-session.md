# 0096 — Two builders over one session, and a package that could not be imported

- **Status:** accepted
- **Date:** 2026-10-03
- **Extends:** [0091](0091-a-second-builder-is-a-binding.md), whose claim this demonstrates
  rather than argues; pays the debt [0094](0094-the-second-builder-reaches-parity.md) recorded
  and [0095](0095-one-schema-two-renderers.md) left standing
- **Deciders:** Daniel Bacher
- **Verified by:** `apps/playground/src/two-builders.test.tsx` (3 cases: the Angular builder
  mounts and renders the document, an edit there enables the React toolbar's Undo, and
  switching back keeps the document and the undo stack). Observed failing two ways — the mount
  suppressed, and the Angular builder given a session of its own, which is the defect the
  second and third cases exist for. `apps/docs/src/claims.test.ts` derives the roadmap's
  remaining item from what the playground mounts.

## Context

[0094](0094-the-second-builder-reaches-parity.md) closed the last functional gap between the
two builders and recorded what it could not close: nothing mounted
`@formancy/builder-angular`. [0095](0095-one-schema-two-renderers.md) put the Angular
*renderer* on the page and left the builder.

Trying to mount it turned up why that had been easy to leave. **The package was not importable
from anywhere in the workspace.** Its manifest carried no `exports` and no `types`, and
`publishConfig.linkDirectory: false` means a sibling resolves this directory rather than
`dist` — so there was nothing for TypeScript or a bundler to find. `@formancy/angular` has
carried those two fields all along.

The package's own suites never noticed, because they import `./builder` and friends by
relative path. Ninety-five tests, a published package, and no consumer could have written
`import { FormancyBuilder } from '@formancy/builder-angular'` — which is also, exactly, the
line a reader of its README would write first.

## Decision

**The two builders share one session.** A `BuilderSession` is the document, the undo stack and
the rules about which edits are legal; there is one document, so there is one session. Both
builders subscribe to it — the React one through `useSyncExternalStore`, the Angular one
through a signal — and neither knows the other exists.

That makes the demonstration stronger than the renderers'. The renderers get an engine each,
because element ids are minted per engine and two over one schema collide
([0095](0095-one-schema-two-renderers.md)). Here, an edit made in the Angular tree moves the
JSON, both rendered forms, and the React toolbar's Undo — and switching builders mid-edit keeps
everything, because there is nothing to keep in sync.

**The session and the current tab reach the Angular application through the injector**, not as
`input()`s. `bootstrapApplication` runs change detection before it returns, so a template
reading an `input.required` that nothing has set yet throws during the bootstrap; a provided
value exists from the moment the injector does. The tab is a signal inside that provided
object, so a tab change retunes the live application instead of rebuilding its tree and
throwing away focus and scroll position.

**And the manifest is fixed**, with the two fields `@formancy/angular` already had.

## Consequences

**The chooser is a labelled select, not a third pair of pressed buttons.** The two tab buttons
pick a part of one product; this picks which product. Giving them the same affordance said they
were the same kind of choice.

**A visitor can now do the thing the architecture claims.** Open the Build pane, make an edit in
the Angular tree, switch to React, and undo it. That is 0091's thesis — *what decides anything
is in `builder-core`; a builder package is markup and plumbing* — as an action rather than an
assertion.

**The selection is per builder, deliberately.** Each tree keeps its own cursor. The document
they edit is shared; where somebody happens to be looking is not, and pushing a selection across
would mean one builder moving the other's focus.

**The package's missing manifest fields are a lesson about what the suites cannot see.** Ninety-
five tests passing against relative imports say nothing about whether the package can be
imported, and `check:pkg` runs `publint` against `dist`, whose manifest ng-packagr generates
correctly. The gap was between those two facts, and only a consumer could fall into it. There is
now a consumer.

**The playground is the only consumer**, so this is demonstrated and not yet *used* anywhere a
deployment would use it. The admin app remains React-only, which is fine — it is one
application and it does not need two builders — but it means Angular builder parity rests on
the playground plus the package's own suites.

## Alternatives considered

**A session each, kept in step by copying the document across.** Rejected: it demonstrates the
opposite of the claim. Two sessions over two copies is two products that agree today, which is
precisely what a shared core exists to make unnecessary — and it would need an answer for whose
undo stack wins.

**Show both builders at once, as the renderers are shown.** Rejected on the screen rather than
on principle: two structure trees, two property panels and two logic panels side by side is four
scrolling regions in a pane that already holds three. The renderers are worth showing together
because a *rendered form* is small and comparable at a glance; a builder is an application. The
switch, over one session, makes the same point — switching mid-edit and finding your work and
your undo stack intact is the evidence.

**Add `exports` only to the built `dist` manifest.** Rejected because that is what already
happens: ng-packagr writes a correct manifest into `dist`, and it is published. The problem is
the *source* manifest, which is what a workspace sibling resolves, and the fix belongs there.

**Mount the Angular builder in the admin app instead.** Rejected: the admin is a product rather
than a demonstration, and giving a self-hoster a framework toggle in their form editor is a
choice nobody asked for. The playground exists to show how things work.
