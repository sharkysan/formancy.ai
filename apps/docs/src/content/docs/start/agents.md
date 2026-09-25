---
title: "Quickstart: coding agents"
description: Install the formancy MCP server so an agent can write a form, be told exactly what is wrong with it, and publish it.
---

```bash
claude mcp add formancy -- npx -y @formancy/mcp
```

That is the whole installation. Seven tools appear in the agent, and **four of
them work immediately with no server, no API key and no account** — so you can
have an agent write and check a complete form before deciding whether to run
anything.

## Why this is not just the API with a prompt in front of it

An agent writing a form is writing **logic**, and logic is where a model is
least reliable and, more importantly, least *correctable*. A wrong expression
does not throw. It shows the wrong field to the wrong person, or quietly
computes nothing into a box somebody needed a number in, and it does that until
a human notices months later.

formancy can catch that before the form exists, because the document format has
a published JSON Schema and the expression language type-checks. So the tools
**check first and act second**.

Ask an agent for a total that is four times the number of seats and it will
reach for `seats * 4`. Here is what it is told:

```
The document is structurally valid, but 1 expression(s) will never do anything.
These compile and then fail at evaluation, so nothing would report them at
runtime: a computed field would stay empty and a visible rule would show the
field it was meant to hide.

  monthly (computed): no such overload: double * int. This evaluates to nothing
  for every value anybody enters, so the rule never does anything. A number
  field holds a double and CEL will not widen a whole number to meet it, so
  write the literals with a decimal point — 4 becomes 4.0.
```

The agent fixes it in the next turn. Without this it would publish a form that
looks right and computes nothing.

## The tools

| Tool | Needs a server | What it is for |
| --- | --- | --- |
| `describe_spec` | no | Every field type, layout kind, rule kind and format. Call it before writing anything. |
| `validate_form` | no | Check a document and type-check its expressions, without publishing. |
| `diff_forms` | no | What a change would do to submissions already collected: compatible, lossy or breaking. |
| `publish_form` | yes | Publish — after validating locally and refusing to send a document that would not work. |
| `list_forms` | yes | The forms on the server, with their current version. |
| `get_form` | yes | One document, with its version and schema hash. |
| `list_submissions` | yes | Submissions for one form. |

### `describe_spec` earns its place

Asked for an email field, a model writes `type: "email"` — because that is what
every other form builder calls it. formancy has no such type; an email field is
`text` with `format: "email"`. Told the list up front, the agent gets it right
the first time instead of spending a turn discovering it.

The same tool carries the handful of things about this format that are
counter-intuitive enough to catch people out: that a version 1 document may not
contain a version 2 construct, that an empty list answer is `[]` and never
null, that a JSON number is a double, and that a field key is identity rather
than a label.

### `diff_forms` answers the question that cannot be un-answered

Publishing over an existing form is the one edit with permanent consequences.
`diff_forms` grades it against the data already collected, so "will this break
anything?" is a tool call rather than a judgement:

- **compatible** — existing drafts and submissions rebind silently.
- **lossy** — they rebind, but some answers no longer have a field to live in.
  They are kept under `data.__orphaned`, never deleted.
- **breaking** — existing drafts *cannot* rebind and open read-only against the
  version that produced them.

## Connecting it to a server

```bash
FORMANCY_URL=http://localhost:4380 \
FORMANCY_API_KEY=fk_… \
  npx -y @formancy/mcp
```

Set both or neither. Half-configured is refused at startup: a URL with no key
returns 401 on every call and a key with no URL does nothing, and both look
like a broken tool rather than an unconfigured one.

See [self-hosting](/docs/start/self-hosting/) for how to mint an API key.

## Other clients

Anything that speaks the Model Context Protocol. The server runs over stdio, so
the client launches the process and talks down its pipes — nothing listens on a
port:

```json
{
  "mcpServers": {
    "formancy": {
      "command": "npx",
      "args": ["-y", "@formancy/mcp"],
      "env": { "FORMANCY_URL": "http://localhost:4380", "FORMANCY_API_KEY": "fk_…" }
    }
  }
}
```

## In the builder, for people who are not using an agent

The same loop is available with a person in front of it. `PromptPane` from
`@formancy/builder-react` takes an instruction, and the answer is parsed,
validated and type-checked before anything reaches the editor — if it fails,
the model is told what was wrong and asked again.

The model is yours. `ask` is a prop, the way an uploader is a provider: no
vendor, no key and no network call inside any formancy package, so you can
point it at something on your own hardware and nothing about a form's contents
leaves your network.

```tsx
<PromptPane session={session} ask={myModel} />
```

Without the prop the pane renders nothing, rather than a button that cannot
work.
