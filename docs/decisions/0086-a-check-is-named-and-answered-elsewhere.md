# 0086 — A check is named here and answered elsewhere

- **Status:** accepted
- **Date:** 2026-09-29
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/spec/src/check-rule.test.ts` for the format, and
  `packages/core/src/checks.test.ts` for the three ways a late answer goes wrong —
  *'discards an answer that arrives for a value nobody holds any more'* is the one that
  matters, observed failing before the generation token existed. The server's half by
  *'the side the server replays as'* in `packages/server-core/src/use-cases.test.ts`, which
  failed **both ways round** before this change and is the defect described below.

## Context

An asynchronous validator was the last construct spec version 3 was waiting for, and
[0042](0042-freeze-the-spec.md) settled its shape before it was built: *"they need a new
rule kind"*.

That is not a stylistic preference. A CEL expression is pure and synchronous by
construction — no loops, no recursion, guaranteed termination — and every structural
property this engine has rests on it: the dependency graph is derived by walking the AST,
cycles are refused at save time, and evaluation is bounded by a wall clock. An expression
that could await something is none of those things. So `async: true` on a `validate` rule
was never available; the asynchronous thing has to be a different kind of rule.

The second question was what the rule carries. A check has to reach something outside the
document — a database, a registry, an API — and the document is portable, published,
immutable and read by a server that may sit inside a private network.

## Decision

**`kind: "check"` names a validator the deployment answers.**

```jsonc
{ "target": "email", "kind": "check", "check": "email-not-taken", "code": "taken",
  "runsOn": "server" }
```

**A name and never an address**, exactly as `optionsSource` decided
([0077](0077-options-may-come-from-a-named-source.md)): a URL in a document is a deployment
detail frozen into a published version, and a way to make a server inside a private network
fetch something for you. The document says *which* check; the deployment says how to answer
it. Nothing in `@formancy/spec` or `@formancy/core` fetches anything.

**A check carries no `cel`, and an expression rule still requires one.** A rule with both
would be two rules in one object with no answer to which verdict wins. The schema requires
one or the other per kind, and the type checker pointed at every place in the engine that
had assumed a rule has an expression — each of which now says what a check means there.

**Every call carries a generation, and a verdict from an old one is dropped.** This is the
bug every implementation of this ships with: somebody types an address, the check goes
out, they correct it, and the first answer lands second and marks the corrected address
taken. Debouncing narrows that window; only a token closes it.

**`settle()` resolves when nothing is in flight**, so a host can await it before
submitting. Without it a form can be sent while its verdict is still coming, and "it was
valid when I pressed the button" is not something the server will agree with.

**`checking` is on the snapshot and becomes `aria-busy` in the composed props.** Busy is
never said by disabling: disabling the element somebody just typed into blurs it, and the
browser resets focus to the document body. The scanner and the typeahead's option source
both arrived at that answer already, and composing it in `props.ts` is what stops a third
renderer-specific version of it existing.

**A check that cannot be answered fails the field closed** — no checker supplied, or one
that throws. An accepted bogus value is undetectable afterwards; a refusal is retryable and
the draft still holds the answers. The same rule `optionsSource` follows.

## Consequences

**The server replays as the server, which it never did.** Wiring checks meant passing
`mode` — and nothing ever had. `createFormEngine` defaults to `client`, so every
server-side replay since `runsOn` shipped has run the **client's** rules: a
`runsOn: "server"` rule was skipped in the one place it was meant to run, and a
`runsOn: "client"` rule ran in the one place it was meant not to. Both halves of
[0043](0043-runs-on.md) were backwards, in the product, with nothing reporting it — the
feature had unit tests in the engine and no test that asked the server.

That is recorded here rather than fixed quietly because of what it says about the shape of
the gap: the engine was tested for the behaviour, the server was tested for submissions,
and the seam between them was tested by neither.

**A check sees one field's answer and the whole submission.** `CheckRequest` carries
`value` and `data`, so a cross-field check is expressible. What it does **not** have is a
declared dependency: a check re-runs when its own target changes, not when something else
it happened to read changes. A check that reads another field is therefore stale until its
own field is edited, and that is a real limit rather than an oversight — deriving
dependencies is what the CEL AST is for, and a check has no AST.

**Nothing debounces.** A check runs on every committed value, which for a text field is
every keystroke a renderer commits. The host's checker is the right place for a timer,
because only it knows what its backend costs — but the obvious implementation of a check
is expensive, and nothing here warns about that yet.

**Emptiness is not asked about.** An empty answer is `required`'s question, and asking a
deployment whether nothing is taken is asking it nothing.

## Alternatives considered

**`async: true` on a `validate` rule**, which is what the roadmap called it for a year.
Rejected on the CEL argument above: the property would have to make the expression
asynchronous, and the expression's synchronicity is load-bearing for the graph, the cycle
check and the runtime budget.

**A URL on the rule.** Rejected for the three reasons `optionsSource` gives, which are
worth repeating because a URL is genuinely more convenient: it is a deployment detail in a
portable format, frozen forever in a published version, and an SSRF surface on an instance
inside a private network.

**Run checks only on the server.** Simpler, and it would have made every check a
submit-time surprise — the answer arrives after the person has finished and pressed the
button, which is the worst moment to learn an address is taken. `runsOn` already expresses
the choice, and a host that can answer in the browser should be able to say so.

**Have the engine debounce.** Rejected as the engine deciding a policy it cannot know: a
check against an in-memory list wants no delay and one against a rate-limited API wants
seconds. The timer belongs to whoever pays for the call.
