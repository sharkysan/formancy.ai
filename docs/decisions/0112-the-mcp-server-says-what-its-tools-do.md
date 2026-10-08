# 0112 — The MCP server says what its tools do, answers in structure, and ships the order of operations

- **Status:** accepted
- **Date:** 2026-10-08
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/mcp/src/server.test.ts`, driven through the real protocol by
  a real client: every tool carries annotations, the local checks declare themselves
  read-only and closed-world, publishing declares itself additive, every tool declares
  the result envelope, a refusal arrives structured as well as written, the reported
  version is the manifest's, and the three prompts say the order rather than the tool
  names. **Twelve mutations were watched to redden their own cases.** One of them found
  a case passing for the wrong reason and it was tightened before being counted.

## Context

Four things were missing, and three of them were wrong rather than absent.

**A tool said nothing about what it would do.** MCP's annotations are the only thing a
client has to decide whether a call needs a person's agreement. Without them a tool
defaults to `readOnlyHint: false`, `destructiveHint: true`, `openWorldHint: true` — so
this server's local checks, which need no server and no credentials and change nothing
anywhere, were every one of them advertised as potentially destructive calls into an open
world. A host that auto-approves read-only tools and asks about the rest could not tell
`validate_form` from `publish_form`, so it either asked about everything or asked about
nothing.

**Every answer was prose with JSON glued to the end of it.** A client wanting the
structure had to find the blank line and parse what came after. The protocol has
`structuredContent` for exactly this.

**The server reported `version: '0.1.0'` while the package was on 0.3.0.** A wrong
statement in the one field a client uses to tell two installations apart, and exactly
the hand-written number this repository keeps finding stale.

**And the tools said what could be called, never in what order.** A model that writes a
document and calls `describe_spec` afterwards has already invented `type: "email"`.

## Decision

**Annotations on all nine**, in three kinds, each a claim worth testing because the
default is the opposite:

| | |
|---|---|
| `describe_spec`, `validate_form`, `diff_forms`, `check_scenarios` | `readOnlyHint: true`, `openWorldHint: false` — no server, no credentials, no network |
| `list_forms`, `get_form`, `list_submissions`, `propose_form_edit` | read-only, open world |
| `publish_form` | writes, **`destructiveHint: false`**, **`idempotentHint: false`** |

`destructiveHint: false` on publishing is not optimism. A published version is immutable
and a publish inserts a new row, so nothing is overwritten
([0025](0025-immutability-in-the-database.md)). Not idempotent, though: publishing the
same document twice makes a second version rather than the same one, and claiming
otherwise would invite a client to retry it freely.

`propose_form_edit` is read-only, which is its whole point
([0109](0109-an-ai-edit-is-reviewed-before-it-lands.md)) — and an annotation is the only
way a client learns that before calling it.

**One result envelope for all nine**, declared as `outputSchema` and returned as
`structuredContent` beside the prose: did it work, one sentence a person can read, and
the part an agent acts on. One schema rather than nine, because a client that has
learned it once has learned it everywhere and nine would be nine places for `data` to
drift from what a tool returns. **Refusals are structured too** — a refusal is the answer
a client most needs to act on, and one arriving as prose alone makes that a
reading-comprehension problem.

**The version comes from the manifest**, via `createRequire(import.meta.url)`, which
resolves `../package.json` correctly from both `src/server.ts` and `dist/index.mjs`.

**Three prompts, which is MCP's own answer to a skill pack** — `build_a_form`,
`change_a_form`, `embed_a_form`. Named for what somebody is doing rather than for the
tools they use, and each gives the **order**, which is most of the value:

- Building: the spec *first*, then the document, then `validate_form`, then scenarios —
  and written from the description rather than from the rules just written, or they
  agree with whatever the rules happen to say.
- Changing: `get_form`, edit, `propose_form_edit`, show the person, publish **with the
  hash**. The lost update is the mistake an agent makes that nobody sees until the form
  is wrong, and a prompt is the cheapest place to prevent it.
- Embedding: one framework's instructions, never both. A prompt that lists the
  alternative makes the model choose again, having just been told.

They ship with the server rather than being documentation somebody has to find and
paste.

## Consequences

**`structuredContent` is now part of the contract.** A client that was parsing the text
keeps working — the prose is unchanged — but the envelope is a published shape and
changing it is a breaking change for anyone who reads it. That is the trade for being
parseable at all.

**The annotations are hints and the protocol says so.** A client is told not to make
security decisions on annotations from an untrusted server, and this server is as
trustworthy as whoever installed it. What they buy is a host that can stop asking about
four tools that cannot do anything.

**The prompts duplicate guidance that is also in the docs.** `agents.md` says the same
things about order and about `basedOn`. Deliberate: the prompt reaches a model that
never opens the documentation, and the documentation reaches a person who never lists
the prompts. If they ever disagree, the prompt is the one that was acted on — which is
the argument for the tests asserting the prompt's content rather than its existence.

**Nothing derives the prompts from the tool list.** A tool removed tomorrow leaves a
prompt naming it, and no guard catches that. The honest fix is a test asserting every
tool a prompt names is registered; it is not here, and it is the first thing to add if a
tenth tool arrives.

## Alternatives considered

**A schema per tool rather than one envelope.** Precise, and nine places for `data` to
drift from what the tool returns — in a server whose tools all answer the same three
questions. The envelope is the shape `ToolResult` already had internally; publishing it
is the smaller change and the easier one to keep true.

**Markdown skill files in the repository rather than prompts.** They would be readable
without an MCP client and would need the client to go and find them. Prompts are the
protocol's own mechanism, they arrive with the connection, and they take arguments —
`change_a_form` can name the path it is about, which a file cannot.

**Leaving `publish_form` unannotated so hosts keep asking.** Tempting, and dishonest: it
would mean declining to say what is true in order to get a behaviour out of a client.
The right lever for "ask before publishing" is the host's policy over a correctly
labelled tool, not a wrong label.
