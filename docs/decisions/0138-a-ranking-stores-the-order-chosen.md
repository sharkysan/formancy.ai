# 0138 — A ranking stores the order chosen, starts empty, and is put in order with buttons

- **Status:** accepted
- **Date:** 2026-10-09
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/spec/src/ranking.test.ts` — a ranking is a list-valued type,
  accepted in version 4, refused in version 3 **with version 4 named**, needs two options
  whose values differ, may carry `minItems`/`maxItems` and not `optionsSource`.
  `packages/core/src/ranking.test.ts` — it starts empty, stores the order chosen, required
  means something ranked, the bounds bound it, and a repeated value, an unoffered value and
  a string are refused in client and server mode; it reads as a list in a rule.
  The conformance fixture *a ranking stores the order chosen, and starts with nothing in it*,
  run by both renderers' drivers, Material included. `packages/react/src/ranking.test.tsx`
  and `packages/angular/src/ranking.test.ts` — buttons named after their option, a run of
  Enter ranks them all with focus moving on, a move keeps focus on the moved option, the
  first cannot go up without dropping focus, taking one out focuses it among the unranked.
  `packages/builder-core/src/palette.test.ts` — every palette entry inserts into a document
  of the current version; `conditions.test.ts` — the condition editor treats it as a list.
  `apps/playground/src/starter.test.ts` — the starter carries one. `apps/docs/src/themes.test.ts`
  — every form theme styles its parts.

## Context

Version 4 was opened to take the survey constructs that are types rather than widgets, and
a ranking is the first: no existing type stores an order somebody chose. Three things had to
be decided that a type cannot change later — what the answer is, what it is before anybody
touches it, and how a person produces one.

## Decision

**The answer is the chosen values in the order chosen, most preferred first.** A list, like
the ticks of a set of checkboxes, so an untouched ranking is `[]` and a rule can read it with
`size()`, an index or `in`. An option nobody ranked is not in it. `minItems` and `maxItems`
bound how many are ranked — "your top two" is `maxItems: 2`, a complete order is `minItems`
set to the number of options — and `required` means at least one, as it does for every list.

**It starts empty.** Not in the options' written order: that order is the author's, and an
answer that began as it would submit the author's preference as the respondent's the moment
somebody pressed send.

**The engine refuses what no control could produce**: a value twice (one option both second
and fourth), a value nobody offered, a string where an order belongs — the same engine on the
server, so a payload posted at the endpoint is held to it. Two options sharing a value are
refused in the document, because an order of values could not say which came first. A
ranking takes no `optionsSource`: a deployment's list can change, and an order over a list
that changed is an order of something else.

**It is put in order with buttons, and there is no drag.** Two lists: the order so far, each
option with *move up*, *move down* and *take out*; and the options still to rank, each a
button that appends it. Every button is named after its option — "Move Tea up" — because a
column of identical "Up" buttons is one a screen reader cannot tell apart. Focus follows the
option, so moving something three places is three presses of one key and ranking them all is
a run of Enter. A drag must have an equivalent that is not one (WCAG 2.2 SC 2.5.7); once the
buttons exist they are the control, and a drag surface would be a second route over the same
commands that a host may add.

## Consequences

**A partial ranking is an answer** unless the author bounds it. That is the honest default for
a list type, and a form wanting every option ordered has to say so with `minItems`; the
builder's description of that property says how.

**Ordering is slower by keyboard than a drag is by pointer.** Moving the last of eight options
to the top is seven presses. Nothing here offers "move to top"; it would be a fourth button on
every row.

**The renderers' words are English.** "Move … up", "Take … out of the order" and "Rank …" are
written in each binding, like the rest of the renderers' chrome — the debt §11.2 records.

**The version check was wrong for every type after version 2.** Working out where `ranking`
arrived found `introducedIn` answering "1, else 2, else 3": a version 3 document carrying a
ranking was **accepted**, because 3 is not later than 3 — a document that says version 3 and
that no version 3 reader can read. It now names each version's list, with 4 the newest; the
next version to add a type has to add its list here too.

**CSV exports a ranking as its JSON array** in one column, as it exports any list. A column per
position would be more pleasant in a spreadsheet and is not built.

## Alternatives considered

**Start in the options' order and treat any order as answered.** The commonest design, and it
cannot tell "the author's order was mine too" from "nobody touched it" — the submission is the
same either way.

**A drag-and-drop list first, with the buttons as its keyboard equivalent.** What most survey
tools ship. The buttons are needed regardless, and a drag that is the primary route is the
part that ends up unfinished for everybody who is not using a pointer
([0046](0046-keyboard-before-drag.md)).

**A rank number per option** — "Coffee: 2". An answer that can hold two firsts and no second,
which then has to be refused; the order of a list cannot be wrong in that way.

**Require every option to be ranked.** Simpler to state, and it makes "your top three" — the
most common ranking question — impossible to ask.
