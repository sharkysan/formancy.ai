# 0013 — Specify what happens to a hidden field's answer

- **Status:** accepted
- **Date:** 2026-09-19
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/conformance/fixtures/clear-on-hide.json`, which
  runs through both renderer drivers and asserts that the submitted payload has
  no key for the cleared field while the opted-out one keeps its value;
  `packages/core/src/engine-logic.test.ts` — "hiding a field prunes its value by
  default — a hidden branch cannot smuggle data" and "clearOnHide false keeps
  the value, and it is there when the field returns";
  `packages/core/src/engine-rows.test.ts` — "visibility applies per row instance
  and respects clearOnHide false"; and, for the server half,
  `packages/server-core/src/use-cases.test.ts` — "never trusts the client:
  hidden-branch data is stripped and computed lies are overwritten".

## Context

When a rule hides a field, what happens to the answer already typed into it is a
semantic question, not an implementation detail. Left emergent, it differs
between renderers and between client and server, and the difference is either
data loss or a data leak depending on which way it falls.

## Decision

Hidden fields are excluded from validation: a field nobody can see is not part
of the conversation, so it is not required and contributes no errors.
`clearOnHide`, defaulting to `true`, decides whether the value is pruned from
the submission when the field goes hidden.

The server applies identical semantics from its own evaluation of visibility
([0030](0030-never-trust-client-state.md)), stripping values under server-hidden
subtrees, so a malicious client cannot smuggle data into a hidden branch by
sending it anyway. `clearOnHide` lives in the model rather than
in the logic section, because it decides the data shape.

The invariant is that hiding and unhiding restores the value if and only if
`clearOnHide` is false. It is held by the engine tests and by the conformance
fixture named above, which every renderer runs — **not** by a property test;
there is no fast-check property over visibility in `packages/core`.

## Consequences

**What it buys.** One answer, stated once, that both renderers and the server
implement and that the conformance suite checks rather than trusts. A cleared
field leaves no key in the payload, so consumers test `key in data` rather than
special-casing a null.

**What it costs.** An author who wants a hidden field to keep contributing has
to say so, field by field. That is the right default, because the surprising
direction is data persisting in a branch the person filling the form could not
see — an answer to a question that was withdrawn.

**What it forecloses.** A renderer cannot keep hidden values for its own
convenience. The server strips from its own evaluation, so anything preserved
locally would vanish on submit — a worse failure than refusing it outright.

## Alternatives considered

**Always keep hidden values.** Rejected: a hidden branch then carries answers
into the stored submission that the person never saw and could not withdraw.

**Always clear them, with no opt-out.** Rejected: the case where someone reticks
a box and expects to find what they typed is real and common enough to deserve a
flag.

**Leave it to renderers.** Rejected: that is the emergent behaviour this record
exists to replace.
