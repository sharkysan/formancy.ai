# 0240 — A computed rule depends on the fields it reads, not on their top-level names

- **Status:** accepted
- **Date:** 2026-11-22
- **Deciders:** Daniel Bacher
- **Extends:** [0018](0018-static-dependencies.md), whose graph this keeps and whose nodes it makes
  fields, and narrows [0042](0042-freeze-the-spec.md)'s promise that a form written now keeps
  working, for a version whose computed rules loop through a repeater inside a group
- **Verified by:**
  - **`packages/core/src/computed-order.test.ts`**, the order built from each rule's target and
    from what `referencedPaths` reports its expression reads:
    - *a computed rule runs after every computed rule whose field it reads* — a reader of a row
      member in a repeater inside a group after the row rule, an aggregate and an index computed
      at run time after every row rule, a key held in a variable after every field computed in its
      group, a field in a group reading a sibling accepted, two fields of one group in the order
      one reads the other, the form of #355 with an aggregate added, and a row rule on a list
      computed whole after it;
    - *a computed rule writing inside a field another computes whole runs after it* — a row rule
      reading nothing of its row, at the top level and in a group, under the list or the group;
    - *a row rule in a repeater inside a group reading a list or a group inside a group, whole* —
      a row count, the row before, the last row, the group, a running total, and two lists each
      reading the other, in one group or in two, accepted; no row rule waited for, of its own list
      or another; a field computed into the group still waited for; a member of another row, and a
      list at the top level, read as fields; and the same reads refused at the top level;
    - *what is still refused as a cycle, named by the fields in it* — two fields computed from each
      other, a row rule reading its own repeater whole at the top level, a computed row member
      reading its whole row, a computed member of a group reading the group whole, a row rule
      reading the aggregate that reads the rows, and the loops through a repeater inside a group
      that main did not see.

    Against main's order, moved unchanged into the same module, the cases that order a reader after
    a row rule in a group, a sibling read and a list computed whole at the top level failed, and so
    did the loops main accepted; the top-level refusals failed on the cycle's wording alone; the
    cases that accept a group's own-list reads, and the edge's cases in a group, passed, as they
    must. Against the first version of this change, which made those reads a cycle and gave a row
    rule in a group its group's place, the own-list cases failed, and so did every case of the
    edge. Against the second, which kept only a row's read of its own list, the two lists of one
    group each reading the other failed, and against the third, which kept a read of the rule's own
    group, the lists of two groups did. *A read is cut where it stops being keys and indices*
    passes before as after and fails when the cut resumes past what it cannot read, as a
    global rather than a sticky pattern does.
  - **`packages/core/src/engine-logic.test.ts`**, *a computed rule is ordered by the field it writes
    and the fields it reads, not their top-level names* and *a row rule in a repeater inside a group
reading a list inside a group whole, and the loops it is not*, which run each form in the browser
    and build the server's replay from the browser's answers. The first block's cases each failed
    against main's order; the second's row count, row before, last row, share of the count, two
    lists counting each other, running total and count of another list's computed members compute
    main's figures, and its loops were accepted on main.
  - **`packages/core/src/engine-refusal.test.ts`**, *names a loop through a repeater inside a group,
    field by field*, and **`packages/server/src/refused-version.test.ts`**, which stores such a
    version as an earlier release did: its public read answers `200`, a submission `500` with a
    line at `error` and nothing stored, and publishing it again `422` `invalid_logic` with the
    cycle, keeping the version. Each failed against main's order.
  - **`apps/docs/src/logic-dependencies.test.ts`**, which takes every rule `concepts/logic.md` says
    is accepted or refused out of the page and builds it, and the cycle it quotes. Its three cases
    failed against main's order.

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
  `Dependency cycle: addr -> addr`, and so was a chain through the group that never came back,
  `addr.zip = code` beside `code = addr.city`, as `addr -> code -> addr`. Nothing documented it.

Found while fixing them, and measured on `main` the same way: the edge ran a row rule on a list
that another rule computes whole, `lines[].twice` beside `lines`, before the rule writing the list,
since the list's own node was the one the row rules ran before. The list written whole replaced
what the row rule had written, and its field stayed empty in the browser and on the replay. Inside
a group the row rule ran after every top-level field, and was right.

The obvious repair of the first, an edge from the group's top-level name to each row rule inside
it, refuses #355's own form: its row rule `order.lines[].label` reads `order.note`, which that cut
makes `order`, which would then depend on the label.

The first version of this decision made every read a field, the row's own read of its list
included. Review measured what that refused: inside a group, a row rule reading its own list or the
group around it whole — a row count, `size(order.lines)`; the row before,
`order.lines[index - 1].qty`, which `referencedPaths` reports as `order.lines`; the last row — had
been accepted by every release, depended on none of the rows, and computed right in the browser and
on the replay. Versions published with one would have stopped opening. Daniel's ruling was to keep
main's order for those reads. The second version kept it for a row's read of its own list and
refused two lists of one group each reading the other whole, which main had also opened; the
ruling on that was to keep main's order for a row's whole read of anything in its group. The
third refused lists of two groups each reading the other whole, which main had opened too; the
ruling on that was to keep main's order for a row's whole read of any list or group inside a
group, and to leave the lists at the top level as they were. Daniel accepted the rest of what is
refused: a rule outside the rows that reads a list inside a group
waits for that list's row rules, as at the top level, and a row reading back what was computed
from its own list is a loop.

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

