# 0229 — A compiled program says which functions it calls and where its arithmetic is not exact

- **Status:** accepted
- **Date:** 2026-11-01
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/expressions/src/program-facts.test.ts`, each case failing before
  `Program` had the two fields:
  - *a program says which functions it calls, each at its call*: a conversion and the call in its
    argument, outside in; a method, a macro and a call in a comprehension's body; the clock; none
    for operators alone.
  - *a program says where it computes through a double or divides integers*: the issue's
    `int(double("4.35") * 100.0)` named once, at the product; a double variable and a double
    literal; `/` over ints and over uints; both inside a comprehension; nothing for integer
    arithmetic without `/`, a remainder or decimals; and nothing for a `dyn`, as documented below.
    With the outermost rule removed, two cases failed; with uint division dropped, one; with any
    int-typed node counted, five; with the walk stopped at the root, three.

## Context

A compiled `Program` said which variable paths it reads, `references`, and nothing about what it
calls or computes, and the parsed tree is opaque by design (`ast.ts`). `int(double("4.35") * 100.0)`
compiles to an `int` and evaluates to 434, and a caller could not tell it from an exact integer.

Formancy Report refuses anything that differs between two renders and anything inexact: a double
literal, `double()`, `/` on integers. It found each by probing: at every place a candidate stood, it
re-spelled the token at the same length, compiled again, and watched whether the outcome changed
there. Its probes depended on the exact code the compiler gives an unknown function, so a change to
that code would have let every candidate through without a word (issue #260). 0228 gave it the
compiler's refusal of the clock and chance; this gives it, and any caller, what a program does.

## Decision

**`Program` carries `calls` and `inexact` beside `references`**, computed once by `compile` from
the checked tree, in `program-facts.ts`:

- **`calls`**: every function the expression calls, as `{ name, position }`, the span of the whole
  call, outside in and then left to right. A call, a method and a macro are all calls, by the one
  test the kind's allow-list applies, which moved to `ast.ts` with the checker's type reading so
  that what was let through and what is said to be called are one answer.
- **`inexact`**: each place the arithmetic is not exact, as `{ kind, position }`. `double` is a
  subexpression the checker typed as a double, named where it is outermost, so a product of two
  doubles is one place, not three. `integer_division` is a `/` the checker typed as an `int` or a
  `uint`, which drops the remainder. `%` keeps it, and a decimal's `divide` names its places, so
  neither is named.

Both are lists with spans, which the issue said is enough. Neither is a refusal: a form's rules
compile as before, and what to refuse is the caller's.

## Consequences

A caller reads what a program calls and where it loses exactness from the program itself, at the
place the author wrote it, and no change to an error code can silently undo that.

**What it costs.**

- **It knows only what the checker knows.** A value typed `dyn`, a member of a `map` among them, is
  named nowhere, whatever it holds when the expression runs, so `anything * anything` says nothing.
  A caller that needs a value exact declares its type. Declaring a member by its own type is #259.
- **Two more fields on a public type.** Every program carries them, though a form's engine reads
  neither. They are computed at compile time, when the form is saved, and never on evaluation.
- **The tree is still opaque.** The issue offered the checked tree with its types as the other way;
  publishing it would make the CEL implementation's node shapes this package's API, which `ast.ts`
  exists to prevent.

## Alternatives considered

- **Publish the checked tree.** Rejected for the reason above: a caller would read the
  implementation's operators and type objects, and a library upgrade would change them under it.
- **Refuse inexact arithmetic under an option, as 0228 refuses the clock.** Not asked, and not one
  rule: a report refusing every double and a caller allowing a double literal but not `/` want
  different refusals of the same list. The list serves both.
