---
title: Typed submissions
description: The TypeScript type of what a form's submissions hold, printed from the table the engine checks every answer against — what it promises, the one place it is wider than the data, and how to generate it.
---

A form's submissions reach your code as `unknown`: `onSubmit` in either renderer, the body a
webhook receives and `GET /f/:path/submissions` all hand over the data without saying what it
is. `formancy types` prints the type it has:

```sh
npm install --save-dev @formancy/cli
npx @formancy/cli types contact.form.json --out contact-answers.ts
```

For this form:

```json
{
  "specVersion": "4",
  "id": "contact-us",
  "title": "Contact us",
  "model": {
    "fields": [
      {
        "key": "name",
        "type": "text",
        "label": "Your name",
        "required": true
      },
      {
        "key": "email",
        "type": "text",
        "label": "Work email",
        "format": "email"
      },
      {
        "key": "country",
        "type": "select",
        "label": "Country",
        "options": [
          {
            "value": "CH",
            "label": "Switzerland"
          },
          {
            "value": "DE",
            "label": "Germany"
          }
        ]
      }
    ]
  }
}
```

it prints:

```ts
// What a submission of "Contact us" holds: generated from the form by formancy. Do not edit;
// generate it again when the form changes. Form "contact-us", spec version 4, schema hash
// 0f7ac9cf1db350dad7793ea77c92ee551e380eaeb624061a3d7cb9b2bae6814f.

/**
 * The answers to "Contact us". Every key may be absent: an unanswered field has no key, a rule may
 * hide any field and take its answer with it, and `required` promises an answer only for a field
 * that is shown.
 */
export interface ContactUsAnswers {
  /** Your name */
  name?: string | null
  /** Work email */
  email?: string | null
  /** Country */
  country?: "CH" | "DE" | null
}
```

`--name` chooses what the type is called; by default it is the form's id in PascalCase,
followed by `Answers`. Without `--out` it is printed to standard output. A document that is
not a valid form is refused with what is wrong with it, rather than given a type for
submissions nobody can make.

The same text comes from code, for a build script that has the document already:

```ts
import { answersTypeScript } from '@formancy/spec'

const source = answersTypeScript(schema, { name: 'ContactAnswers' })
```

## Why it can be trusted

The type is printed from `ANSWER_KINDS`, the table in `@formancy/spec` that says what each
field type's answer is — and the engine checks **every** answer against that table first, in
the browser and when the server replays a submission, whether or not the field has a
constraint ([0189](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0189-every-answer-has-the-shape-its-type-says.md)).
An object posted for a `text` field is refused as `type`, so a stored submission's `name` is a
string or nothing. The type and the replay are two readings of one decision.

That agreement is tested rather than assumed. `packages/cli/src/agreement.test.ts` takes values
the engine keeps and values it refuses for every field type, and compiles each against the
printed type with the TypeScript compiler: everything the engine stores must compile, and
everything it refuses for its shape, its option or its row must not. The install test runs the
`formancy` bin from its packed tarball and type-checks what it prints in a project that is not
this repository.

## What it promises, and what it does not

- **Every key is optional.** An unanswered field has no key, a rule can hide any field and take
  its answer with it, and `required` promises an answer only for a field that is shown when the
  server replays the submission. A type that called a required field present would be making a
  promise the engine does not.
- **`null` means unanswered for a single answer** — a cleared number, date or choice — and never
  for a list, which is empty as `[]`, or a matrix, which is empty as `{}`. See the answer table
  under [The schema](/docs/concepts/schema/#the-answer-shape-each-type-stores).
- **A choice is a union of its options' values**, and any string when the field takes its list
  from a source the deployment resolves.
- **A file and a signature are the format's own types**, `StoredFile` and `SignatureAnswer`,
  imported from `@formancy/spec` rather than spelled out again.
- **A group nests, a page does not, and every repeater row carries `_id`.**
- **A field that collects nothing has no key.**
- **It describes one version of the form.** The header names the schema hash it was printed
  from. A submission bound to another version holds that version's answers; generate the type
  again when the form changes, and keep one per version if you read old submissions.

**The one place the type is wider than the data:** a type has no spelling for "a non-empty
string", so `''` for a date, a time or a choice with no listed options compiles although the
engine refuses it. That is the safe direction — your code is prepared for a value that never
arrives, never surprised by one that does.

## Using it

The renderers hand the data over as `unknown`, and they keep doing so: the type is yours to
apply. A submission the engine has just accepted holds answers of these shapes, so

```ts
import type { SubmitOutcome } from '@formancy/react'
import type { ContactUsAnswers } from './contact-answers'

function onSubmit(outcome: SubmitOutcome) {
  if (!outcome.ok) return
  const answers = outcome.data as ContactUsAnswers
}
```

is a statement about data the engine checked, not a guess. A webhook or an export carries the
data the server stored after its replay, which the same engine checked.
