# 0133 — The Angular starter is the builder and the form, side by side

- **Status:** accepted
- **Date:** 2026-10-09
- **Verified by:** `apps/angular-starter/src/app/app.test.ts` — it opens on the expense
  claim with the builder's tree on one side and the form drawn with Angular Material on the
  other, the receipt drawn by the default file control because the starter supplies an
  uploader; a large expense asks why and an untouched form does not; a claim filled in and
  submitted is shown as data; and an edit in the builder reaches the form. Removing the
  rule's `has()` guard, the Material registry, the uploader, or the preview's dependency on
  the edited document each fails a named case. `pnpm build` builds it, and
  `apps/docs/src/codecov.test.ts` holds its coverage component.
- **Deciders:** Daniel Bacher

## Context

The backlog asked for a complete Angular starter app beside the Material adapter
([0132](0132-material-draws-what-it-has-an-equivalent-for.md)). The repository had the
pieces — two Angular packages and an adapter — and the playground, which mounts them inside
a React page. Nothing showed an Angular developer what an Angular application built on them
looks like, start to finish.

## Decision

**The builder and the form it builds, side by side, in one Angular application.** A form
alone would be a demo of the renderer; the reason to choose formancy in Angular is that the
builder is Angular too. The left pane is `@formancy/builder-angular` over one session, the
right is that session's document drawn with `@formancy/angular/material`, re-made as an
engine whenever the document changes, and a submitted claim is shown as the data a server
would receive.

**An expense claim, because it needs what real forms need** — a repeater, a file per row, a
rule over the rows, a required tick — and because it shows both halves of the adapter:
Material for most fields, the default control for the file.

**Everything the host decides is in three files.** The document, the panels and the submit,
and how a document becomes a form — the clock, the registry, the uploader. Nothing else names
a field, so replacing the document is replacing one file.

**Vite and Analog's Angular plugin**, the toolchain the repository's Angular packages are
tested with, rather than the Angular CLI. The CLI would be one more build system in CI for
one application; `src/app` is plain zoneless Angular, and the README says that a CLI project
takes it unchanged.

**One engine, one environment injector, one lifetime.** The preview makes an environment
injector per document in an effect and destroys it in the effect's cleanup, which is where
`provideFormancy` stops a form's uploads ([0130](0130-each-file-is-its-own-upload.md)).

## Consequences

**It is not deployed.** It builds and is tested in CI; putting it on the site is the website's
decision, with the page that argues for an Angular form builder.

**Its uploader keeps bytes in the tab**, and says so in the storage key, as the playground's
does. The README shows the two requests a formancy server asks for.

**The rule a starter most needs to get right was the one first written wrong.** A total across
the expenses was the obvious rule, and CEL has no `sum` and no fold; the rule asks whether any
expense is over the limit instead, and guards each row with `has()` — without it a row nobody
has typed into throws, and a `visible` rule that throws shows the field it was meant to hide.
Removing the guard fails a case.

## Alternatives considered

**A form-only starter.** Smaller, and it would leave the builder — the part an Angular team
would otherwise have to buy — out of the one place that shows how to wire it.

**The Angular CLI.** What `ng new` produces, and familiar; a second build system to keep green
for one application, when the components and providers are the part worth copying.

**A starter in its own repository.** Copyable as it is; not built or tested with the packages
it depends on, so it would break silently the first time one of them changed.
