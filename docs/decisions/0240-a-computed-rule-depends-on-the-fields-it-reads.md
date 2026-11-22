# 0240 — A computed rule depends on the fields it reads, not on their top-level names

- **Status:** accepted
- **Date:** 2026-11-22
- **Deciders:** Daniel Bacher
- **Extends:** [0018](0018-static-dependencies.md), whose graph this keeps and whose nodes it makes
  fields
- **Verified by:**
  - **`packages/core/src/computed-order.test.ts`**, the order built from each rule's target and
    from what `referencedPaths` reports its expression reads:
    - *a computed rule runs after every computed rule whose field it reads* — a reader of a row
      member in a repeater inside a group after the row rule, an aggregate and an index computed
      at run time after every row rule, a field in a group reading a sibling accepted, two fields
      of one group in the order one reads the other, and the form of #355 with an aggregate added;
    - *what is still refused as a cycle, named by the fields in it* — two fields computed from
      each other, a row rule reading its own repeater whole, a computed row member reading its whole
      row, a computed member of a group reading the group whole, a row rule reading the aggregate
      that reads the rows, and a loop through a row rule in a repeater inside a group.

    Against the order as it was, moved unchanged into the same module, every case of the first
    group failed but its control and *a read is cut where it stops being keys and indices*, which
    passed because the old cut was coarser and fails when the cut resumes past what it cannot
    read, as a global rather than a sticky pattern does. Of the refusals, the loop inside a group
    failed because it was accepted; three failed on the cycle's wording alone, which named `fees`,
    `addr` and `items` where it now names `fees[].x`, `addr.label` and `items[].line`; and the top-level
    loop and the whole row passed before as after, as did the controls on the order of rules that
    do not read each other.
  - **`packages/core/src/engine-logic.test.ts`**, *a computed rule is ordered by the field it writes
    and the fields it reads, not their top-level names*, which runs each form in the browser and
    builds the server's replay from the browser's answers. Each case failed against the order as it
    was.
  - **`apps/docs/src/logic-dependencies.test.ts`**, which takes the example and the cycle
    `concepts/logic.md` gives out of the page and runs them; both failed against the order as it
    was.

## Context

The engine runs its computed rules in one pass, in the order of what they read, and refuses a form
whose rules read each other in a loop (0018). The graph that order came from had a node per
top-level name. A rule writing `addr.zip` was the node `addr`, and a read of `addr.city` a read of
`addr`. A row rule kept its template form, `order.lines[].twice`, and one edge made the repeater
depend on its row rules, so that an aggregate reading the list ran after them.

Two defects came from that granularity, and the code shows both since `0.1.0`:

- **A reader of a row member in a repeater inside a group was not ordered after the row rule.** The
  read `order.lines[0].twice` was cut to `order`, and the edge led from `order.lines`, which
  nothing reads under that cut. Measured on `main` at #355 with
  `first = size(order.lines) == 0 ? 0.0 : order.lines[0].twice` beside
  `order.lines[].twice = item.qty * 2.0`: with the quantity changed from 2 to 3 the row showed 6
  and `first` 4, the value from the pass before. The server's replay of the browser's answers,
  which carry the rows' ids, stored no `first`: in its pass the member `first` reads was not
  computed yet. At the top level the read and the edge meet at `lines`, and the order was
  right.
- **A computed field in a group could not read another field of the group.**
  `addr.label = "in " + addr.city` was the node `addr` reading `addr`, refused as
  `Dependency cycle: addr -> addr`. Nothing documented it.

Found while fixing them, and measured on `main` the same way: the edge ran a row rule on a list
that another rule computes whole, `lines[].twice` beside `lines`, before the rule writing the list,
since the list's own node was the one the row rules ran before. The list written whole replaced
what the row rule had written, and its field stayed empty in the browser and on the replay. Inside
a group the row rule ran last, and was right.

The obvious repair of the first, an edge from the group's top-level name to each row rule inside
it, refuses #355's own form: its row rule `order.lines[].label` reads `order.note`, which that cut
makes `order`, which would then depend on the label.

