# 0090 — A check defaults to the server, and the page says which default it gets

- **Status:** accepted
- **Date:** 2026-09-29
- **Extends:** [0086](0086-a-check-is-named-and-answered-elsewhere.md), which made a check a
  rule kind and left this unstated, and [0043](0043-runs-on.md), which introduced `runsOn`
- **Deciders:** Daniel Bacher
- **Verified by:** `apps/docs/src/claims.test.ts`, *'where a rule runs when it does not
  say'* — which reads **both** fallbacks out of `packages/core/src/engine.ts` and compares
  them, as values, against the schema's declared default and the check branch's override.
  Observed failing with the branch changed to `"both"`. A first version matched a phrase in
  the shared description instead and passed immediately, against a paragraph about neither
  thing; that is recorded below rather than quietly replaced.
  `apps/playground/src/wizard.test.ts` runs the demo's own check against a real engine.

## Context

`runsOn` has one declared default and the engine applies two.

A `validate` rule with no `runsOn` falls back to `both` — `engine.ts` line 617 — which is
what the JSON Schema says. A `check` falls back to **`server`** — line 938 — and the schema
said `both`.

So a check written the way anybody would write it, without `runsOn`, never ran in the
browser. No error, no request, no mark on the field: an answer accepted that nothing had
checked, until the form was submitted and the server ran the rule the document had always
meant. The unit tests could not see it because the one in `checks.test.ts` writes
`runsOn: "both"` explicitly, and `0086`'s own example writes `"server"` — the only two
documents anybody had written both said which, so the default was never exercised.

It was found by building a demo of the feature for the playground, which is the shortest
description of why that rule exists.

## Decision

**The engine's behaviour stands: a check with no `runsOn` runs on the server.** Only the
server can always answer one. A browser can ask only if its host supplied a checker, so a
check defaulting to `both` would fail **closed** on every page that had not been wired up —
a field showing an error the visitor cannot clear, with nothing on screen to say that the
deployment rather than the answer is what is missing. Failing closed is right when a check
was asked for and could not be answered; making it the *default* would mean asking for one
by accident.

**And the document says so, as data.** The check branch of the rule's conditional block
carries `"runsOn": { "default": "server" }`. A JSON Schema `default` is one value and there
are two, so the shared property keeps the validate rule's `"both"` and the branch states
the other. The generated reference now prints both, because it now reads the block at all.

## Consequences

**A host that can answer in the browser has to say `both`.** That is one property on one
rule, and it is the honest place for the decision: whether an answer can be had without a
round trip is something only the deployment knows. The playground's demo says it, with the
reason beside it.

**The spec reference gained a section it should always have had.** `generate-spec-reference.mjs`
read the *field's* conditional blocks and never the *rule's*, so everything the schema said
per kind — which kinds carry `cel`, which carry `check`, and now this default — was
published nowhere. It throws on a rule branch gated on anything but `kind`, matching what
the field blocks already did after an empty heading shipped
([0070](0070-a-code-is-an-arrangement-not-a-field.md) is the incident).

**Two defaults is more to explain than one**, and that is the cost. The alternative was
making them agree, and both ways of agreeing are worse — see below.

## Alternatives considered

**Default a check to `both`**, matching the declared default. Rejected: every document
naming a check would run it in the browser, and a browser with no checker supplied fails
the field closed. That turns "we have not wired this up yet" into "this form cannot be
filled in", on the page rather than at submit.

**Default a check to `both` and fail OPEN in the browser** when no checker is supplied.
Rejected as the worst option available: a check that silently passes is a check that was
never run, reported as success. Fail-closed on an unanswerable check is settled
([0086](0086-a-check-is-named-and-answered-elsewhere.md)) and reversing it here would
reverse it everywhere, since the browser is exactly where a checker is most often absent.

**Require `runsOn` on a check**, so there is no default to disagree about. Rejected because
a required property is a version change on a frozen spec, and because the required value
would be `server` in almost every document — a mandatory field whose answer is nearly
always the same is a field people stop reading.

**Leave the schema saying `both` and fix nothing**, since the engine was right. Rejected on
the rule this repository is built on: a wrong statement is worse than an absent one,
because an absent one prompts the question and a wrong one answers it incorrectly. The
reference is what a developer reads before writing their first check.
