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

## What it tolerates at runtime

A half-filled form produces evaluation failures constantly; those are normal
control flow, and the direction of failure is chosen per kind:

- **Metadata fails open.** A `visible` rule that cannot evaluate shows the
  field. Hiding on error would silently swallow whatever the person had typed.
- **Validation fails closed.** A `validate` rule that cannot evaluate cannot
  vouch for the value, so the field is marked invalid. The author sees their
  broken rule instead of bad data getting through.

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
