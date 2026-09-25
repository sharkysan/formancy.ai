# 0056 — An agent gets the checks, not just the API

- **Status:** accepted
- **Date:** 2026-09-25
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/mcp/src/tools.test.ts` (17 cases, including the two
  that matter: an invalid document never reaches the socket, and an expression
  that compiles and then never evaluates is refused at the same gate) and
  `packages/mcp/src/server.test.ts` (10 cases driven through the real protocol
  by a real client, because a tool registered with the wrong argument name is
  invisible in a unit test and fatal in use). The built binary was also
  launched as a client launches it and spoken to over stdio.

## Context

form.io ships [`@formio/ai`](https://github.com/formio/ai): an MCP server and a
skills library that let a coding agent drive their Enterprise Server by natural
language. It is a good idea and the obvious one — their REST API, exposed as
tools.

Copying that shape would be easy and would miss what formancy has.

A model writing a form is a model writing **logic**, and logic is where a model
is least reliable and least correctable. A wrong expression does not throw. It
shows the wrong field to the wrong person, or computes nothing into a box
somebody needed a number in, and it does that quietly for a year. Wrapping a
REST API in tool definitions does nothing about that: the model writes a
document, the server stores it, and everybody finds out later.

## Decision

**The tools check before they act, and the checking half needs no server.**

`@formancy/mcp` exposes seven tools. Three of them — `describe_spec`,
`validate_form`, `diff_forms` — are pure functions of their arguments and run
with nothing deployed. `publish_form` runs `validate_form` first and **refuses
to open a socket** for a document that would not have worked.

This is possible because of decisions taken long before anybody thought about
agents, and it is worth naming which:

- The document format is purpose-built and has a published JSON Schema
  ([0001](0001-purpose-built-spec.md)), so a generated document is checkable
  rather than merely plausible.
- Expressions are CEL and are statically type-checked ([0016](0016-cel.md)), so
  `seats * 4` against a number field is an error with a sentence attached
  rather than a field that stays empty ([0054](0054-expressions-that-never-work.md)).
- `diffSchemas` grades a change against the submissions already collected, so
  "will this break the data" is a tool call rather than a judgement.
- CEL is non-Turing-complete by construction, so a model-written expression
  cannot loop, cannot reach the network and cannot be code
  ([0040](0040-no-eval.md)).

**`describe_spec` exists because of what a model does without it.** Asked for an
email field it writes `type: "email"`, because that is what every other form
builder calls it. Told the list first, it writes `type: "text"` with
`format: "email"` and the turn is not wasted. The same tool carries the four
things about this format that are counter-intuitive enough to have cost time in
this repository: that a version 1 document may not hold a version 2 construct,
that an empty list answer is `[]` and never null, that a JSON number is a
double so `4` must be written `4.0`, and that a field key is identity rather
than a label.

## Consequences

**What it buys.** The failure a model is worst at is the one the product is
best at catching, and the catch happens before anything is stored. An agent
gets `no such overload: double * int … write 4.0` instead of a 422 it has to
interpret, or worse, a 201 and a form that quietly does nothing.

It also means the interesting half works with nothing installed. A developer
evaluating formancy can have an agent write and check a whole form before
deciding whether to run a server, which is a better first five minutes than any
amount of documentation.

**What it costs.** Two implementations of "is this document alright" could
drift — the server validates on publish too, and it must. They do not drift
here because both call `validateSchema` from `@formancy/spec`; the MCP tool
runs it earlier, not differently. If either ever grows its own opinion, this
record is wrong and the tool becomes a second authority that disagrees with the
product.

The tool descriptions are prompts, and prompts are untested code in most
projects. They are exported as `TOOL_DEFINITIONS` and asserted on, because a
description that fails to say *when* to call a tool produces a tool nobody
calls.

## Alternatives considered

**Wrap the REST API and stop there.** Rejected: it is what a competitor already
ships, and it declines to use the one thing this product has that theirs does
not.

**Let the model write CEL freely and catch problems at publish.** Rejected on
timing rather than principle — the server does catch them, which is why this is
safe. But a model corrects what it is told about in the same turn, and forgets
a form it published three turns ago.

**Describe the document format in the tool schema, in Zod.** Rejected: the
spec's own JSON Schema is the authority on what a formancy document is, and a
second description of it in another dialect is a second authority. The day they
disagree, the tool refuses something the product accepts. `document` is
`unknown` and is checked by `validateSchema`.

**Ship an agent skills library too.** Deferred, not rejected. Skills are prose
and prose is cheap to write and expensive to keep true; the tools have tests
and the descriptions are asserted. A skills library on top of a tool surface
that has proved itself is a better second step than both at once.
