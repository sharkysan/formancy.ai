# 0089 — A page is unwrapped into its neighbour, not onto the top level

- **Status:** accepted
- **Date:** 2026-09-29
- **Extends:** [0081](0081-a-page-absorbs-the-form-it-joins.md), which built the way in and
  named this as the way out that did not exist
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/builder-core/src/session.test.ts`, *'never leaves a question
  beside a page instead of inside one'* — which derives the invariant from the document
  after every unwrap rather than asserting it per case — with *'a later page merges into the
  one before it, keeping the order of the questions'*, *'and the first page merges into the
  one after it, for the same reason'*, *'takes the rule that skipped the page with it'* and
  *'refuses a repeater, because its children are a row and not a list of fields'*. All four
  observed failing with `neighbouringPage` returning nothing, which is the shape this record
  rejects. `packages/builder-react/src/builder.test.tsx`, *'u on one page of several names
  the page the questions went to'*.

## Context

[0081](0081-a-page-absorbs-the-form-it-joins.md) gave the builder `addPage` and said in as
many words what it did not give: a way back. `removeField` removes a container **with its
children**, so an author who made a wizard by mistake had to delete every question and type
them again. The arrangement tree has had the operation since layouts existed —
`unwrapLayoutNode` replaces a container with its children where it stood — and the model
tree had no equivalent. That asymmetry was the whole of the gap.

The obvious implementation is `unwrapLayoutNode` transposed: splice the container out,
splice its children in at the same index. Written that way it passes its tests, produces a
document the validator accepts, and **contradicts the safety analysis**.

Hazard D8 says a top-level field that is not inside a page renders on step **one** wherever
it sits — measured against the built engine, `pageOf` reports `0, 0, 0, 1` for `bare1`,
`page one`, `bare2`, `page two`. Its constraint is that the builder cannot produce that
shape, because `addPage` absorbs the loose fields and `validTargets` stops offering the bare
top level once a form has pages. Unwrapping page two of three onto the top level produces it
exactly: two questions authored on step two, asked on step one, collected correctly and in
the wrong place.

## Decision

**A group is unwrapped where it stood. A page's questions join the neighbouring page, and
only the last page leaves the form unpaged.**

The neighbour is the page **before**, or the page after when there is none before —
appended to a preceding page's questions, prepended to a following one's. That is one rule
rather than two directions: both are the position that leaves the document in the order
somebody typed it. A three-page form reaches an unpaged form by three presses, and the
invariant holds after each.

Three refusals, and each is a different kind of reason:

- **A leaf.** "Unwrap" on a text field is somebody who meant delete, and doing it would
  remove an answer on a word that does not say remove.
- **A repeater.** Its children describe one **row** and its answer is a list of those, so
  lifting them out keeps the first row and loses every row after it — silently, because the
  document that comes out is perfectly valid.
- **A group a rule addresses or reads inside.** A group carries the answer, so unwrapping
  one renames every path beneath it: `address.city` becomes `city`. Layouts follow, because
  a placement is structured data. A rule's condition is CEL **source**, and rewriting a
  path inside source by pattern is the shape of guard that has been wrong six times in this
  repository, so the rule is named and the edit refused.

## Consequences

**Unwrapping a page moves questions to a step their author did not choose**, and that is
the cost of the invariant rather than a side effect of it. It is announced by name — *"Its
2 questions are on Your trip now"* — because the tree looks like a flat list of questions
either way and the move is otherwise invisible. The alternative was leaving them where D8
says they are asked on page one, which is the same move made quietly.

**A page's `skip` rule goes with the page**, in `unwrapField` and in `removeField` both.
Measured while writing this: a `skip` names a page **key**, so removing a page left a rule
aimed at nothing and the validator refused the whole edit — *"visa is not a page"*.
Conditional page routing shipped in `0.3.0`
([0087](0087-a-page-can-be-walked-past.md)), which means every page anybody had routed
around was undeletable from the builder for that release. Dropping the rule is not a
casualty of the edit: the rule is only ever about that page.

**Unwrapping a group is lossy for a draft in progress**, and nothing here declares it.
`renamedFrom` expresses a changed **key**, and a group unwrap changes a **path** while every
key stays as it was, so there is no declaration to make. A resumed draft is rebound by
`diffSchemas`, which sees `address.city` gone and `city` arrived, reports `lossy`, and moves
the old answer to `data.__orphaned` rather than deleting it
([0025](0025-immutability-in-the-database.md) for why the published version itself is
untouched). That is the documented behaviour for a lossy change and not a special case, but
it is a sharper edge than the page case, which loses nothing.

**The refusal on a group a rule reads inside is drawn wide on purpose.** It matches
`address` in `address.city` and in `has(address)`, and does not match `addressbook` or
`mailing.address`. A false positive costs a refusal on a document that was safe; a false
negative breaks a condition in silence. The boundary has its own case — *'but not a group
whose name a rule merely starts with'* — which fails when the search is a substring match,
observed.

**`renameField` still refuses the same document for the same reason**, and this record does
not fix that. Renaming a field a rule mentions has been refused since rules existed:
measured, `renameField(['address', 'city'], 'town')` returns *"No field has the data path
address.city"*. It is the same missing capability — rewriting a data path inside CEL — and
it is listed as debt rather than solved here, because solving it means parsing and
reprinting an expression, which is a larger piece of work than either command.

## Alternatives considered

**Splice the children onto the top level, like `unwrapLayoutNode` does.** Rejected on
hazard D8 above. It was built first and passed its tests, which is the useful part of the
story: the tests were about the questions surviving, and the thing that was wrong was where
they would be asked.

**Refuse unwrapping a page while another page remains**, so the command only ever un-pages a
one-page form. Rejected because it is unreachable: a three-page form can then never be
un-paged at all, since every page has two others beside it.

**Un-page the whole form on one press**, taking every page away at once. Rejected for being
a different command wearing this one's name — `u` on a group takes that group away, and `u`
on a page taking four pages away is an inconsistency an author meets once and remembers
wrongly. Merging one page into its neighbour is reachable, per-node, and repeats to the same
destination.

**Rewrite the CEL when a group's path moves**, instead of refusing. Rejected for now, not
forever: it needs the expression parsed and printed back, and a regular expression over
source is exactly the guard shape this repository has got wrong repeatedly. Refusing names
the rule and loses nothing; rewriting wrongly breaks a condition and says nothing.
