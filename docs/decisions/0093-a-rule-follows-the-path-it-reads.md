# 0093 — A rule follows the path it reads, by splicing spans the parser reports

- **Status:** accepted
- **Date:** 2026-10-02
- **Extends:** [0011](0011-declared-renames.md), which made a rename a declaration and
  handled the data; this handles the logic. Builds on
  [0018](0018-static-dependencies.md), whose static reference extraction is the walk this
  reuses, and on [0060](0060-documentation-is-checked.md) for why the table it added to the
  documentation is parsed and evaluated rather than proofread
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/expressions/src/rewrite.test.ts` (14 cases). Observed failing
  four ways by mutation: rewriting only the first occurrence, splicing left to right,
  dropping the verification, and swapping the AST walk for a correctly-escaped regular
  expression with word boundaries — which still fails **4 of the 14**, and those four are
  listed below. `packages/builder-core/src/rules-follow-paths.test.ts` (14 cases) covers the
  two commands, including that a refusal leaves the document untouched.
  `packages/builder-core/src/session.test.ts` holds the three cases that asserted the old
  refusal, turned around rather than deleted. `apps/playground/src/wizard.test.ts` runs the
  demo's grouped-path condition against a real engine in all three states.
  `apps/docs/src/empty-answer-guards.test.ts` parses the table this change added to
  `concepts/logic.md` and evaluates every row, observed failing both by changing a verdict
  and by deleting a row.

## Context

Two builder commands change where an answer lives: `renameField` moves `postcode` to `zip`,
and `unwrapField` moves `address.city` to `city`. A rule names a field in **three** places —
its `target`, its `cel` condition, and the `editor` metadata the logic panel reopens from —
and none of the three followed.

`unwrapField` refused, with a message that was honest about why:

> A rule's condition is CEL, which this cannot rewrite without pattern-matching source, so
> change or delete the rule first.

`renameField` did not refuse. **It succeeded.** The field was renamed, the layouts followed,
and the rule was left reading a path no field had. That is worse than the refusal in every
respect, and it is worth being exact about how it fails: the engine types an unknown leaf as
`dyn` so the condition still compiles; `validateSchema` checks a rule's *target* and not the
paths inside its condition, so the document still publishes; and `postcode == "8000"`
evaluates as `null == "8000"`, which is `false` for the life of that immutable version. A
field that was conditionally visible is simply never shown again. Nothing reports it at
authoring time, at publish time, or at run time.

The roadmap said `renameField` refused, and a comment in `session.test.ts` said the same —
*"which is what `renameField` already does to the same document for the same reason"*. Both
were wrong, and the wrongness is why nobody had looked: the behaviour everyone believed was
in place was the safe one.

## Decision

**A path rewrite moves all three, and the condition is rewritten by splicing the source
spans the CEL parser reports.**

`rewritePath(source, from, to)` in `@formancy/expressions` parses the expression, finds the
nodes whose resolved path is exactly `from`, and replaces those character ranges. Three
properties follow from that and none of them need arguing about:

- **It cannot be fooled by a name.** `postcode_uk` is a different node with a different
  span, and `"postcode"` inside a string literal is not a path node at all.
- **It preserves the author's text.** Spacing and the choice between `address.city` and
  `address["city"]` survive, because everything outside the matched spans is untouched. The
  published document is diffed in git, and a reprinter would show changes nobody made beside
  the one somebody did.
- **It needs no precedence logic.** The replacement is always a path, and a path binds
  tighter than every operator, so it can never need bracketing. That is a constraint on the
  function rather than a lucky property: `to` is parsed and refused unless it reads back as
  exactly one path.

**The splice is the mechanism; the verification is the guard.** The result is parsed again
and asked what it reads, and that is compared against what the input read with the rename
applied. A rewrite that passes cannot have lost a reference, invented one, or had its new
name captured — and *capture is real*: renaming `postcode` to `zip` inside
`items.all(zip, zip.n > postcode)` produces a perfectly correct splice whose text is valid
CEL meaning something else. Catching that by reasoning about scope a second time would be a
second place to be wrong. Comparing the read sets is one place, and it is the property the
callers actually depend on.

**A rewrite that cannot be made safely refuses the whole command**, naming the rule. Half a
rename is the state the author was being protected from.

**One walker, shared.** `referencedPaths` and `rewritePath` both read `chains.ts`, because
what counts as a field and what is a local bound by a comprehension or by `bind()` has to be
**one** answer: those two answers are the dependency graph and the text of the rule, and a
document where they disagree is a form whose logic reads a path nothing recomputes.

## Consequences

**A regular expression was not the lesser option, it was the wrong one.** Tried, with
correct escaping and word boundaries — the shape `rulesTouching` used — it fails four of the
fourteen cases: it rewrites a field name inside a **string literal**, corrupting what the
condition compares; it misses `address["city"]` when renaming `address.city`, so a rule
written one way survives a rename that fixed the other; it rewrites a **comprehension's own
iteration variable**; and it cannot detect capture. The first two are silent and produce
documents that validate.

**`rulesTouching` is gone, and it was over-refusing.** It matched `rule.cel` by pattern, so
`note == "address"` — which reads `note` and nothing else — blocked an unwrap and named a
rule that had nothing to do with it. The command was unavailable on documents it was always
safe for.

**The budget named the seam, again.** `session.ts` grew past its ceiling, so the "a path
moved, make the document follow" family left for `repath.ts`: eight functions, one subject,
and `session.ts` is 80 lines smaller than before this change rather than 70 larger.

**Building the demo found a second defect, in the engine's authoring surface rather than in
this.** A condition reading into a group — `address.country == "CH"` — **errors** on an
untouched form, because the group itself is null, and a `visible` rule that errors fails
open, so the field it was meant to hide was on screen from the start. The obvious repair,
`address.country != null && …`, errors identically: it has to read the path to compare it.
Only `has(address.country)` answers. That is the same family as `needsVisa != true`
([0059](0059-proof-of-work-not-a-captcha.md) is the other instance of measuring finding a
design error) and it is now documented with a table, in
`SAFETY-ANALYSIS.md` A5, and held by a guard that evaluates every row.

**It covers the builder, not the document.** A form written by hand or by a script can still
publish a rule reading a path no field has, and `validateSchema` will not refuse it — the
`dyn` typing that makes an unfinished form editable is what makes that indistinguishable
from a rule about a field somebody is about to add. Recorded as the residual on
`SAFETY-ANALYSIS.md` B1a rather than fixed here, because refusing it is a spec-level
decision about whether a form may be authored in pieces.

## Alternatives considered

**Keep refusing, in both commands.** Rejected because the refusal was never the real
behaviour: `renameField` was silently breaking rules, so "refuse" would have been a *new*
restriction on the more commonly used of the two commands, and the restriction lands on
exactly the forms most worth renaming fields in — the ones with logic.

**Reprint the AST instead of splicing it.** Rejected on two counts. It needs a complete CEL
printer with correct precedence and parenthesisation for every node type, which is a large
surface whose bugs are silent changes of meaning; and it normalises the author's whole
expression, so every rename produces a diff in which the real change is hidden among
reformatting.

**Match by pattern, carefully.** Rejected on measurement rather than principle — the four
failures above, two of them silent. The repository has six recorded cases of a guard's own
regular expression being the defect, and this would have been the seventh with a worse blast
radius, because it writes rather than checks.

**Rewrite `editor` by regenerating it from the new CEL.** Rejected: `editor` is richer than
the CEL in one direction (it remembers which operator the author picked from a list) and
poorer in the other (it cannot express an ejected expression at all), so regenerating it
would quietly discard authoring state on every rename. Repathing the `field` of each
condition changes exactly what moved.

**Drop `editor` on a rewrite**, since it is regenerated metadata. Rejected for the same
reason, one step further: dropping it means the next opening of the logic panel shows an
empty condition where the author had one, and the only way to get it back is to retype it.
