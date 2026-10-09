# 0151 — A group placed whole is drawn as its fields

- **Status:** accepted
- **Date:** 2026-10-09
- **Deciders:** Daniel Bacher
- **Decides:** what [0150](0150-every-field-an-arrangement-places-names-itself.md) left open —
  what a group an arrangement places should draw
- **Verified by:** the conformance fixture *a group a layout places whole is drawn as its
  fields, on the page it belongs to* (`packages/conformance/fixtures/placed-group.json`), run
  by both renderers' drivers — React's and both of Angular's failed it with the renderers as
  they were. `packages/core/src/placed-group.test.ts` — what a placed group draws and in which
  order, and its page, where the engine threw. `packages/{react,angular}/src/layout.test` —
  drawn in a group named by its label, where the layout puts it; both failed before.
  `field-path.test` in both renderers — a placed group names itself once, no longer excluded.
  `packages/spec/src/i18n.test.ts` — a group placed whole is valid; one placed beside one of
  its own fields is refused at the field, in either order; and the fields a placed group
  draws count as placed. `packages/builder-core/src/arrangement.test.ts` — the pane offers a
  group whole, places it, then offers none of its fields, and refuses one of them beside it.

## Context

A layout node may name a group's path. The validator accepted it, since a group is a model
path like any other, and the arrangement pane offered a group among the fields still to
place. Neither renderer had a drawing for it: both asked the engine for a field at that path
and threw `Unknown field`, so a form whose arrangement placed a group did not render at all,
in the preview or in production. A paged form threw a step earlier, asking the engine which
page the group was on. Found by the guard 0150 added, recorded as D12 in the safety analysis,
and reachable in the playground by inserting its demo block — a group — and placing it.

Two answers were possible: refuse a placed group, or draw one. Refusing makes documents that
validate today invalid; drawing needs a meaning for it.

## Decision

**A group placed whole is drawn as its fields, under its label** — the way a labelled section
is: a real group named by the label when it has one, a box when it has none, holding the
group's fields in the order a form with no arrangement draws them, its fields and then its
repeaters. On a paged form it is drawn on the page its fields are on. What it holds and which
page it is on is decided once, in `@formancy/core`'s `placedGroup` and `placedPage`, and read
by both renderers — outside `engine.ts`, whose budget allows no growth.

**A group placed whole and one of its own fields placed as well is refused**, at the field,
with its own sentence: the group draws the field already, and twice would be two controls
bound to one answer — the rule against placing a field twice, reached through a group. No
document that rendered becomes invalid: any document that placed a group threw.

**The fields a group placed whole draws count as placed**, and a group one of whose fields is
placed is not offered: `unreferencedPaths` listed both, so the pane offered placements the
validator would refuse.

## Consequences

**A group can be arranged as one node**, and the playground's demo block, a group, can be
placed whole in the arrangement pane without breaking the preview.

**The renderers emit two more parts**, `group` and `group-heading`, which every shipped theme
dresses as it dresses a labelled section — in `paper`, that includes the section's numbering.

**It costs `@formancy/core` half a kilobyte**: 20.8 kB brotli against 20.3 before, measured
on the date above, over a budget of 18 that it was already over.

**Inside a group placed whole, the order is the model's.** An arrangement that wants the
group's fields in another order, or split across rows, places them one by one, as it always
could.

## Alternatives considered

**Refuse a placed group in the validator.** Smaller, and it would have stopped the crash; but
it makes documents valid in a published version invalid, and leaves a group — the one model
construct that is a unit — as the one thing an arrangement cannot place as one.

**Draw a placed group as nothing.** It would stop the throw and hide the fields, which is
worse: a form missing questions without saying so.

**Teach the engine's `pageOf` about groups.** The question is a renderer's, about an
arrangement; and `engine.ts` has no budget for it.
