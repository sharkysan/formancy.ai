---
title: Logic and expressions
description: How conditional visibility, computed values and validation are written in CEL, and why the engine refuses some forms outright.
---

Behaviour lives in the `logic` section as a flat list of rules. Each names the
field it applies to; order does not matter, because evaluation order comes from
what depends on what.

```jsonc
{
  "logic": {
    "rules": [
      { "target": "canton",   "kind": "visible",  "cel": "country == 'CH'" },
      { "target": "subtotal", "kind": "computed", "cel": "price * qty" },
      { "target": "reason",   "kind": "required", "cel": "vip == true" },
      { "target": "qty",      "kind": "validate", "cel": "qty == null || qty <= 100.0",
        "code": "tooMany" }
    ]
  }
}
```

## The five kinds

| Kind | While the expression is true |
| --- | --- |
| `visible` | the field is shown |
| `disabled` | the field is greyed out but keeps its answer |
| `required` | the field is required, on top of any fixed `required` |
| `computed` | the result is written into the field; nobody can type over it |
| `validate` | *false* means the field carries the error named by `code` |

A field may carry one rule per kind — two visibility rules would have no defined
winner, and silently picking one is worse than refusing. `validate` is the
exception: each is an independent check, so a field can have as many as it needs.

## Rules inside repeater rows

Target a row member and the rule runs once per row, with two extra names in
scope: `item` (the row) and `index` (its position).

```jsonc
{ "target": "items[].lineTotal", "kind": "computed", "cel": "item.price * item.qty" }
{ "target": "items[].qty", "kind": "validate", "cel": "item.qty == null || item.qty > 0.0",
  "code": "notPositive" }
```

Errors land on the instance that failed — `items[1].qty` — not on the template.

## Why CEL

