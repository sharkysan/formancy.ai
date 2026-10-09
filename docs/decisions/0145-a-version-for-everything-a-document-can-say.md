# 0145 — A version for everything a document can say

- **Status:** accepted
- **Date:** 2026-10-09
- **Extends:** [0140](0140-spec-4-freezes-with-the-two-types-it-opened-for.md), which made the
  freeze mechanical for field types and widgets
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/spec/src/version-ledger.test.ts` — derives from
  `formancy.schema.json` the keys a document, a field, an option, a matrix row, a rule and a
  layout node may carry, and every rule kind and layout kind; requires the ledger to name
  each exactly; and requires `versionErrors` to refuse each one version before its own and
  accept it at its own. Watched failing three ways: with the property gate removed (seven
  cases), with a property added to the schema alone, and — through the compiler, since the
  ledger is keyed by `keyof FieldDef` — with one added to the type alone.

## Context

0.4.0's release notes said it plainly: the freeze check covered field types and widgets, not
properties or rule kinds, which were gated construct by construct. Writing the whole-vocabulary
check found what that meant in practice:

- A rule kind outside version 2's list was taken to be version 3's, and a layout kind outside
  version 1's to be version 2's — the "newest unless listed" shape that had already answered
  wrongly for field types and for widgets.
- Two version 2 properties, `columns` on a repeater and `span` on a layout node, were never
  named by the check. A version 1 document carrying one was refused only through the
  `datagrid` widget or the `table` that carries it, or by a structural rule that said nothing
  about versions — though `MIGRATIONS.md` promised `validateSchema` "says so by name".
- A property arriving in a later version would have been gated only if somebody wrote its line.

## Decision

**One ledger, `version-ledger.ts`, holds the version every construct arrived in**: a table per
thing a document is made of, each keyed by the TypeScript type that lists them — `keyof
FieldDef`, `keyof LogicRule`, every key of a `LayoutNode`, `RuleKind`, a layout node's `kind`.
A property whose version depends on the type it sits on — `optionsSource`, on a `select` since
2 and on `selectboxes` since 3 — says so per type.

**The version check reads the ledger** rather than naming constructs. A property is reported
when it is newer than what carries it, so a version 3 `box` adds nothing to the `signature`
type's own error. The properties that had a sentence of their own keep its code, since builders
translate by code ([0122](0122-a-validator-error-has-a-code.md)); any other is reported as
`version.property`, in English, German and French.

**Widgets keep their per-version lists**, because which widget — not whether there is one —
decides the version, and 0140's test already holds them.

## Consequences

**Adding a construct costs a version entry, and forgetting it fails twice**: at compile time
when it is added to a type, and in the test when it is added to the schema.

**A version 1 document carrying `span` or `columns` gets an error naming the property**, beside
the one it already got.

**The keys inside a property's value are not reached.** A datagrid column's keys, an option
image's: they arrived with the property that holds them, and a key added inside one later
would be compared with nothing. `SAFETY-ANALYSIS.md` carries it as the residual.

## Alternatives considered

**A table in the test only, with the gates left hand-written.** The test would have been the
ledger and the code a second copy of it — two implementations of one decision, which agree
only while somebody keeps them agreeing.

**Thread the version through the JSON Schema**, one schema per version. It answers "must match
exactly one schema in oneOf", which tells an author nothing, and it is the reason this check
exists beside the schema.
