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
- **History:** amended on 2026-09-25, when the consequence this record warned
  about had already happened. `validate_form` ran two of the publish gate's
  three checks — the schema and the expression check — and not the engine's
  own compile, so it called a document valid that the server then refused: a
  misspelled field name, a cycle, a checkbox written as a condition on its own.
  The landing page found it, when a demo form with the last of those took the
  whole page down. `engineRefusal` in `@formancy/core` now asks the engine, and
  the tool and the builder's authoring loop both call it.

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
because the tool runs the publish gate's checks in the gate's order:
`validateSchema` from `@formancy/spec`, then the engine's own compile, then
`expressionProblems` — earlier, not differently. The engine's compile is asked
by building an engine (`engineRefusal`) rather than by re-implementing its
rules, because a re-implementation is a second opinion.

One check stays on the server: the analysis that refuses a `pattern` prone to
catastrophic backtracking ([0045](0045-reject-backtracking-patterns.md)). It
needs `recheck`, an analysis engine too heavy for a package that also has to
run in a browser, and the server's refusal names the pattern, so it still
comes back as something to fix.

They did drift once, exactly as this paragraph said they could: the tool ran
the schema and expression checks and not the engine's compile, and became a
second authority that disagreed with the product. A check added to the publish
gate has to be added here in the same change, or named here as staying on the
server.

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

## The same loop, in the builder

`PromptPane` in `@formancy/builder-react` is the same idea with a person in
front of it: describe a form, get one. It is not a box that pastes a model's
answer into the editor — `authorForm` in `builder-core` parses the answer,
validates it, type-checks the expressions, and if any of that fails **tells the
model exactly what was wrong and asks again**, up to three times. Nothing
reaches the document until it would work, so the two outcomes are a valid form
or a refusal that says what was tried. There is deliberately no third outcome
where something plausible lands in the editor and somebody finds out at the
first submission.

Three attempts, not more: the first answer, one correction, and one for the
mistake the correction introduced. Past that a model is circling rather than
converging, and a person reading four failures is better served by the first.
Only the most recent complaint is repeated, because a model given three rounds
of accumulated ones starts fixing the first again.

**The model belongs to the host.** `AskModel` is a prop, exactly as `Uploader`
is a provider: this package has no vendor, no key, no network call and no
opinion about who pays for tokens. A self-hoster can point it at something on
their own hardware so that nothing about a form's contents leaves their
network, and without the prop the pane renders nothing rather than a button
that cannot work. It also makes the loop testable with a scripted function,
which is why it has fifteen cases and no mocking library.

The result lands through `session.replaceDocument`, which is **one undoable
step**. Ctrl+Z after "write me a contact form" puts back what was there, which
is the only behaviour anybody would expect.

## Alternatives considered (continued)

**Ship an agent skills library too.** Deferred, not rejected. Skills are prose
and prose is cheap to write and expensive to keep true; the tools have tests
and the descriptions are asserted. A skills library on top of a tool surface
that has proved itself is a better second step than both at once.
