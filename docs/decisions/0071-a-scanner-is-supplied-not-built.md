# 0071 — A scanner is supplied, not built

- **Status:** accepted
- **Date:** 2026-09-27
- **Deciders:** Daniel Bacher
> **Two corrections applied before this landed**, both found by review rather than by the
> tests, and both about the widget line this record rests on.
>
> **A scanned answer is now sanitised the way the control would.** `<input type="text">` runs
> HTML's value sanitization algorithm — "strip newlines from the value" — so a typed or
> pasted answer can never hold CR or LF. A scanned one can: a Wi-Fi or vCard payload is
> several lines. Storing it verbatim put a value in the answer that typing could not produce,
> which is precisely what a widget may not do. jsdom does not implement that sanitiser, so
> nothing noticed until a case asserted it; removing the fix now fails that case.
>
> **The button no longer disables itself while scanning.** Disabling the element somebody just
> pressed blurs it, and the browser resets focus to `<body>` — so a keyboard user who presses
> Scan is returned to the top of the document, and the status line then tells them to type the
> value instead into a field they have to find again. Busy is said with `aria-busy`, which does
> not touch focus, and a re-entrancy guard in `read` does what `disabled` was doing. **Not
> covered by a test**, and that is stated rather than implied: jsdom does not blur a focused
> element that becomes disabled, which is exactly why it was written the other way round first.
> The four themes name `aria-busy` alongside `:disabled` because the scanning state used to be
> carried by the latter.

- **Verified by:** `packages/react/src/scanner-widget.test.tsx` and
  `packages/angular/src/scanner-widget.test.ts` (9 cases each, deliberate near-copies:
  the control is still a `textbox` with the same accessible name; with no scanner there
  is **no button** and typing still stores; each button is named after its own field; a
  scan stores the string typing would; the request carries the label and the path; a
  scan the `pattern` refuses is stored and then refused by the engine at submit; a
  refused camera appears in the field's `role="status"` region and **not** in its error
  region; a cancel says nothing; a scanner returning a non-string stores nothing).
  Rendering the button unconditionally fails the second case in both renderers; writing
  the device message into the error region fails the seventh; checking the `pattern`
  before storing fails the sixth. `apps/docs/src/themes.test.ts` fails until every theme
  styles `scanner-button` and `scanner-status` with custom properties it defines, and
  `apps/playground/src/starter.test.ts` fails until the demo shows the widget.

## Context

`widget: "scanner"` on a `text` field has been in `FIELD_WIDGETS` since
[0065](0065-a-widget-is-authored-not-registered.md), and named again in
[0070](0070-a-code-is-an-arrangement-not-a-field.md) as the half of the QR-code request
that *writes* an answer. The name validated; no renderer did anything with it. That is
the documented-but-inert state this repository has shipped once already, so the question
was never whether to build the control but what the control may contain.

Three things a renderer cannot own:

- **Camera permission policy.** When to ask, what to say first, what to do on a refusal
  and whether to ask again are product decisions with regulatory weight in some
  deployments. A renderer that asks on its own behalf has made them for everybody.
- **A decoder.** Reading a QR code is a locator pass, a perspective transform and
  Reed–Solomon decoding — a dependency in a package whose budget is 4 kB brotli, and a
  row in `SOUP-DECLARATION.md` for every consumer including the Node engine.
- **The viewfinder.** It is a full-screen surface with its own accessibility story, in a
  design system the renderer knows nothing about.

## Decision

**The host supplies a `Scanner`, exactly as it supplies an `Uploader`.**

```ts
type Scanner = (request: { label: string; path: string }) => Promise<string | null>
```

`ScannerProvider` in React, `provideFormancyScanner` in Angular. The renderer renders a
button, awaits a string, and stores it.

**No scanner means no button, and the field is the default text input.** Undefined is a
supported state, not a misconfiguration — and unlike the file field it costs the person
filling the form in nothing, because typing was always this field's primary route. A
`Scan` button that opens nothing is worse than no button: it is a promise the form cannot
keep, and it is worse for somebody using a screen reader than for anybody else, because
they cannot see that nothing happened. The file field renders a message in its absence
because without an uploader it collects nothing at all; a text field without a scanner
still collects the answer.

**Typing always works.** That is the accessibility floor — a camera is a pointer gesture
with no keyboard equivalent, so it can only ever be a second route (WCAG 2.1.1) — and it
is the fallback for a refused permission, a missing camera, a code too damaged to read
and a person who would rather type. The same sentence covers both, which is the sign it
is the right design and not two accommodations.

