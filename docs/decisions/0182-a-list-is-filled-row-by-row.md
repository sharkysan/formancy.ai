# 0182 — A scenario fills a list row by row, and a path that is not one answer says what it is

- **Status:** accepted
- **Date:** 2026-10-18
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/core/src/scenarios.test.ts`, *a path that names something other
  than one answer*. Against the runner before this, every case naming a list, a group, a row,
  a row's field without its position, a rule's `[]`, a page or a repeater inside a row failed:
  each was given the sentence a field that is not there gets, which the cases compare against
  rather than match words in. So did `visible` on a field in a row the list does not have,
  which held. The cases that passed before are the other direction — a field that is not there
  still gets the rename sentence — and the advice itself: rows named by position fill the list.
  Six mutations were each caught: offering a path without asking the engine whether it takes
  it (*offers nothing*), a list's example without the row's position (*a repeater named
  whole*), the new sentence given to `changes` alone (*said the same wherever an example names
  it*), pages not looked through (eight cases), the row check on `visible` taken out (*neither
  shown nor hidden*), and a write past a list's last row dropped (*the spelling it offers fills
  the list*). `packages/builder-core/src/scenario-drafts.test.ts`: *what a Keep did outranks
  what the run came to* fails with the refusal's old sentence, and *nor can one naming a list
  whole* holds that such a draft is refused.
- **History:** on 2026-10-18 the engine came to answer at a list's own path — a repeater's
  bounds and the rules aimed at it are reported there, and a rule hides it whole — so `errors`
  and `visible` may now name a list, as *An expectation about a list as a whole* below said
  they would have to ([0184](0184-a-repeater-is-validated-as-a-field-is.md)). Setting a list
  whole, and `values` or `absent` on one, stay refused as this record decided. That paragraph is
  left as it was written.

## Context

An agent building a conference registration in the admin — a repeater `colleagues` of up to
three rows, a fee in each, and a figure worked out from the list — wrote examples for it. One
filled the whole list in one step, `"changes": { "colleagues": [ … ] }`, and was told:

> This form has no "colleagues". A scenario naming a field that is not there checks nothing —
> it was probably renamed.

The form has that list. [0110](0110-a-form-is-checked-against-examples.md) made a path the form
does not have a failure, so a renamed field cannot leave its examples passing while they check
nothing. The check asks the engine for the field's snapshot, and the engine has snapshots for
answers only: a list, a group, one row and a page have none, so every one of them got the
sentence for a rename. That sentence sends somebody looking for a rename that never happened,
or deleting an example as stale, and says nothing of what they needed, which is how a list is
named.

How one is named was decided in passing by
[0162](0162-an-example-is-drafted-from-what-the-author-said.md): *a group or a repeater is not
a path an example sets; a field in a repeater's row is named by its position, as
`items[0].note`*. A model drafting examples is told so. Nobody else is — not an author writing
an example by hand, not an agent calling `check_scenarios`, whose description says nothing of
paths — and the one thing that would have told them, the failure, said something else.

Two answers were open: let a scenario set a list whole, or keep 0162's spelling and say it.

## Decision

**A scenario fills a list one answer at a time, by the row's position from 0, and does not set
it whole.** `colleagues[0].fee` and `colleagues[1].fee` make a list of two, because naming a row
the list does not have yet adds it. A list named whole is a failure, as it was; what changes is
what the failure says.

**A path that is not one answer says what it is**, and offers a path to name instead:
`scenario-paths.ts` in `@formancy/core` walks the document along the path the way the engine
scopes it — a group and a row scope their fields, a page scopes none — and the sentence names
what it found. A list: *"colleagues" is a repeater, a list of rows, not one answer. A scenario
names a field in one of its rows by the row's position from 0, as "colleagues[0].who". Naming a
row the list does not have yet adds it.* A group, one row, a row's field without its position
(`colleagues.fee`), a rule's spelling for every row (`colleagues[].fee`), a page, and a repeater
inside a row — which `validateSchema` refuses and the engine opens anyway — each get their own.
A path is offered only when the engine takes it, because a second wrong path is worse than
none. A field that is not there still gets the rename sentence.

**The check is the same for every key an example has**, `changes`, `errors`, `visible`,
`values` and `absent`, because they all go through it before anything is set.

**`visible` on a field in a row the list does not have is a failure.** The engine answers for a
row's field whatever the number of rows, so the snapshot said *visible* of a third colleague
when there were two, and the expectation held — green about a field nobody can see. Whatever
was expected, the answer now is that the row is not there.

**The drafting part's refusal is true of both.** A draft that names a list whole is refused
like one naming a missing field, since neither runs; the refusal said the draft *names a field
this form does not have*, and now says it names something that is not one of the form's
fields. The draft's verdict, beside it, says which.

Every surface that shows why an example fails shows the runner's sentence — both scenario panes
and the drafting part's verdicts, `check_scenarios`' results and the publish's warnings
([0166](0166-a-deployment-keeps-a-forms-examples-and-runs-them-at-publish.md)) — so it is
decided once, here.

## Consequences

**What it buys.** The sentence that meets somebody filling a list tells them how, in the same
words wherever they meet it, and a fix that follows it holds: the case that takes the offered
spelling fills the list and the figure worked out from it sees every row.

**What it costs.** A scenario cannot remove a row the starting answers have, nor empty a list
they fill: the sample decides how many rows there are to begin with, and a scenario can only
add to them and change what is in them. An example about fewer rows than the sample has needs a
sample with fewer. Naming a row past the next one leaves the rows between empty — naming only
`colleagues[1].fee` puts an empty row 0 before it, whose required fields then fail — and rows a
scenario adds are written through their path rather than by `addRow`, so they carry no row id,
which nothing a scenario can expect reads.

**`@formancy/core` grows from 21.2 to 22.1 kB**, re-measured on 2026-10-18, for the walk and its
sentences ([§9.3](../architecture/09-quality-requirements.md)). The module's comments are block
comments rather than JSDoc, because the bundler keeps JSDoc and nothing outside the package
calls it.

**An expectation about a list as a whole stays refused, and it would have to change if the
engine ever answered there.** The engine validates fields, and a list is not one, so it reports
no error at a list's own path — a repeater's `maxItems` is enforced by nothing, as
[§11.2](../architecture/11-risks-and-debt.md) carries, and a list of four rows under
`maxItems: 3` passes as valid. An `errors` on `colleagues` has nothing to compare with today. The day the engine reports
a list's bounds at the list's path, `errors` will need to name it, and this check will need to
let it.

## Alternatives considered

**Let `changes` set a list whole.** The engine's `setValue` writes any path, so it would run. It
lost on three things. `changes` is a map with each path once, and a list and its rows' fields
would be two spellings of one answer in it: `colleagues` and `colleagues[0].fee` together, and
the order of the keys decides which wins. The engine has no answer at a list's path to compare
an expectation with — no snapshot, no visibility, no error — so a list accepted in `changes`
would be refused under every expectation, two rules for one path. And 0162 tells a model
drafting examples the opposite, so a hand-written example and a drafted one would be written in
two vocabularies the runner both accepts. It would have bought removing rows, which nobody has
needed yet; the honest way to add that is the list of steps 0110 names, not a second spelling.

**Read a list set whole as its rows' paths.** It keeps one vocabulary underneath and gives the
author the shape they wrote, and it cannot remove a row either, so it buys the spelling and not
the capability — while making `"colleagues": [{ "fee": 100 }]` mean *change row 0's fee* on a
sample with three rows, which is not what it says.

**Change only the sentence for a list.** The report was about a list, and a group, a page and a
row's field without its position met the same sentence through the same check. Fixing one would
have left the others telling somebody the form has no `home` while it shows them the address.

**Say it in `check_scenarios`' description instead.** An agent reads it once and an author
writing by hand never; the failure is read by everybody whose path is wrong, at the moment it
is.