Expressions are [Common Expression Language](https://cel.dev), not a JavaScript
subset and not JSONLogic. Four reasons, in order of weight:

1. **It cannot loop.** CEL is non-Turing-complete by construction: no loops, no
   recursion, no user-defined functions, guaranteed termination. That is a
   property of the language, not a sandbox somebody has to keep patching.
2. **It is typed, and checked when you save.** `age > "eighteen"` is refused at
   publish time, with a message for the author.
3. **Its syntax tree names exactly what it reads.** That is what lets the engine
   build a dependency graph and detect cycles *before* anything runs.
4. **It is readable.** `total > 50 && country == 'CH'` survives a code review;
   the JSONLogic equivalent is nested arrays.

## What the engine refuses outright

Compilation happens once, when the engine is built — which is also what the
server does at publish time. A form is **refused** if:

- an expression does not parse, or references a field that does not exist;
- it returns the wrong type for its kind (`visible` must produce a boolean);
- it calls something its kind does not allow;
- the computed rules form a **cycle**.

That last one matters most. Because dependencies are known before evaluation, a
form where `price` computes from `qty` and `qty` computes from `price` is
rejected when it is saved, with the cycle named — rather than hanging in a
browser somewhere.

## A rule that reads a field you removed

The builder keeps these in step: renaming a field, or unwrapping a group, rewrites
every rule that names it. A document you write by hand, generate, or have an agent
compose has no such help — and a rule reading a path no field provides is the
quietest mistake in the format. It compiles, it publishes, it evaluates to
nothing, and a conditionally visible field is simply never shown again.

How far the format catches it:

| What the rule reads | At publish |
| --- | --- |
| an unknown top-level field — `gone == "8000"` | **refused**, `422` |
| an unknown member of a group — `address.nope` | published, with a **warning** |
| an unknown member of a row — `item.nope` | published, with a **warning** |

The first is refused because the engine compiles each rule against the fields that
exist. The other two type-check, because a member of a map is dynamic — and they
are the cases that bite, since inside a group the data path (`address.city`) and
the field's own key (`city`) are different things.

The warning comes back on the publish's `201`. It is a warning rather than a
refusal because published spec versions are frozen, and a reader that started
rejecting documents it used to accept would break that contract. If you want it to
be a gate, [Self-hosting](/docs/start/self-hosting/) shows the one-line check.

## What it tolerates at runtime

A half-filled form produces evaluation failures constantly; those are normal
control flow, and the direction of failure is chosen per kind:

- **Metadata fails open.** A `visible` rule that cannot evaluate shows the
  field. Hiding on error would silently swallow whatever the person had typed.
- **Validation fails closed.** A `validate` rule that cannot evaluate cannot
  vouch for the value, so the field is marked invalid. The author sees their
  broken rule instead of bad data getting through.

### Which means an unanswered field needs guarding, and `!= null` is not the guard

Fails-open is the right default and it has a consequence worth knowing before
you write your first rule: **a condition that errors on an empty form shows the
field it was meant to hide, from the start, with nothing to say so.**

Several shapes error, and the worst of them look defensive:

| Condition | On an untouched form |
| --- | --- |
| `!needsVisa` | **errors** — CEL has no `!` for null |
| `address.country == "CH"` | **errors** — the *group* is null, so reading a member of it fails |
| `address.country != null && address.country == "CH"` | **errors** — it still has to read the path to compare it |
| `age > 18.0` | **errors** — CEL has no `>` between null and a number |
| `"gift" in item.tags` | **errors** — in a repeater row an untouched list is null, not `[]` |
| `has(item.tags) && "gift" in item.tags` | **errors** — a row has every key, so `has()` is true and the value is still null |
| `needsVisa != true` | `true` |
| `has(address.country) && address.country == "CH"` | `false` |
| `age != null && age > 18.0` | `false` |
| `item.tags != null && "gift" in item.tags` | `false` |

The pattern: comparing against `null` cannot rescue a read that fails, because
the read happens first. For a top-level field, compare against the value you
mean — `needsVisa != true` rather than `!needsVisa`. For a path inside a group,
test presence with **`has(...)`**, which is the only one of these that answers
rather than failing.

A repeater row is the other way round. The engine presents a row with every key
there and null until answered, so `has()` is always true in a row and answers
nothing; there, **`!= null`** is the guard — `item.tags != null` before `in` or
`size()`, `item.qty != null` before `>`. A list is the case to watch: at the top
level an untouched list is `[]` and `"gift" in extras` is simply `false`, while the
same condition in a row errors. The builder's condition editor writes these guards
itself.

Both of these shipped in this project's own demo and were found by running it
against an engine rather than by reading it. A `visible` rule that is wrong this
way is invisible precisely because it fails open: the field is simply always
there.

**The builder's condition editor wrote two of these shapes itself** — a comparison
on a field inside a group, and a bound on a number — until 2026-10-09. It now asks
first: `has(...)` before reading into a group, `!= null` before ordering or
searching a value, and a length for a list of ticks, which an empty list does not
have. A rule written by an earlier builder keeps the expression it was written with,
because the expression is what is stored; this table is how to recognise one
([0127](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0127-a-condition-nests-one-level.md)).

## Nothing ambient

`now()`, `today()` and `random()` do not read a clock — they read values the
caller injected, frozen for the whole evaluation pass:

```ts
createFormEngine({
  schema,
  capabilities: {
    now: () => Date.now(),
    today: () => new Date().toISOString().slice(0, 10),
    random: () => Math.random(),
  },
})
```

This is why the server can replay a submission months later and get
byte-identical computed values, and why a schema with logic rules refuses to
build without capabilities rather than quietly reaching for `Date.now`.

## Money is not a double

A `decimal` type backed by scaled integers exists precisely because `0.1 + 0.2`
is the wrong answer to give someone about their invoice. Mixing decimals with
plain numbers is a **check-time error**, with a hint naming the fix:

```cel
price * 0.19          // rejected: Write dec("0.19") instead of 0.19
price * dec("0.19")   // exact
divide(total, dec("3"), 2)   // division needs explicit places — it cannot stay exact
```

## Cost is bounded, deterministically

Evaluation is metered by counting steps, never by a wall clock — a submission
that passed in the browser must not fail its replay on a slower server. Values
entering an expression are bounded too (string length, list and map size,
nesting depth), so a large payload is refused at the boundary instead of being
discovered to be expensive halfway through.

No expression ever reaches `eval` or `new Function`. formancy runs under a
strict `script-src 'self'` policy with no `unsafe-eval` and no configuration.
