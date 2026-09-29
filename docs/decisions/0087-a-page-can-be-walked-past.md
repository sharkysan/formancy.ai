# 0087 — A page can be walked past, and its questions go with it

- **Status:** accepted
- **Date:** 2026-09-29
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/spec/src/skip-rule.test.ts` for the format and
  `packages/core/src/skip.test.ts` for the walk — seven cases, of which *'does not hold the
  form up with an answer nobody was asked for'* is the one that matters and
  *'and going back, which is where this is usually got wrong'* is the one that usually
  ships broken. Both renderers are held by the stepper cases in their `new-types` suites,
  by role and accessible name.

## Context

Conditional page routing was the last thing the roadmap deferred, and it was deferred for
a reason that has stopped being true: it was not worth building while a wizard was
something only a developer could make. [0081](0081-a-page-absorbs-the-form-it-joins.md)
changed that, and a rule kind costs a spec version whenever it lands — so the choice was
to put it in version 3 beside `check`, or to spend version 4 on it alone.

The shape question was whether this is a new kind at all. `visible` already means "shown or
not, and a hidden field is not validated", which is most of what skipping a page means.

**Measured before writing anything:** a `visible` rule aimed at a page is refused, with
*"No field has the data path `p2`"*. Pages are transparent for data — that is what makes a
paged and an unpaged form produce the same submission — so a page has no data path to
target. Making `target` mean a key here and a path everywhere else is the ambiguity this
format refuses elsewhere, so it is a kind of its own.

## Decision

**`kind: "skip"`, whose target is a page's key.**

```jsonc
{ "target": "visaDetails", "kind": "skip", "cel": "needsVisa != true" }
```

**The fields on a skipped page are hidden**, which is what keeps them out of validation and
out of the submission. This is the half that makes conditional routing dangerous when it is
missing rather than merely absent: a required answer on a page somebody never saw is a form
that cannot be submitted and will not say why, with the error on a page they cannot reach.

**A skipped page is walked past in both directions.** Skipping it going forward and stepping
into it going back is the shape nobody can reason about, and it is how this is usually got
wrong.

**Page indices stay absolute.** A skipped page is walked past rather than removed, so
`page()` means what it always meant and `pageOf(field)` still compares against it.
`engine.pages()` marks each entry `skipped` instead of returning a shorter list, because a
list with holes and an index that counts them differently are two numbers that disagree
about the same page.

**`canGoNext()` and `canGoBack()` replace index arithmetic in the renderers.** `page <
pageCount - 1` stopped being the question the moment a page could be walked past: the last
live page is not always the last page, and a form whose final step offered "Next" would
have a button that does nothing.

**A skip rule cannot carry `runsOn`.** Which pages a form has is not a matter of opinion: if
the browser walked past a page the server did not, the server would validate answers the
person was never shown. That is the same rule the metadata kinds follow
([0043](0043-runs-on.md)).

**A rule that cannot evaluate does not skip.** Failing open is right here and nowhere else:
a page hidden by a broken expression takes its questions away silently, while a page shown
in error is visible and answerable.

## Consequences

**The wizard carries a revision, and that is not bookkeeping.** Walking past a page changes
which steps exist while leaving the position alone — so a binding whose store snapshot was
the page number saw the same number and did not re-render, and the stepper went on naming a
step the form had stopped taking. React's `useWizard` reads `revision()`; the Angular
binding sets four signals on every notification for the same reason. Found by a test that
asserted the stepper after an answer changed, not by reading the code.

**A form can now end on a page nobody reaches.** Skip the last page and the one before it
offers Submit, which is correct. Skip *every* page and the wizard has nowhere to stand;
nothing refuses that document, because whether every page is skipped depends on the answers
and is not knowable at publish.

**The builder cannot write one yet.** A skip rule is authored by hand or by an agent, as
every rule kind is before the condition editor learns it. The editor compiles conditions to
CEL already, so this is a target picker and a kind, and it is named in the roadmap rather
than implied to exist.

## Alternatives considered

**`visible` on a page.** Rejected on the measurement above: a page has no data path, so
`target` would mean two different things depending on the kind of the thing it names.

**A `next` expression per page**, naming which page follows — the shape form.io uses.
Rejected because it turns a form into a graph: a page's successor becomes an expression,
unreachable pages become possible, and "what are the steps" stops having an answer without
evaluating the whole form. A skip is a filter over a list, which is still a list.

**Skipping without hiding**, leaving the fields validated. Rejected immediately: it is the
form that cannot be submitted and will not say why.

**Removing skipped pages from `pages()` and renumbering.** Simpler for a stepper and wrong
everywhere else: `pageOf(field)` returns an absolute index, `goTo` takes one, and the error
navigation that uses them would land on the wrong page the moment an answer changed.
