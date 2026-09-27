---
title: Scanning
description: How a camera route to a text answer works, why formancy ships no decoder, where a refused permission is reported, and what the field does when there is no scanner at all.
---

`widget: "scanner"` on a `text` field asks for a camera route to an answer somebody
could otherwise type — a serial number off a label, a booking reference off a ticket,
a code off a parcel:

```json
{
  "key": "voucher",
  "type": "text",
  "widget": "scanner",
  "label": "Voucher code",
  "pattern": "[A-Z0-9]{6}"
}
```

The answer is a string, the validation is a string's validation, and the stored value
is byte-identical to the typed one. **A widget changes how a field looks and never
what it collects** — that is the line the whole widget mechanism exists to hold.

## formancy does not scan anything

There is no decoder in here, and there will not be one. Reading a QR code is a
locator pass, a perspective transform and Reed–Solomon decoding: a dependency in a
package budgeted at 4 kB brotli, and a row in `SOUP-DECLARATION.md` for every
consumer of it, including the Node engine that never sees a camera.

Two more things a renderer must not own:

- **Camera permission policy.** When to ask, what to say first, what to do about a
  refusal and whether to ask twice are product decisions, with regulatory weight in
  some deployments. A renderer that asks on its own behalf has made them for you.
- **The viewfinder.** A full-screen surface with its own accessibility story, in a
  design system this package knows nothing about.

So you supply one function, and everything behind it is yours:

```tsx
import { ScannerProvider } from '@formancy/react'
import type { Scanner } from '@formancy/react'

const scan: Scanner = async ({ label, path }) => {
  // open your camera sheet, decode, and return the text — or null if they closed it
  return text
}

<ScannerProvider value={scan}>
  <FormancyForm />
</ScannerProvider>
```

Angular takes the same function through `provideFormancyScanner(scan)`.

`label` is the field's resolved label, so your sheet can say what it is looking for;
`path` is the field's data path, so a host can log or meter one field's scans.

## `null` is a cancel; throwing is a failure

They are deliberately different answers.

**Resolve with `null`** and nobody scanned anything — the sheet was closed, they
changed their mind. The field says nothing, because an apology in a live region for a
decision somebody made on purpose is noise.

**Throw** and the device did not work: permission refused, no camera, a stream that
died. The field says so, in **its own `role="status"` region**, and names the way
forward — *type the value instead*.

:::note[Not in the error region, deliberately]
The error region is the control's `aria-describedby` target and it carries the
engine's verdict on the answer. "Camera permission was refused" put there describes a
hardware problem as a wrong answer, and the error summary — which links to fields with
wrong answers — would send somebody to a field whose value is fine.
:::

## What the camera read is stored, then validated

The scanned string goes through the same `setValue` a keystroke goes through, and the
engine judges it exactly when it judges a typed answer. So a scan your `pattern`
refuses is **stored and then refused**, visibly, with the value still in the input to
correct or retype.

The alternative — checking the pattern before storing and dropping what does not
match — discards the only record of what the camera read and leaves the field looking
untouched. The person scanned something, the form said nothing, and they cannot tell
whether the camera or the form was at fault.

## With no scanner, there is no button

Leaving the scanner out is a supported state, not a misconfiguration: the field
renders as the ordinary text input and nothing says anything is missing. This is
different from a `file` field, which says plainly that there is nowhere to put a file
— because without an uploader that field collects nothing at all, while a text field
without a scanner still collects the whole answer.

**Typing always works.** A camera is a pointer gesture with no keyboard equivalent,
so it can only ever be a second route to an answer
([WCAG 2.1.1](https://www.w3.org/WAI/WCAG22/Understanding/keyboard)) — and the same
input is the fallback for a refused permission, a damaged code, a dark room and
somebody who would simply rather type. One sentence covers both, which is the sign it
is one design rather than two accommodations.

## Several scannable fields on one page

Each button's accessible name carries its field's label — visible text `Scan`, and the
label completing the name — so a form with three of them does not offer three buttons
called "Scan". The visible word is contained in the accessible name
([WCAG 2.5.3](https://www.w3.org/WAI/WCAG22/Understanding/label-in-name)), and the
buttons are distinguishable by name alone, which is all a conformance driver is
allowed to use.

## Styling it

Two part hooks, and every shipped theme styles both:

| Part | What it is |
| --- | --- |
| `scanner-button` | The button beside the input. Sized for a thumb, and secondary to the input rather than louder than it |
| `scanner-status` | The polite live region: `Scanning…`, or the device message. Hidden while empty |

## Not built

- **A decoder, in any form.** See above; this is a decision rather than a gap
  ([0071](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0071-a-scanner-is-supplied-not-built.md)).
- **Scanning into anything but a `text` field.** A code that carries a date or a
  number would have to be parsed into that type's shape, and a scanner that parses is
  a scanner that can disagree with the engine about what a value means.
- **A `scanner` on a repeater, adding a row per scan.** Frequently wanted, and a
  different feature: it writes to the model rather than to a field, so it is not a
  widget.
