# 0032 — Neutralise formulas in exported CSV

- **Status:** accepted
- **Date:** 2026-09-20
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/server-core/src/use-cases.test.ts`, the "CSV
  formula injection" block. One test submits `=HYPERLINK("http://evil.example",
  "click")` and `@SUM(1,1)` and asserts both come back apostrophe-prefixed,
  with no cell opening on `=HYPERLINK` quoted or bare; the other submits `-5`
  as a number and asserts the
  cell is still `-5`, which fails if the rule is applied to the serialised text
  instead of to strings.

## Context

A submission field holds whatever a person typed. Exported to CSV and opened in
a spreadsheet, a value beginning with `=`, `+`, `-` or `@` is interpreted as a
formula rather than as text, which is a well-known injection path into the
machine of whoever opens the export — and the person who opens the export is
the operator, which is to say the person worth attacking. This was found by an
adversarial review of the export path, not while it was being written.

## Decision

`cellValue` prefixes such a value with an apostrophe, the convention every
spreadsheet honours. The rule applies only to **string** values. A numeric
column containing `-5` stays `-5`, because quoting it would break the column's
type for every legitimate consumer, and a number cannot smuggle a formula in
the first place. The neutralisation is therefore type-aware rather than a
blanket rule on the serialised text. The trigger set is `=`, `+`, `-`, `@` plus
tab and carriage return, which some spreadsheets also treat as a formula lead-in.

The same export unions its columns across every version the form has had
([0015](0015-diff-before-server.md)). A form that gained a field halfway
through its life has submissions of two shapes, and an export that silently
dropped one of them is worse than one that leaves cells empty.

## Consequences

**What it buys.** The export is safe to hand to a non-technical colleague, which
is the only reason CSV export exists.

**What it costs.** An exported string that legitimately begins with an equals
sign — a formula somebody meant to record, a hyphenated code — carries a
leading apostrophe it did not have when it was typed. The round trip is
therefore lossy for those values. Accepted, because the alternative is
executing them.

**What it forecloses.** The export can no longer be produced by serialising the
stored JSON generically; it has to know each value's type. That is affordable
only because the stored row is canonical and keeps its JSON types
([0030](0030-never-trust-client-state.md)) rather than being whatever string
the client sent.

## Alternatives considered

**Quote every cell.** Rejected: quoting is not neutralisation. A spreadsheet
strips the quotes and evaluates the formula anyway.

**Prefix by the serialised text.** Rejected: it is the same one-line rule
applied one level too late, and it turns every negative number into text.
