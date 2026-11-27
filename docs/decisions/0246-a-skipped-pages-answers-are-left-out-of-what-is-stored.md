# 0246 — A skipped page's answers are left out of what is stored, not out of what is judged

- **Status:** accepted
- **Date:** 2026-11-27
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/core/src/skip.test.ts` — *what a skipped page holds*, *a skip
  reading the page it walks past*, *a rule reading what a skipped page holds*, and *the replay
  of what the browser hands over*, which reaches each state answer by answer in the browser,
  replays exactly what `value()` hands over in server mode and asks for the same verdict, the
  same errors, the same pages and the same `submission()` — and, for the server,
  `packages/server-core/src/use-cases.test.ts` (*never trusts the client with a page the answers
  walk past*). Removing the strip, letting it ignore `clearOnHide`, or hiding a skipped page's
  fields in the set a `visible` rule switches each fails at least one of them, and the replay
  cases fail against an engine whose `value()` leaves the answers out.

## Context

[0087](0087-a-page-can-be-walked-past.md) says the fields on a skipped page are hidden, "which
is what keeps them out of validation and out of the submission". Only the first half was built.
Measured on 2026-11-26 against `main`, and read from `0.3.0`'s code, the first release with a
`skip` rule: the server's replay of `{ "needsVisa": false, "passport": "X123" }`, with the
passport page skipped, stored the passport number. The browser sent what was typed on a page
before the answers walked past it, and a default on a page skipped from the start, and the
server stored both.

Two repairs were built and measured before this one.

**Pruning the store**, as [0013](0013-hidden-field-semantics.md) does for a field a rule hides.
A skip that reads its own page undid itself: a payment page walked past when `total == 0.0`,
with the computed total on it, lost the total it read, came back, and its required card refused
the submission at a quantity of nought, where `main` walked past it. Two pages each walked past
by a defaulted answer on the other ran each other out of stack, for a document validation
accepts. The dependency graph that refuses a loop among computed rules does not hold skips,
whose target is a page.

**Leaving the answers out of `value()`**, which a binding sends and the server replays. The
browser's rules judged with the answers and the replay's without them, so the two disagreed:
an answer required when a skipped page holds none was accepted in the browser and refused by
the server, a field shown because of a skipped answer was asked in the browser and dropped by
the server, and a fee computed from a default on a skipped page was 60 in the browser and 0 as
stored. That is the disagreement [0006](0006-one-engine-build.md) exists to make impossible.

## Decision

**What a skipped page holds is judged as it always was and left out of what a response stores.**
`value()` is unchanged: what a binding sends, what a draft keeps, and what the server replays
and judges, so the replay sees exactly what the browser saw. The engine's `submission()` is
`value()` without each field, group and list standing on a page the answers walk past, whole,
unless its own `clearOnHide` is false, as a group a rule hides is
([0184](0184-a-repeater-is-validated-as-a-field-is.md)). The server stores `submission()`, hands
it to webhooks, and checks a sourced answer's membership and claims files from it.

**A skip and a `visible` rule are two reasons to hide a field, and either hides it.** They had
shared one switch, so the next answer anywhere re-ran a field's own rule and showed it again on
the page nobody could reach.

## Consequences

**What it buys.** Every rule decides exactly as it did, in the browser and on the server alike,
so no form `main` opened is refused or looped and the replay agrees with the browser. What is
stored is what the person was asked.

**What it costs.**

- **A withdrawn answer still drives the rules.** A passport number typed before the person said
  they need no visa after all still shows the field it showed and still feeds the fee computed
  from it; the field and the fee are stored, the passport number is not. So a stored response can
  hold a value computed from, or a field shown because of, an answer it does not hold, and
  replaying the stored response alone would not give back the same fee. Pinned by *reads it as it
  did before*, so that changing it is a decision rather than an accident.
- **Walking back into a skipped page finds what was typed there**, where a field a rule hid and
  showed again opens fresh unless `clearOnHide` is false (0013).
- **A host that stores a binding's value without replaying it stores the answers**, as it did
  before. The engine's own guidance names `submission()`.
- **A response stored before keeps what it was stored with.** Responses never migrate, and
  nothing here finds them for the operator.

**What it forecloses.** Leaving a skipped page's answers out of `value()` while the rules read
them, and pruning them from the store without first refusing every skip that reads, directly or
through other rules, an answer on a page it can walk past.

## Alternatives considered

**Prune them from the store, as 0013 prunes a hidden field.** Built and measured, above.

**Leave them out of `value()`.** Built and measured, above.

**Withdraw them from every rule, and refuse at publish every skip that reads, directly or through
other skips, an answer given on a page it walks past.** A stored response would agree with
itself, at the price of refusing a page with a *does not apply* box that walks past itself, and
every published version like it — a breaking change, with the `MIGRATIONS.md` procedure that goes
with one — and of re-running every rule until the skips settle, which the engine does not do from
inside a pass.

**Hide the fields and leave the answers in what is stored, as before.** The response carries
answers to questions the person was never asked, against 0087.
