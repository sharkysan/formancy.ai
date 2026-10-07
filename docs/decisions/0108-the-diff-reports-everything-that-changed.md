# 0108 — The diff reports everything that changed, and never answers nothing

- **Status:** accepted
- **Date:** 2026-10-08
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/spec/src/diff.test.ts`. A table of fourteen real edits, each
  asserting the kind and the severity it must be answered with; a case that no edit in
  that table falls through to either backstop, which is what stops the table being
  satisfied by one catch-all; and two cases that a change with no comparator is reported
  and classified `lossy` rather than swallowed. **Thirteen mutations were watched to
  redden exactly their own cases** — one per comparator, one per branch of the constraint
  direction table, and one that drops the path boundary in the rename translation. A
  fourteenth reddened nothing and found dead code, which was deleted rather than tested.

## Context

`diffSchemas` is the function draft migration, the builder's *what changed before you
publish* view, export column unioning and the consumer CI compatibility gate all read
from ([0015](0015-diff-before-server.md)). It reported seven kinds, every one of them
about a field's identity, its type or its `required` flag.

Everything else produced **no change at all**:

| edited | reported |
|---|---|
| an option withdrawn from a radio | nothing |
| a `maxLength` halved, a `pattern` added | nothing |
| a `visible` rule added, removed or rewritten | nothing |
| a message catalogue rewritten, a locale added | nothing |
| a layout rearranged | nothing |
| a field relabelled | nothing |
| the form's `title` or `id` changed | nothing |

So two materially different documents diffed to `[]`. That is worse than a wrong
severity: an empty answer tells all four readers that nothing happened. A draft rebinds
silently against a form that now rejects it; a publish review shows an empty list and
somebody approves it.

The option case loses data outright. A submission holding `"post"` against a radio that
no longer offers it carries a value outside the document's own vocabulary, and the
function whose job is to say so said nothing.

## Decision

**Every area of the document has a comparator, and anything without one is still
reported.**

Two questions are kept apart, which is what the severity already meant and nothing
stated: **what changed** is the length of the list, and **what it costs the data** is
the severity. `compatible` now carries real weight — a rewritten translation, a
relabelled option, a rearranged layout are all *changes*, all reported, and all cost the
stored answers nothing.

New kinds, with the reasoning that fixes each severity:

| kind | severity | why |
|---|---|---|
| `field.optionRemoved` | lossy | A stored answer is now a value the document does not define. |
| `field.optionAdded` | compatible | Nothing that was answered becomes wrong. |
| `field.optionRelabelled` | compatible | The submission stores the `value`; the label is what a person read. |
| `field.constraintTightened` | lossy | What used to pass may not. |
| `field.constraintRelaxed` | compatible | Every stored answer stays valid. |
| `field.relabelled` | compatible | The answer keeps its path — though it was given to the old wording. |
| `rule.added` / `.removed` / `.changed` | lossy | `visible` with `clearOnHide` decides whether an answer is kept at all; `required` decides whether a submission is still complete; `computed` overwrites what was stored. |
| `text.changed` | compatible | A catalogue says how a question reads, never what it stores. |
| `layout.changed` | compatible | A layout places fields; identity is the data path and a layout has no say in it. |
| `document.relabelled` | compatible | A title. |
| `document.identityChanged` | lossy | Anything addressing the form by `id` is addressing something else now. |
| `field.changed` | lossy | **Backstop.** A field property with no comparator. |
| `document.changed` | lossy | **Backstop.** A top-level area with no comparator. |

### The two backstops are the decision, not the tidying-up

`lossy`, deliberately. A change nobody examined must not be called harmless, and `lossy`
is the conservative direction that is still useful: the draft rebinds and somebody is
told, where `breaking` would make them start over. `clearOnHide` is the example that
settles it — it decides whether a hidden field's answer survives, nothing compares it by
name, and it must not be silent.

They are also the only part of this that survives the format growing. A section added to
`FormSchema` and forgotten here is reported rather than ignored, which is the property
that made the original defect possible and is now impossible.

**And the test suite guards against the backstops becoming the implementation.** One
`document.changed` covering everything would satisfy "never silent" while classifying
nothing, so a case asserts that no edit in the table reaches either backstop.

### A declared rename carries its rules

`renamedFrom` promises that a rename costs the data nothing. A field lives in four places
and the builder rewrites all four in one edit, so the first version of the rule
comparator reported the rewritten expression as a rule that "says something else now" —
and the promise held for the fields while breaking on their logic. Caught by
`builder-core`'s own test, not by this package's.

So the before-side is read as though the renames had happened, by **textual substitution
on path boundaries**. `@formancy/spec` sits below `@formancy/expressions`
([0008](0008-layered-packages.md)), so there is no CEL parser here and there must not be
one. What makes the substitution safe is the direction of the comparison: a substitution
that is wrong produces an expression that does not match the real one, and the rule is
then reported as changed — the conservative answer. Only an exact match is read as *this
expression followed a renamed field*, and an exact match is what a correct repath
produces.

## Consequences

**Nothing is newly refused, and some things are newly reported.** Only `breaking` makes
a resumed draft read-only, and nothing here is breaking. A draft resumed against a
version where only a rule, an option or a bound moved now rebinds **with a migration
report** where it used to rebind in silence — because the diff used to report no change
at all for those. `migrateDraftData` acts on `field.removed` and ignores every other
kind, so the data path is unchanged; what an integrator sees is a report they did not
get before, about a change that was always there.

**`@formancy/spec`'s barrel grew 4.3 kB brotli**, from 9.7 to 14.0. Recorded in
[§9.3](../architecture/09-quality-requirements.md) with the reason. `sideEffects: false`
lets a bundler drop the diff from a consumer that never imports it — but there is no
`./diff` entry point, so a consumer wanting only the diff takes the barrel and relies on
tree-shaking. Worth a second entry if anybody measures it mattering.

**A rule edited in the same version as a rename, in a way the repath happens to
reproduce, would be read as part of the rename.** The blind spot of doing this without a
parser. It needs the edited expression to be *character-identical* to the mechanically
repathed one, which means it is not an edit at all — but it is the residual, and it is
why the comparison is written to fail towards "changed".

**Rule identity is `target`, `kind` and `code`.** A rule has no id in the format. Two
`validate` rules on one field are told apart by their codes; two rules identical in all
three are one rule as far as this function is concerned. A rule *moved* between two
targets reads as one removed and one added, which is the same conservative answer the
field walk gives for an undeclared rename.

**Every rule change is `lossy`, including ones that are not.** Adding a `visible` rule
that can never be false costs nothing, and this function says it might. Evaluating a rule
against the data to know better is the engine's job and would make a pure comparison
depend on a submission. The cost is a migration report somebody reads and dismisses; the
alternative is a draft silently rebound past a rule that now hides half of it.

**`diff.ts` split into three.** The size budget refused the additions at 694 lines, and
the seam it named is real: `diff-fields.ts` for a field's identity and what it will still
accept, `diff-rules.ts` for behaviour and the one place that touches expressions, and
`diff.ts` for the orchestration and the document-level areas. `same` — canonical equality
that tolerates an absent value — moved to `canonical.ts`, where it belongs, now that
three files need it.

## Alternatives considered

**Leave the severity model alone and only add kinds.** What this does, and worth naming:
no existing severity changed, so `staleVersionPolicy: acceptCompatible` behaves as it did
for every edit it already saw. What changes is that edits it used to not see at all now
produce a severity — which is the point, and is also why this is a decision record rather
than a bug fix.

**A generic structural diff of the two canonical documents, classified afterwards.**
Structurally incapable of silence, which is attractive. Rejected because the useful half
is the classification, and a generic walk produces a path list rather than *"this radio no
longer offers `post`, and submissions carry it"*. The backstops give the same guarantee
for the parts nobody has classified yet.

**Report unexplained changes as `compatible`.** It would stop a cosmetic edit to an
unclassified property triggering a migration report. It also means the first thing a new
format section does is get waved through as harmless, which is exactly the failure
`SAFETY-ANALYSIS.md` E3 describes.

**A `changed` boolean beside the severity.** The brief asked to separate *changed* from
*affects existing answers*, and this is one way. The separation already exists —
`compatible` means changed-but-free — and a second field would be two spellings of one
fact, with the usual question of what happens when they disagree.
