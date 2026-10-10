# 0107 — Layout text is read in the engine's locale, and the suite can mount in one

- **Status:** accepted; the renderers' own words, left English here, decided by [0171](0171-the-renderers-words-are-the-forms-language.md)
- **Date:** 2026-10-07
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/react/src/layout.test.tsx` and
  `packages/angular/src/layout.test.ts`, which each mount a document whose section
  headings are message references in a locale that is not the default and require the
  translated heading by role and accessible name, **and the absence of the
  source-language one**. Both were observed failing before the change, in both
  renderers. Underneath them,
  `packages/conformance/fixtures/translated-mounted-locale.json` runs a conditional
  form in German under every driver, and `validateFixture` refuses a `locale` the
  document has no catalogue for. Five mutations were watched to redden them, and the
  first two attempts reddened **nothing** — see *The two halves cancel* below, which is
  why the drivers are held by a case of their own. What this does **not** reach is in
  the consequences.

## Context

Reported from the templates gallery: the HR onboarding form, chosen in German, showed
German field labels under the English headings **Employee** and **Work setup**.

Nothing was wrong with the document. `templates/hr/employee-onboarding.form.json`
carries `label: { "$t": "section.1" }` on the section, and its German catalogue carries
`"section.1": "Mitarbeitende Person"`. `resolveText` was correct too.

What was wrong is the locale handed to it. Every call site that resolves text belonging
to the **arrangement** rather than to a field passed `schema.i18n?.defaultLocale`:

| | |
|---|---|
| `packages/react/src/form.tsx` | the whole layout tree, so every heading, group label, tab name and code label |
| `packages/angular/src/form.ts` | `headingFor`, `stripLabelFor`, `nameOf` — the same three things |

Field labels go through the engine and were right. Measured across the starter
collection: **every template in it** carries at least one translated section
heading, so every one rendered its headings in English in both German and French.

That is what let it survive: a form
entirely in one language announces itself and a reader who cannot read it stops, while
a form translated everywhere **except** its headings looks finished, so the reader
proceeds. And a reviewer reading the JSON sees a complete catalogue and nothing wrong.

`engine.locale()` already existed for this exact class of mistake. Its docblock records
that a value computed elsewhere "was a wrong answer whenever a host passed a `locale`
of its own". This set of call sites was never moved over.

**Both renderers had it, identically and independently** — which is the case
[0033](0033-one-suite-n-drivers.md) accepts the cost of, and the case the conformance
suite exists to catch. It did not, for a reason worth its own paragraph:

- `MountOptions.locale` existed on the driver interface, documented as "Drivers that
  render one language only may ignore it".
- **Both drivers ignored it**, never passing it to `createFormEngine`.
- So no fixture could run in another language, and none did. The one i18n fixture is
  named *"a form written in message references renders in the default locale"* — with
  a German catalogue sitting in it, unused.

Mounted in the default locale, a form in which nothing is translated looks exactly like
one in which everything is. The suite had the vocabulary for this and no case using it.

## Decision

**Layout text resolves in `engine.locale()`**, in both renderers, at all four call
sites. The fallback to the document's default for an untranslated string stays where it
belongs, inside `resolveText`, so a catalogue with a gap still shows the source language
and never a message id.

**A fixture may name the locale it mounts in.** `Fixture.locale`, forwarded by the
runner through the `MountOptions.locale` that already existed, honoured by both drivers
— which now also resolve accessible names in the locale they mounted with, because a
driver resolving in the default while the renderer renders the chosen one would fail
every lookup, and a driver resolving in the default while the renderer *also* ignored
the request would agree with it and pass.

**`validateFixture` refuses a `locale` the document has no catalogue for.** `resolveText`
falling back is right in a product and fatal in a fixture: a case asking for `fr`
against a document without `fr` renders wholly in the source language, finds every
control by its source-language name, and passes while certifying nothing. The same shape
as the suite's other vacuous-assertion refusals — a fixture that cannot fail is worse
than one that is missing.

### The two halves cancel, so the fixture cannot hold the driver

The first attempt put the whole thing on the fixture. Reverting each driver's locale
forwarding then reddened **nothing**, in both renderers.

The reason is worth keeping: every lookup in the suite is by accessible name, and the
driver resolves that name itself. A driver that drops the locale mounts an English form
*and* looks up English names. It agrees with itself, finds every control, and passes a
German fixture while nothing on the page is translated. The fixture is a gate on the
*renderer* — reverting React's layout resolution reddens it immediately, which is the
shape a third-party renderer using this published suite would have — and no gate at all
on the adapter that feeds it.

So each driver has one case of its own, in `conformance.test.tsx` and
`conformance.test.ts`, which mounts with `{ locale: 'de' }` and reads the German string
**off the document** rather than through the driver. The driver resolving the name is
precisely the thing that cannot be trusted to report on itself. Both were observed
failing when the forwarding was removed.

This is the eleventh way a guard here has been green for the wrong reason, and the
second of the "it passed because two wrong things agreed" kind.

## Consequences

**The conformance fixture does not reach a section heading.** Every lookup in that suite
is by accessible name, which covers field labels, option labels and messages — real
coverage, and not the thing that was reported. Layout text is exposed to a driver only
through `ariaSnapshot()`, and there is no fixture step that asserts against one. So the
headings are held by the two renderer tests, written twice, and **a third renderer would
not inherit them**. That is stated here rather than left to be discovered.

**A fixture step for the accessibility tree was rejected, not forgotten.** It would close
the gap above, and it is a snapshot: a file somebody updates when it goes red, which is
the one kind of assertion that gets quieter the more often it fails. Pixel baselines were
refused for that reason ([0102](0102-what-jsdom-cannot-see-is-checked-in-a-browser.md))
and the argument does not change because the pixels became a tree. Two renderers also
produce legitimately different markup, so one snapshot could not serve both.

**`Fixture.locale` is a fixture-format addition, and the format is published.** It is
optional and additive, so every existing fixture and every community driver keeps
working; a driver that ignores it now fails the new case rather than passing it, which is
the point. Drivers outside this repository will see one new failure and a fixture whose
description says why.

**What is still English on a German form, and is not this record's subject.** Two
things, both outside the message catalogue and both visible in the gallery's preview
after the fix: the renderer's own words — the `required` marker, the default submit
label — which no document can translate because they come from
`@formancy/react` and `@formancy/angular` rather than from the form; and the gallery's
own interface, which is an English page whose control is labelled *Template language*
and means it. The first is a real limitation of the renderers and deserves its own
decision; the second is a choice the label states. Neither is a document failing to be
read in the locale it was asked for, which is what this record is about.

**The `headingFor` cache stays keyed by node.** An engine's locale is fixed for its
lifetime, so a cached heading cannot need re-resolving under one. If a locale ever
becomes changeable at runtime, that cache is the thing that breaks, and this sentence is
where to look.

**Three call sites in Angular and one in React is an asymmetry worth noticing.** React
threads one `locale` down a tree; Angular resolves at each use. Neither is wrong, and
the Angular shape is why that renderer had three chances to get it wrong instead of one.

## Alternatives considered

**Have `resolveText` read the locale from the schema.** It cannot: the locale is a
property of the *reading*, not of the document, which is the whole reason a document
carries several catalogues. A function that chose the locale itself would make a form
unable to be shown in two languages at once, which the gallery does on one page.

**Give the layout tree the engine instead of a locale string.** It would make the
mistake unrepresentable, and it would put a `@formancy/core` type into a presentation
helper that today takes `{ i18n }` and nothing else — deliberately, so a conformance
driver holding a read-only view can resolve text without casting its document mutable.
A wider dependency to prevent a bug now covered by four tests is the wrong trade.

**Leave the drivers alone and rely on the renderer tests.** Cheaper, and it leaves the
suite claiming an i18n tag over a case that only ever ran in one language. The fixture
format already had `locale`; what it lacked was anybody honouring it.
