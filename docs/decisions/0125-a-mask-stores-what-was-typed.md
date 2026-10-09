# 0125 — A mask stores what was typed, and one function decides where a character lands

- **Status:** accepted
- **Date:** 2026-10-09
- **Verified by:** `packages/spec/src/mask.test.ts` — what a mask is made of, whether an
  answer fills it, what the control shows, and each kind of edit: a digit typed into an
  empty field, past a written character, in the middle; backspace and delete beside a
  written character; a formatted value pasted whole; bare digits pasted; too many; two
  identical neighbours told apart by the caret; a letter outside the BMP; and the document
  rules — a mask with nowhere to type, a mask before version 4, a mask added being a
  tightening. Removing the neighbour-deletion, the whole-paste reading, the length check
  and the caret each fails a named case. `packages/core/src/engine-validators.test.ts` —
  the engine refuses an incomplete answer, the formatted text and a non-string, and leaves
  emptiness to `required`. `packages/react/src/masked-text.test.tsx` and
  `packages/angular/src/masked-text.test.ts` — each binding shows the shape while the
  engine holds the digits, keeps the caret where the person types, deletes on the right
  side, and drops a refused character; removing the write to the control, the caret and
  the direction each fails a case in each. `masked-answer.json` in the conformance suite
  runs both renderers against one fixture, and fails in both without the engine's check.
- **Deciders:** Daniel Bacher

## Context

Survey controls were the second item on the backlog, and input masks were half of what was
left of it: a phone number, an IBAN, a postcode typed into a shape that shows where the
characters go. Every form product has one, and they differ on the question that matters
for a platform whose answers are data rather than display: **what is stored**.

A mask also touches every layer here at once. The engine has to refuse an answer that does
not fit, because a payload posted straight at the server never went through a control. And
both renderers have to decide, on every keystroke, where a typed, deleted or pasted character
goes — which is the part masked inputs usually get wrong: the caret jumps to the end, a
backspace after a bracket does nothing, a pasted `+41 79 …` loses its first two digits to
the `41` the mask writes.

## Decision

**`mask` is a spec 4 property on `text` fields**, a string of positions: `9` takes a digit,
`a` a letter, `*` either; any other character is written by the control, and `\` before a
character makes the control write it. A property rather than a widget for the reason `step`
is one ([0104](0104-spec-4-opens-with-a-widget-not-a-type.md)): it says which answers are
valid, so the server has to agree.

**The answer holds only what was typed into the positions.** `(999) 999-9999` stores
`5551234567`. The characters the mask writes can then change without a stored answer
changing, and what an export or a webhook receives is the number rather than one of its
spellings. The engine refuses, with the code `mask`, an answer that is not exactly one
fitting character per position — the formatted text included.

**One function decides where a character lands: `editMasked`, in `@formancy/spec`.** Given
the answer, the control's new text and its caret, it finds the edit and applies it to the
answer rather than to the text. Both renderers call it; the engine calls `fitsMask` from the
same module. Two implementations of where a keystroke goes would be two answers to one
keystroke ([0091](0091-a-second-builder-is-a-binding.md)). Its rules, each a failure it
prevents:

- **Shown only up to the last typed character**, so no written character sits under the
  caret for a backspace to delete and the control to write straight back.
- **A deletion of only written characters removes the typed one beside them**, in the
  direction of the deletion, read from the input event.
- **Text replacing everything is read whole when it lines up with the mask**, so a pasted
  `+41 79 123 45 67` is nine digits, not eleven.
- **The caret disambiguates** which of two identical neighbours was typed.
- **Code points, not UTF-16 units**, except for the caret it hands back.

**Each binding writes the formatted text and the caret to the control in the input
handler**, then stores the answer. In React that is what lets the caret land in text that is
already there; in Angular it is also the only thing that removes a refused character, since
the answer — and so the bound value — did not change and Angular writes a binding only when
it does. The placeholder shows the shape (`(___) ___-____`), and a mask of digits asks for
the numeric keypad.

**The conformance drivers read a masked answer off the control** with `answerFromText`, the
way a person reads the number off the screen. A renderer that drew the shape wrong reads back
wrong.

**`validate.ts` lost the ajv half to `structural-errors.ts`** to take the new rule. The file
was at its size ceiling, and the structural half changes for its own reason — ajv's reports
and the schema's shape — not when a rule about how fields relate does. It is under the
budget now and off the list.

## Consequences

**A mask is for codes, and says so.** A digit is ASCII `0`–`9`; a letter is any script's.
A field for a free-form international phone number is better without one — a Swiss mobile
mask refuses a German number, and that refusal is the author's choice rather than a defect.

**Changing a mask is a tightening.** `diffSchemas` cannot order two masks, so a mask added
or changed is lossy and removing one is compatible: an answer collected without a mask may
not fill one.

**What the renderers show is code points; what a DOM measures is UTF-16.** The two meet only
in the caret offset, converted on the way out. A grapheme made of several code points — a
flag, a family emoji — is several positions; a mask is not for those.

**Error codes stay codes.** The renderers show `mask` as they show `pattern`: text belongs to
the message catalogue (§8.9).

## Alternatives considered

**Store the formatted text.** The answer would carry the mask's spelling, so restyling the
mask — a space where a dash was — would leave every stored answer failing the new one, and
an integrator would strip the punctuation themselves, each differently.

**A widget.** A mask decides which answers are valid; a widget may only change how a field
looks ([0065](0065-a-widget-is-authored-not-registered.md)).

**A mask library in each renderer.** Two libraries, two sets of rules about where a pasted
character goes, and an engine that would need a third to agree with them.

**Literal-matching typed input character by character.** Simpler, and it eats the first
digit somebody types into `+41 99 …` as the mask's own `4`. Reading a whole replacement
against the mask, and otherwise filling positions, is what avoids it.
