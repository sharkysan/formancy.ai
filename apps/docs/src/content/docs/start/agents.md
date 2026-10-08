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

The same goes for the mistakes the engine refuses outright — a misspelled field
name, a cycle between two computed fields, or a checkbox written as a condition
on its own. `validate_form` builds the same engine the server's publish gate and
every renderer build, so it does not call a form valid whose logic the server
would then refuse, and it says what to write instead:

```
Rule on "phone" (visible): A visible expression must produce bool, but this one
produces dyn. A checkbox nobody has touched is null rather than false, so it
cannot be a condition on its own: write callback == true.
```

## The tools

| Tool | Needs a server | What it is for |
| --- | --- | --- |
| `describe_spec` | no | Every field type, layout kind, rule kind and format. Call it before writing anything. |
| `validate_form` | no | The server's publish checks, without publishing: schema, the engine's compile, expressions that never evaluate. |
| `diff_forms` | no | What a change would do to submissions already collected: compatible, lossy or breaking. |
| `check_scenarios` | no | Run a form against examples with their answers written down, and report which stopped holding. The only check that catches a condition written backwards. |
| `propose_form_edit` | yes | Hold an edit up against the published form **without publishing it**: what it would cost submissions already collected, plus the `basedOn` hash to publish with. |
| `publish_form` | yes | Publish — after validating locally and refusing to send a document that would not work. Takes `basedOn`, and refuses when the form has changed since. |
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

### `check_scenarios` catches the rule written backwards

`validate_form` says a document works. It cannot say the condition is the opposite of
the one you were asked for, because

```
visible: leaveType == 'other'
visible: leaveType != 'other'
```

are both valid CEL. Both compile, both type-check, both satisfy the schema and the
engine. One of them asks a question nobody should be asked, and the difference is not in
the document — it is between the document and what somebody meant.

An example with its answer written down is the only thing that can see it:

```json
{
  "name": "other shows the reason",
  "changes": { "leaveType": "other" },
  "valid": true,
  "visible": { "reason": true }
}
```

A scenario can pin whether the form validates, which error codes each field carries,
which fields are visible, what each holds, and which paths the submission does **not**
carry — the last one because validity alone cannot tell a cleared branch from one that
was never filled. Write one for every rule you add. The tool refuses an empty set rather
than reporting that all nought scenarios hold.

### Changing a form that exists is a two-step tool call

`validate_form` says a document works. It does not say that your rewrite
dropped an option somebody has already chosen, and an agent reading only its
own two documents cannot tell either — it has not seen what is published.

So `propose_form_edit` fetches the live form, diffs against it and answers with
the change list and a `basedOn` hash. Put the change list in front of the
person; publish with the hash when they agree.

The hash is not ceremony. **A formancy document is the whole form**, so
publishing an edit based on an older version silently reverts whatever somebody
published in between — and the publish succeeds, so nothing reports it.
`publish_form` with `basedOn` refuses that; without it, the older behaviour is
still there, because a form being created for the first time has nothing to be
based on. The two builders hold the same rule against a session rather than a
server ([0109](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0109-an-ai-edit-is-reviewed-before-it-lands.md)).

## What a tool says about itself

Every tool carries annotations, which is the only thing a client has to decide
whether a call needs your agreement before it happens. The five that need no server
— `describe_spec`, `validate_form`, `diff_forms`, `check_scenarios` and the checking
half of publishing — declare themselves read-only and closed-world, so a host can run
them freely. `publish_form` declares that it writes, that it is **not** destructive
(a published version is immutable, so a publish adds rather than overwrites) and that
it is **not** idempotent (publishing twice makes two versions).

Each answers with a structured result beside the prose — the same envelope every
time: whether it worked, a sentence to read, and the part to act on. Refusals too,
which is the answer you most need to act on.

## Three prompts, for the three things you ask

`build_a_form`, `change_a_form` and `embed_a_form`. They ship with the server, so
they arrive with the connection rather than being documentation somebody has to find
and paste, and they give the **order** rather than the tool names:

- **Building** calls `describe_spec` first. A model that writes the document first
  has already invented `type: "email"`, and the correction costs a turn. Scenarios
  come last and are written from the description rather than from the rules just
  written — otherwise they agree with whatever the rules happen to say.
- **Changing** goes `get_form` → edit → `propose_form_edit` → show the person →
  `publish_form` with the hash. Never straight to publish.
- **Embedding** answers for one framework, not both.

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
`@formancy/builder-react` — and `FormancyPromptPane` from
`@formancy/builder-angular` — takes an instruction, and the answer is parsed,
validated, compiled by the engine and type-checked before anything reaches the
editor. If it fails, the model is told what was wrong and asked again.

**And then it is shown rather than applied.** Valid is not the same as wanted:
a document passes every one of those checks with the condition inverted that
you asked to loosen. The pane lists what the answer would change — the same
list `diff_forms` gives, marking what costs answers already collected — and
applies nothing until you press the button. A proposal written against a form
that has since changed is refused rather than applied over the change, because
a document is the whole form.

The model is yours. `ask` is a prop, the way an uploader is a provider: no
vendor, no key and no network call inside any formancy package, so you can
point it at something on your own hardware and nothing about a form's contents
leaves your network.

```tsx
<PromptPane session={session} ask={myModel} />
```

Without the prop the pane renders nothing, rather than a button that cannot
work.
