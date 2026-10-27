# 0203 — A field with a limit counts while somebody types, and speaks only when they pause

- **Status:** accepted
- **Date:** 2026-10-27
- **Extends:** [0021](0021-engine-owns-aria.md), whose `aria-describedby` composition now names the
  count, and [0191](0191-an-error-is-said-not-coded.md), whose shape — one function both renderers
  call — the count's sentence follows
- **Deciders:** Daniel Bacher
- **Verified by:**
  - **`packages/core/src/character-count.test.ts`.** `countSentence` says the limit while the box
    is empty, what is left as it fills and how many too many past it, in English, German and French
    with their plurals; it says nothing for a field without a limit or for rich text; and it counts
    as the engine's `maxLength` check does — six emoji are two too many to both. The count's id is
    in `aria-describedby` after the description, and only where a count is shown. Every case failed
    against a stub.
  - **Both renderers' `character-count.test`**: the limit under an empty box, which the box names;
    what is left and how many too many as somebody types; the live region silent on load and while
    typing, and speaking once typing pauses; nothing for a box with no limit. **Material's case** in
    `controls.test.ts`, which failed with its template put back. **Both `words.test`s** find the
    three sentences in German.
  - **`apps/docs/src/themes.test.ts`** — the `count` part is styled by all four themes.

## Context

A text field with a `maxLength` told the person about the limit in one way: an error, after they
had written past it. For a long answer that is the worst moment — the person has to find what to
cut, in text already written. The common pattern, and the one public-sector design systems settled
on after testing with screen-reader users, counts while somebody types: the limit up front, what is
left as they write, how many too many past it. And it speaks the count to a screen reader only once
typing pauses, because a live region updated at every keystroke talks over the person typing.

## Decision

**A text or a long text field with a `maxLength` shows a character count** under its box, in both
renderers and Material:

- **`countSentence`**, in `@formancy/core/words`, says it: the limit while the box is empty, then
  what is left, then how many too many — in the form's language, from the renderers' catalogue.
  **Counted as the engine counts** — the string's `length` — so it never says something is left of
  an answer the engine refuses.
- **The engine names it** in the control's `aria-describedby`, after the description and before the
  error, through a `count` id; a screen reader hears the current count when it reaches the box.
  `buildFieldProps` now reads whether a field is grouped, described and counted from the definition
  the engine hands it.
- **A polite live region speaks it once typing pauses** for a second, and says nothing when the form
  opens: a page whose every counted field spoke its limit on load would talk over the person.
- **No `maxlength` attribute.** The browser would stop the typing at the limit — and silently cut a
  paste — where the count lets the person write past it and see how much to remove.

Not on rich text, whose length counts its markup, so a count there would disagree with what the
person sees.

## Consequences

**Every field with a limit shows a count**, with no switch for it. An author who wants none removes
the limit or styles the part away.

**The live region is drawn as `visually-hidden`**, which the shipped themes clip. Without a theme its
text shows a second time, a second after typing pauses — the convention the scanner button's hidden
name already follows.

**Two counted text answers from one keystroke are not two**: the count and the engine read the same
`length`, which is UTF-16 code units, so an emoji is two — as the engine has always counted it.

## Alternatives considered

**The `maxlength` attribute.** No code, and the paste that is silently cut is the defect.

**Count graphemes, so an emoji is one.** What a person would count, and a second opinion from the
engine's check unless both changed — which would change what `maxLength` means for answers already
stored.

**Speak the count at every keystroke**, or on a fixed interval. Both talk over the person, which is
what the pause exists to prevent.
