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
<PromptPane session={session} ask={askModel} />
```

Without the prop the pane renders nothing, rather than a button that cannot
work.

**Give it the form's examples, and it runs them before you decide.** A rule turned
the wrong way round passes every check above, and the change list says only that
the rule changed. An example with its answer written down tells the two apart. Pass
the pane the examples your `ScenarioPane` runs, with the same `scenarios`,
`initialValue` and `mode`:

```tsx
<PromptPane session={session} ask={askModel} scenarios={scenarios} initialValue={sample} />
```

The pane then runs them against the form as it is and as the answer would leave it.
The review's heading names each example that would stop holding, and the status
names those and any that would hold again. Apply stays enabled: a rule you asked to
change stops its old example holding, and the decision is yours. A rule no example
pins gets no warning. Without `scenarios`, the review says nothing about examples
([0160](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0160-a-proposal-is-checked-against-the-forms-examples.md)).

### Writing `askModel`

An `AskModel` is one turn: a prompt in, the model's text out. Point it at an
endpoint **on your own server**, and keep the model's key there. A key in the
browser is a key anybody who opens the page can read.

```ts
import type { AskModel } from '@formancy/builder-core'

export const askModel: AskModel = async ({ system, user }, turn) => {
  // The person can stop the run while this waits. Abort the request when they
  // do, so your server stops too rather than paying for an answer nobody reads.
  const controller = new AbortController()
  turn.onCancel(() => controller.abort())

  const response = await fetch('/api/form-model', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ system, user }),
    signal: controller.signal,
  })
  if (!response.ok) throw new Error(`The model service answered ${response.status}.`)
  const { text } = (await response.json()) as { text: string }
  return text
}
```

`/api/form-model` is yours to write: it adds the key, calls whichever model you
use with `system` as the system prompt and `user` as the message, and answers
with the text. Abort that call when the browser's request closes, and a stop in
the browser ends the call to the model as well.

**While a run waits, the pane shows Stop.** Pressing it, or taking the pane off
the screen, ends the run at once, calls what you gave `turn.onCancel`, and
discards whatever the model answers afterwards. A function written without the
second argument is stopped all the same: the pane stops waiting for it, though
its request runs on. A function that wraps another `AskModel` hands `turn` on
with the prompt; the types require it, so a wrapper cannot drop the stop.

**When your function throws or rejects,** the pane says the model could not be
reached, followed by your error's message, rather than that the document did not
work. Write the message for the person reading it. Something thrown without one —
`undefined`, an event, an empty string — is said without a reason.

**When the format cannot do what was asked,** the model may say so. "Email me every
submission" is one such request: a form document says what a form asks and checks,
not where an answer goes. The briefing tells the model not to write a document that
does part of the request, and to answer `{"declined": "<why>"}` instead. The run
ends on that answer rather than asking again. A decline with no reason in it does not
end the run: the next turn asks the model for one. The pane says the model declined, and
shows its reason, as text, where the problems would be. Nothing is applied. The
reason is the model's own claim, and nothing checks it: if it declined something a
form can do, reword the instruction and ask again.

If your model service refuses a request itself, in its response rather than in its
text, return a decline for it, with a sentence for the person reading it:

```ts
import { declinedAnswer } from '@formancy/builder-core'

// Inside your AskModel, where the service's answer is read:
if (refused) return declinedAnswer('The model service would not answer this request.')
```

The run then ends the same way, rather than reporting a model that could not be
reached. A blank reason throws, because it would not read as a decline.

Each turn also says which it is: `attempt` and `limit`, and from the second turn
`followUp`, which is the complaint alone. `user` always carries the whole
instruction with the latest complaint, so a function that keeps no conversation
sends `user` every time. One that keeps a conversation, whose history already
holds the model's last answer, can send `followUp` instead.

Called directly, `authorForm(askModel, instruction, { current, stop })` resolves
however the run ends. A working document is `ok: true`. Otherwise `ended` says why
there is none: `gave-up`, `stopped`, `unreachable` with your error's message as
`reason`, absent when it had none, or `declined` with the model's reason as `reason`.
`stop` comes from `createStop()`; calling its `stop()` is the button.
