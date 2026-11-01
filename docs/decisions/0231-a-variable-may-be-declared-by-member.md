# 0231 — A variable may be declared by member, and is then read one member at a time

- **Status:** accepted
- **Date:** 2026-11-01
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/expressions/src/declared-members.test.ts`, every case failing before
  a declaration could hold members, when the library refused one as `type is required`:
  - *a member is checked with its own type*: the three cases Formancy Report measured, an int
    member added to a string refused, a decimal member compared with a decimal and a bool member
    used as a condition both compiling; a comparison an int member has no overload for refused; a
    nested member selected and indexed; a member nobody declared refused with the declared ones in
    the hint, nested too; a double member named where it is inexact (0229); the paths read, as
    before.
  - *a variable declared by member cannot be read whole*: as the result, in a list, as a map's
    value, as a conditional's branch, a nested member as the result, and by a key computed when
    it runs, each `variable_read_whole`; the checker's own refusals of one passed to a function
    or compared, with the same hint, the nested member's named rather than the variable's; a
    comprehension variable of the same name let through.
  - *evaluated, each member is bound as its declaration says*: an int member from a JSON number, a
    decimal from a string, a nested member; a missing member and one of the wrong kind refused by
    path, and a missing member declared by member asked for as a map of its members; null, a list
    and a string refused as the value; a map without a prototype accepted; members named
    `constructor` and `__proto__` read as members.

  Each part was broken on its own and a case failed: the gate removed (seven), any index taken
  for a member's (one), no index taken for one (two), the unknown-member hint removed (two), the
  first type named in a message taken rather than the longest (one, after a case was added for
  it), the overload hint removed (one), a member assigned rather than defined (one), members left
  unbound (nine), nested members not collected (three), a map without a prototype refused (one),
  and the library's type names spelled with another prefix (ten).

## Context

`VariableDeclarations` was a flat map from a name to a type. Declaring `'row.amount': 'int'` made a
variable whose name held a dot, and `row.amount + 1` then failed as `Unknown variable: row`. The
other way was to declare `row` a `map`, and then every member was `dyn` to the checker.

Formancy Report reads `row.amount`, `params.copies` and `group.key` in every report. Declared as
maps, the checker passed `params.copies + "x"` and refused `row.amount == dec("1")` and a boolean
parameter used alone as a condition. Report spliced each member read into a flat variable with
`rewritePath` and compiled again, once per read, on every keystroke, and pinned `rewritePath`'s
splice in its tests; its 0009 says this belongs here (issue #259).

The library, `@marcbachmann/cel-js` 8.0.0, declares a variable by a `schema` of field types, makes
a type of its own for it, `$row`, and for a nested member, `$row.address`, checks each field read
as its declared type and refuses one it does not declare as `No such key`. What it does not do is
refuse the variable read whole: `[row].size()` checks, as a `$row` in a list, and hands its members
on as `dyn`.

## Decision

A declaration is a type or an object of member declarations, nested as deep as the value is:
`{ row: { amount: 'decimal', address: { city: 'string' } } }`. It is registered with the library
as a `schema`. Such a variable is read one member at a time: a node of a type the checker made for
one, anywhere but where a member is selected from it by name, `row.amount` or `row["amount"]`, is
refused at check as `variable_read_whole`. When the expression runs, each member is bound as a
variable of its type is.

## Consequences

**What it buys.** A member is checked as what it is: `row.amount == dec("1")` compiles, an int
member added to a string does not, a misspelt member is refused with the members there are, and a
double member is named in what a program says is inexact. A caller declaring its values this way
compiles once, and Report can drop the splice and the tests that pinned it.

**What it costs.** A gate that rests on a name the library makes up: the `$` and the path is
8.0.0's spelling, and a release that spelled it otherwise would let a whole read through unseen,
which is why a case fails for that. A member read by a key computed when it runs, `row[k]`, is
refused, though it would work: its type is none of the members', so it is the whole read by
another spelling. Binding builds a new object per variable per evaluation, which the library
converts into a value of its own type, and the meter charges what that reads: measured on
2026-11-01, reading one of four declared members cost 5 steps where the same read of a `map` cost
3, and reading two cost 7 either way.

**What it does not do.** The engine does not declare a document's groups or repeater rows this
way: they stay `map`, their members `dyn`. Declaring them by member would refuse a rule reading a
member a group does not have, and a rule that compares a member with a value of another type,
both of which publish today, the first with a warning; that would make documents valid today
invalid, and what a reader accepts is the frozen version contract (`SAFETY-ANALYSIS.md`, B1a). Optional selection,
`row.?amount`, is not in this parser, so a member absent from a value is an error when it runs,
as a missing variable is; `has(row.amount)` asks.

## Alternatives considered

**Dotted keys read as member selection,** `'row.amount': 'decimal'`. The issue offered either.
Rejected: one name would mean a variable here and a member there, `row` would be declared only
by implication, and a caller declaring both `row: 'map'` and `'row.amount'` would have said two
things about one variable.

**Let a whole read through.** Rejected: a whole read is how a member reaches a function or a list
as `dyn`, which is what declaring it by member is for not to happen. A caller that wants the whole
declares a `map`.

**Register each type by a name of ours,** so the gate need not know the library's. Rejected for
now: the library documents a type made by `fields` alone as one to use only in registering a
variable, and its `schema` is the documented way to declare one; a test holding its naming is
cheaper than a second registration path.