**The button is named after its field**: visible text `Scan`, and the field's label
completing the accessible name, so a page with three scannable fields does not offer
three buttons called "Scan". The visible word is still contained in the accessible name
(WCAG 2.5.3), and the two are distinguishable by name alone — which is all a conformance
driver may use ([0034](0034-accessible-name-only.md)).

**A device failure goes to the field's own `role="status"` region, never to its error
region.** The error region is the control's `aria-describedby` target, its text is the
engine's verdict on the answer, and it only appears once the field is touched and
invalid. Writing "camera permission was refused" there would describe a hardware problem
as a wrong answer, and would mean a renderer inventing content for a region the engine
owns. The message names the way forward — *type the value instead* — because there always
is one. This is the shape the file field already uses for an upload that did not happen.

**A refusal and a cancel are different answers.** Rejecting means the device did not
work and is said out loud; resolving with `null` means nobody scanned anything, and the
field says nothing at all. An apology in a live region for a decision somebody made on
purpose is noise.

**The scanned value is not validated before it is stored.** It goes through the same
`setValue` a keystroke goes through, and the engine judges it exactly when it judges a
typed answer. A scan the field's `pattern` refuses is therefore stored and then refused —
visibly, in the error region, with the value still in the input to correct. The
alternative, dropping it, discards the only record of what the camera read and leaves the
field looking untouched: the person scanned something, the form says nothing, and they
have no way to find out whether the camera or the form was at fault.

## Consequences

**The widget changes no role and no name, so it affects no existing fixture.** The
control is `<input type="text">` before and after, with the same label wiring, so every
conformance fixture that finds a text field by role and accessible name is untouched —
the same happy consequence `toggle` had. What is added is a `button` inside the field, and
only where a host supplied a scanner; no fixture supplies one, so no fixture sees one.

**One `setValue` call site per renderer, taking a `string`.** The camera and the keyboard
both go through `commit(text: string)`, which is why "a widget never changes what a field
collects" is structural here rather than careful. It also makes a host written in plain
JavaScript harmless: a scanner resolving with `{ text: 'ABC123' }` cannot put an object
into a text answer, and is reported as the device failure it is.

**A `text` field now carries per-field component state in both renderers** — whether a
scan is in flight, and the last device message. Cheap, and it is the first time the
plainest field in the kit has any; a renderer that grows a third such widget should look
at whether that state belongs somewhere shared.

**The playground supplies a prompt instead of a camera.** `window.prompt` has the
contract's exact shape, including `null` for a cancel, and the rich-text link button set
the precedent for asking that way rather than building a dialog this project would then
own the accessibility of. It demonstrates the button, its name, the value landing in the
engine and the `pattern` refusing a scan — everything except the decoding, which is the
part that is deliberately not ours.

**No decoder is shipped, and that is stated rather than hidden**, in the roadmap, in the
docs and in `11-risks-and-debt.md`. A consumer with no scanner gets a field that works by
typing; a consumer with one gets both routes.

## Alternatives considered

**`getUserMedia` plus `BarcodeDetector` in the renderer.** Tempting, because Chrome and
Android have `BarcodeDetector` built in and the code is short. Rejected: it is absent in
Safari and Firefox, so the feature would work on some of a customer's devices and not
others with nothing in the document saying which; and it puts the permission prompt, the
viewfinder and a camera-lifecycle bug in a package that ships no CSS and, until now, no
device access at all.

**A decoder behind an optional peer dependency.** Same answer as the QR encoder in
[0070](0070-a-code-is-an-arrangement-not-a-field.md): an optional dependency most
consumers do not install is a feature most consumers do not have, described as though
they did.

**A read-only field with a message, mirroring the file field.** Rejected: the file field
has nothing else to offer, a text field has the whole answer. Making a field unusable
because a *second* route to it is unavailable would be the accessibility failure this
design exists to avoid.

**A `scanner` field type rather than a widget.** Rejected by 0065's line, and it is the
easy side of that line: the answer is a string somebody could type, the validation is a
string's validation, the stored value is byte-identical. Nothing about the model changes,
so nothing about the model should.

**Putting the device message in the error region and marking it somehow.** Considered
because it is one fewer region to style, and rejected: the mark would have to be
understood by a theme, a screen reader and the error summary, and the error summary links
to fields with wrong answers. A camera that will not open is not a wrong answer, and the
summary would send somebody to a field whose value is fine.

**A `scanning` state pushed into the engine, so both renderers share it.** Rejected for
now: the engine is the form's state and the same build runs on the server
([0006](0006-one-engine-build.md)), where a camera is meaningless. Device state belongs
to the device's own renderer.
