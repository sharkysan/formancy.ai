---
title: Drafts
description: How a part-filled form is saved and resumed, why a draft carries a token rather than an id, and the three things a host has to get right.
---

A draft is a part-filled form kept so that closing the tab does not lose half an
hour of typing. The public plane is anonymous, so a draft has no account behind
it — which is exactly why it has a key of its own.

## Three calls

**Start one.** The server picks the id and signs it:

```http
POST /f/contact-us/drafts
```

```json
{ "draftId": "0193…", "token": "8f2c…" }
```

**Save.** Send the token:

```http
PUT /f/contact-us/drafts/0193…
X-Formancy-Draft-Token: 8f2c…

{ "email": "wip@example.ch" }
```

**Resume.** Same token:

```http
GET /f/contact-us/drafts/0193…
X-Formancy-Draft-Token: 8f2c…
```

```json
{
  "outcome": "resumed",
  "version": 3,
  "schema": { "…": "…" },
  "schemaHash": "…",
  "data": { "email": "wip@example.ch" },
  "migration": { "severity": "lossy", "changes": [{ "kind": "field.removed", "path": "fax" }] }
}
```

Without the header both answer **401**. With a token that does not match, the
`GET` answers **404** and the `PUT` answers **403**.

## Why the token, and why you cannot choose the id

The id used to come from the caller, and neither route checked anything. Knowing
or guessing an id was enough to read a stranger's part-filled form — and to
**overwrite** it, after which that person resumes what they believe is their own
form, does not re-read the fields they already filled in, and submits the
substituted content under their own name.

So the server mints the id and signs it, and the signature is the key
([0062](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0062-a-draft-carries-its-own-key.md)).
A `GET` with a wrong token answers exactly like a draft that does not exist, so
the reply cannot be used to find out which ids are real.

**Keep the token, not the id.** The id is no longer a secret and the token is the
only way back in. Losing it loses the draft, and there is no recovery path —
because a recovery path that works for whoever asks is the hole again.

`localStorage` is the usual place. A link somebody can keep also works, and is
what to use when a draft has to survive a different device:

```
https://example.ch/apply?draft=0193…&token=8f2c…
```

That puts the key in a URL, which means in history, in a shared screenshot and in
any analytics that logs query strings. Decide that deliberately.

## The three things to get right

### Debounce the save

The obvious implementation saves on every change, and every save is a database
write. A form somebody is typing into produces one per keystroke.

```ts
let pending: ReturnType<typeof setTimeout> | undefined

engine.subscribe(() => {
  clearTimeout(pending)
  pending = setTimeout(() => void save(engine.value()), 2_000)
})
```

Two seconds of quiet is a reasonable floor. The draft routes are rate-limited on
the same terms as submissions, so an undebounced save will start returning
**429** rather than quietly costing you — but a form that hits its own rate limit
while somebody types is a form that stops saving exactly when they are working
hardest.

### Show the migration report

A resume can come back with `migration`, which means the form was republished and
some answers no longer have a field to sit in. They are kept — moved to
`data.__orphaned` and never deleted — but they are **not on the form any more**.

If you do not show this, somebody resumes, sees fields they know they filled in
now empty, and submits believing everything they typed is included. Both
renderers ship the notice:

```tsx
import { FormancyForm, FormancyProvider, ResumeNotice } from '@formancy/react'

<FormancyProvider engine={engine}>
  <ResumeNotice migration={resumed.migration} labels={{ fax: 'Fax number' }} />
  <FormancyForm />
</FormancyProvider>
```

```html
<formancy-resume-notice [migration]="resumed.migration" [labels]="labels" />
```

It renders nothing when there is nothing to report, names what was set aside,
says the answers are still kept, and takes focus so it is not missed on a form
somebody has scrolled. Pass `labels` where you can: a field key is what the
schema calls it, not what the question asked.

**Nothing forces you to render it.** Resuming is your call, because you hold the
transport — so this is the one part of the draft story the library cannot
guarantee, and it is recorded that way in the
[safety analysis](https://github.com/sharkysan/formancy.ai/blob/main/docs/regulatory/SAFETY-ANALYSIS.md)
under B2 rather than glossed over.

### Handle the read-only outcome

When the form changed too much to rebind, `outcome` is `readOnly` and the draft
comes back against its **own** version rather than the current one. The honest
thing is to show it as it was and say it cannot be submitted, which is what the
notice does for `severity: 'breaking'`. Offering "start over" is the other half,
and only you know where that should lead.

## What a draft is not

**Not a submission.** Nothing validates a draft on the way in: it is whatever was
typed so far, including values that would be refused on submit. Validation happens
when it is submitted, against the version being submitted to.

**Not private from the deployment.** The token keeps other *visitors* out. A draft
is a row in your database like any other, readable by whoever can read the
database, and it holds personal data that the person has not yet chosen to send
you. That is worth a thought about retention: orphaned answers in particular
persist indefinitely, and deciding how long is a question the product has to
answer rather than the library.

**Not expiring.** The token has no expiry, so a leaked one stays good until the
draft is swept. That is a weaker bound than an expiry would be, and it is stated
here rather than left to be discovered.
