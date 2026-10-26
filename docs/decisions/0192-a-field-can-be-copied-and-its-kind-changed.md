# 0192 — A field can be duplicated with its rules, and its kind changed with what still applies

- **Status:** accepted
- **Date:** 2026-10-27
- **Deciders:** Daniel Bacher
- **Verified by:**
  - **`packages/builder-core/src/duplicate.test.ts`.** A copy lands straight after the original
    under a key of its own, with every property it had; a rule about the original that reads a
    field outside it is aimed at the copy; a group's copy re-keys its fields and its inner rule
    reads the copy's fields; one undo takes it all back; a page is refused. Watched failing for
    both rule cases with the copy given no rules.
  - **`packages/builder-core/src/retype.test.ts`.** A select becoming radio buttons keeps its
    label, `required` and options and drops a widget radio buttons do not take; a text field
    becoming a number keeps nothing a number lacks; a text field becoming radio buttons gets a
    first option; a group, page or repeater is refused both ways; one undo; and the types
    offered are every single-answer type the document's version allows, minus its own.
  - **Both builders' suites.** `d` on the tree duplicates the focused field, says so in the live
    region and is listed in the legend; the property panel's *Kind of question* changes the
    type and is absent for a repeater — the same cases in React and Angular.

## Context

A builder could not do either. Changing a field's type meant deleting it and adding another,
which lost its label, its options and every rule aimed at it; `type` is not a property the
panel offers, because typing a different type into a text box would be a different field.
Duplicating a field — the second phone number, the second line of an address — meant adding it
again by hand. Both are among the first things a person reaches for in the ten minutes a buyer
judges a builder in.

## Decision

**`duplicateField` and `changeFieldType` in `builder-core`**, each with an `…AndSay` the two
builders announce, so React and Angular cannot do them differently
([0091](0091-a-second-builder-is-a-binding.md)). Each is one edit through `replaceDocument`, so
the session validates it and one undo takes it back.

- **A duplicate is placed as a block is** — keys made unique across the form, rules re-rooted
  and renamed with them ([0135](0135-a-block-is-a-field-with-its-rules.md)) — **but keeps the
  rules that read outside the field.** A block goes to another form, where those fields may
  not exist; a duplicate stays in this one, where "show Canton when Country is CH" is as true
  of the copy. Its label is the original's: the copy is selected afterwards and renamed by the
  person, and a word chosen for them would be in one language.
- **A changed type keeps what the property panel would offer for the new type.** The panel is
  generated from the format's JSON Schema, so which properties a type has is decided once. What
  the new type needs and the field lacks — a choice's first option, a matrix's first row —
  comes from what a new field of that type gets from the palette. A widget the new type does not
  take is dropped.
- **Only between types that hold one answer**, by `ANSWER_KINDS`
  ([0189](0189-every-answer-has-the-shape-its-type-says.md)): a group, a page or a repeater
  holds other fields, and changing one into a question, or the reverse, would throw fields away
  or invent them.

`d` duplicates on the structure tree; the property panel's *Kind of question* changes the type.
Both words are in the builder's catalogue in English, German and French.

## Consequences

**A changed type is a lossy change to a published form.** The schema diff already says so at
publish. Since 0189 the engine refuses an answer of the wrong shape, so a draft written before
the change and resumed after it has that one question refused as `type`, and the person answers
it again; a submission already stored is never migrated.

**A field in a repeater's row that rules are about cannot be duplicated yet.** It inherits the
block's refusal to re-root rules into a row; a field there with no rules about it duplicates.

**The two builder files are at their size budget** — 599 and 593 lines — so the next key either
pays for itself or moves the key handling to a file of its own.

## Alternatives considered

**Offer `type` as an ordinary property.** A text box over the type changes the field without
deciding what happens to its other properties, and the session would refuse most changes for a
property left behind.

**Duplicate as a block, rules reading outside left behind.** The same code with less of the
form's meaning: the copy of a conditional question would be unconditional.