**Except a row rule in a repeater inside a group reading a list or a group inside a group
whole**: a read that does not reach into a row — `order.lines`, `order.other`, `other.lines` or
`order` for a rule on `order.lines[].x` — waits for no row rule of a list inside a group, its own
or another, only for the other computed rules writing into what it reads. That is main's order for
such a read, so a form main accepted through one is still accepted. A member of another row,
`order.other[0].y`, is read as a field, and a list at the top level, `items`, is waited for, as on
`main`. At the top level a row rule reading its own list is refused, as it was on `main`.

**And a rule writing inside a field another rule computes whole depends on that rule**, so the
whole is written first and the part into it.

It lives in `packages/core/src/computed-order.ts`, apart from the engine, because what a rule
depends on changes for reasons of its own, and this was one. How a row's read names a model path
left `unknown-paths.ts` for `row-reads.ts`, which the authoring checks import as the order does:
imported from where it was, it brought the check of unknown paths into the barrel every form
loads, which 0217 had taken it out of.

## Consequences

**What it buys.** A computed value reading a row member in a repeater inside a group agrees with the
rows it reads, in the browser and on the replay alike. A computed field in a group may read another
field of it, and a chain through a group that does not come back is accepted. A rule writing inside
a field computed whole keeps what it writes, at the top level, where main lost it in either order,
as in a group. And a refusal names fields: `Dependency cycle: addr.label -> addr.label`, where it
named the group, which said where and not which rule.

**What it costs: a version published with a loop through a repeater inside a group no longer
opens.** Every read inside a group was the group's on main, and no row rule of a repeater inside
it was reached from one, so loops through those rows went unseen and published. Measured on `main`:

- a total over the list read back in its rows, `count = double(size(order.lines))` read as
  `order.lines[].share = item.qty / count`: it computed right, and its rewrite is to read
  `size(order.lines)` in the row, which is accepted. Kept inside the group, `order.count`, the
  same total was refused on `main` already, as `order -> order`;
- `first` computed as `order.lines[0].x` and read back by `order.lines[].x`: with a row there,
  neither was computed;
- a row reading another row's member by position, `index == 0 ? 1.0 : order.lines[0].x + 1.0`:
  the browser showed values the replay did not store.

Each is refused now, as the same loop at the top level was on `main`. The engine refuses a stored
version with one in the browser and on every submission's replay, which answers `500`, and the
author's only remedy is a new version, since a published one is immutable. `MIGRATIONS.md` says
how to find one. **This narrows 0042.** Its letter holds — `validateSchema` accepts the same
documents, and the spec version does not move — but what it says it buys, that somebody can write
forms now and know they keep working, does not hold for these, as it did not for 0185's
`__proto__`. A form refused as a cycle that no longer is, such as a group's field reading a
sibling, is accepted; nothing published through the server can have held one, because publishing
builds the same engine and was refused.

**What it keeps, on purpose: inside a group, a row's whole read of rows a rule computes is a pass
behind.** Such a read waits for none of the rows, so it takes them as the pass before left them.
Measured on `main` and unchanged:

- a running total down the rows, `order.lines[index - 1].x + item.qty`: with quantities 2 and 5,
  the first changed to 3, the browser shows 3 and 7 where 8 is due, and the replay stores 3 and no
  second total;
- a count of what another list inside a group computes, `order.other.filter(o, o.y > 2.0)` beside
  `order.other[].y = item.qty * 2.0`: with that list's quantity changed from 1 to 2, the count
  stays 0 where 1 is due, and the replay stores none.

Both are kept as main had them, because the ruling keeps main's order for a row's whole read inside
a group: telling them from a row count would take more than the reads say. At the top level the
running total is refused. Debt, in §11 of the architecture and A5.

**The edge for a field written inside another closes no cycle the reads did not.** For a loop to
pass through it, some rule's read must reach the inner field, and a read overlapping the inner
field overlaps the outer one too, which is its prefix, so that rule already waited for the outer
rule. A row's whole read inside a group skips row rules only, so it waits for an outer field a rule
writes into what it reads, and reaches no row rule to close a loop through. With the edge, a row rule reading nothing of its row is written
after the list or group computed whole around it, at the top level and in a group.

The order among rules that nothing orders is by the model's order of the top-level field each
writes and then the document's, so the cycle a refused form is named with starts where it did.

Overlap is conservative where a read is: the whole `item`, a computed index such as `lines[i]` and
a whole group each read every computed field inside them. Comparing each read with every computed
field under its top-level name costs time where many fields sit under one name. Measured on
2026-11-22 on a developer machine, this order alone took 25 ms for a chain of 3,000 top-level
rules, and 315 ms for the same chain inside one group; a figure to re-measure, not to keep. And the
barrel every form loads weighs more, inside its 18 kB budget: §9.3 of the architecture records the
figure, and `bundles.test.ts` holds it.

[0018](0018-static-dependencies.md) says a path computed at run time cannot be expressed. It can,
measured the same day: `addr[k]` reads the member of `addr` whose key `k` holds, and
`lines[int(n)].qty` the row `n` names. `referencedPaths` reports each as a read of the whole
collection and of the variable, which this order reads as every computed field inside it.

## Alternatives considered

**Keep the top-level nodes and add an edge from the group's name to each row rule inside it.** It
orders the aggregate, and refuses #355's form, whose row rule reads a field of the same group, as a
cycle through it.

**Make a row rule's read of its own list a field read inside a group too, as at the top level.**
The first version of this decision. It refuses every row count, row before and last row in a
repeater inside a group, which computed right, and stops the versions published with one from
opening. Uniform, and paid for by forms that worked.

**Keep the order as it was and document the two limits.** A value the browser shows and the server
does not store is not a limit somebody can design around, and the second limit had no reason
beyond the granularity.