## Decision

**A computed rule's node is its target as written** — `total`, `addr.zip`,
`order.lines[].twice` — **and a read is the field the reference names**, as `referencedPaths`
reports it with every index `[]`: `order.lines[0].twice` reads `order.lines[].twice`. In a row
rule, `index` reads nothing, and `item` is the row, resolved by `inModel` as the checks of an
unknown path and of a temporal literal resolve it.

**A rule depends on every computed rule whose target overlaps one of its reads**: one path is the
other or lies inside it. That relation replaces both the cut and the edge: `size(order.lines)`
reads `order.lines`, which `order.lines[].twice` lies inside. The graph holds only computed rules;
every other kind runs after them all, as before.

It lives in `packages/core/src/computed-order.ts`, apart from the engine, because what a rule
depends on changes for reasons of its own, and this was one. How a row's read names a model path
left `unknown-paths.ts` for `row-reads.ts`, which the authoring checks import as the order does:
imported from where it was, it brought the check of unknown paths into the barrel every form
loads, which 0217 had taken it out of.

## Consequences

**What it buys.** A computed value reading a row member in a repeater inside a group agrees with the
rows it reads, in the browser and on the replay alike. A computed field in a group may read another
field of it. A row rule reading its row on a list computed whole runs after the list is written,
at the top level as in a group. And a refusal names fields: `Dependency cycle: addr.label -> addr.label`, where it
named the group, which said where and not which rule.

**What it costs.** A loop the old graph could not see is refused now: a row rule in a repeater
inside a group reading a field computed from its rows. The same loop at the top level was refused
already; inside a group it was accepted, and opened with a row in it, neither field was computed.
From the upgrade the engine refuses to open a form version published with one, as it refuses any
cycle, and the browser and the server's replay both build that engine. A form refused as a cycle
that no longer is — a group's field reading a sibling — is accepted, and nothing published through
the server can have held one, because publishing builds the same engine and was refused.

The order among rules that do not read each other is kept, by the model's order of the top-level
field each writes and then the document's, so the cycle a refused form is named with starts where
it did. One case moved: a row rule in a repeater inside a group ran after the rules on every
top-level field, and now runs at its group's place. Rules that neither read each other nor write
one inside the other compute the same values in either order. Two that write one inside the other
are ordered by what they read and by nothing else: a row rule reading its row runs after the list
computed whole, and one reading nothing of it, `lines[].twice = 2.0`, runs in the document's
order: listed before the list's rule, its field is replaced and stays empty, measured the same day
at the top level and in a group.

Overlap is conservative where a read is: the whole `item`, a computed index such as `lines[i]` and
a whole group each read every computed field inside them. A row rule reading its own list, a
running total down the rows, is refused as before. Comparing each read with every computed field
under its top-level name costs time where many fields sit under one name. Measured on 2026-11-22
on a developer machine, this order alone took under 30 ms for a chain of 3,000 top-level rules,
and between a quarter and a third of a second for the same chain inside one group; a figure to
re-measure, not to keep. And the barrel every form loads weighs more: 16.7 kB where it was 16.4,
inside its 18 kB budget, the figure §9.3 of the architecture records and `bundles.test.ts` holds.

[0018](0018-static-dependencies.md) says a path computed at run time cannot be expressed. It can,
measured the same day: `addr[k]` reads the member of `addr` whose key `k` holds, and
`lines[int(n)].qty` the row `n` names. `referencedPaths` reports each as a read of the whole
collection and of the variable, which this order reads as every computed field inside it.

## Alternatives considered

**Keep the top-level nodes and add an edge from the group's name to each row rule inside it.** It
orders the aggregate, and refuses #355's form, whose row rule reads a field of the same group, as a
cycle through it.

**Keep the order as it was and document the two limits.** A value the browser shows and the server
does not store is not a limit somebody can design around, and the second limit had no reason
beyond the granularity.
