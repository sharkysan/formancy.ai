# 0171 — The renderers' own words are in the form's language, from one catalogue both renderers read

- **Status:** accepted
- **Date:** 2026-10-10
- **Deciders:** Daniel Bacher
- **Verified by:** `apps/docs/src/renderer-words.test.ts` — every source file of
  `@formancy/react`, `@formancy/angular` and `@formancy/angular/material`, read through the
  TypeScript compiler and every Angular template read apart, and no word on screen that is a
  literal. It failed first with 154 of them, in all three and in both conformance drivers;
  with the catalogue in place it was proved by writing four back — *Waiting* in React's file
  field, *Back* in Angular's form, *Searching…* in Angular's search status, *required* in
  Material's radio group — each named in the failure. Its rules are held to cases of their
  own, words that shipped and literals that are not words. `packages/core/src/words.test.ts`
  — German and French say everything English says with the same placeholders, a host adds a
  language and overrides a word a message at a time, a region is read in its language, a
  count is chosen by the rules of the language the message is in (failed with the engine's
  locale's rules), a tag `Intl` cannot parse still draws a form (failed with the guard taken
  out), and the browser's language is never read. `packages/react/src/words.test.tsx` and
  `packages/angular/src/words.test.ts` — a German form's every surface: Next, Back, Submit, the
  stepper, a repeater's buttons and rows, the required hint, an unnamed tab, the ranking, the
  tag picker, the formatting toolbar and its prompt, the signature, the error summary counted
  once and twice, and every live region — the file field's, the typeahead's and a plain
  select's search status, the scanner's; 19 cases failed in React and 18 in Angular before the
  catalogue, each because the English was on screen. `packages/conformance/fixtures/renderer-words-mounted-locale.json`
  runs under the React, Angular and Material drivers, which press Next, Back, Submit, a row's
  remove button and a ranking's buttons by the words of the locale the form was mounted in;
  with each binding's form and repeater words reverted it fails in all three.
  `packages/angular/material/src/controls.test.ts` (*Material in the form's language*) fails
  with Material's hint written back in English. `apps/playground/src/two-renderers.test.tsx`
  (*the Language switch*) fails against renderers built with English form words.
  `apps/docs/src/bundles.test.ts` measures the entry's size beside the barrels'.

## Context

A form's questions are the author's, written in the document and translated in its catalogue,
and both renderers read them in the engine's locale
([0107](0107-layout-text-is-read-in-the-engines-locale.md)). Around them every renderer draws
words of its own: Next, Back and Submit; a repeater's Add and Remove and where a row is; a
ranking's move buttons; a file's Cancel uploading, Try again and Undo removing; the error
summary's heading; what a live region announces while a file is sent, a list is searched or a
code is scanned. All of them were English literals, written separately into React, Angular
and Material. A form in German asked its questions in German around English buttons, and
every control added since the renderers began added more — the per-file uploads
([0130](0130-each-file-is-its-own-upload.md)), the ranking's buttons
([0138](0138-a-ranking-stores-the-order-chosen.md)), the matrix, the status regions. arc42 §11
listed it as debt; 0107 named it and left it.

A host could rename Submit by a prop and a repeater's buttons in the schema. Nothing else could
be changed by anybody.

The builders had solved the same problem once: one catalogue in `@formancy/builder-core`,
English, German and French, read by both builders, a host adding a language a message at a
time ([0114](0114-the-builder-speaks-the-authors-language.md),
[0116](0116-what-a-builder-says-is-decided-once.md),
[0119](0119-a-sentence-in-builder-core-comes-from-the-catalogue.md)). Two renderers writing
their words twice is the drift [0091](0091-a-second-builder-is-a-binding.md) exists to
prevent, and three bindings — Material draws its own groups — is worse.

## Decision

**One catalogue, `@formancy/core/words`, which every renderer reads.** Every word has an id;
English is `FORM_WORDS` and is what every language translates; German and French are shipped
and complete, typed as every id so a word added to English does not compile until both have
it. `createFormText({ locale, words })` returns the function a renderer calls for each word.
React holds it in `FormancyProvider` and hands it out with `useFormText()`; Angular provides it
beside the engine in `provideFormancy`, and templates read it through a pure pipe,
`'form.next' | formancyText`, which Material's components use too. The renderers decide nothing
about wording; they draw what the function says.

**An entry point of `@formancy/core`, not its barrel and not a package.** Both renderers already
depend on `core`, and the words are read in the engine's locale, so `core` is where they
belong — but not in the engine. The server imports the engine and has no buttons, and the
barrel is over its budget (§9.3): a second entry imports nothing from the first, so
`dist/index.mjs` was byte-identical after it, and the engine's figure did not move. A package
of its own would be one more thing to publish, sign, list in the SOUP declaration and install
in the e2e gate, for one module both renderers reach through a dependency they already have.

**The language is the engine's locale, never the browser's.** The engine's locale is the one
the reader chose for the form, and it is fixed for the engine's lifetime, so the words are
too. A host does not say it twice: a host that builds a German engine has said which language
the buttons are in, and asking it to pass a catalogue as well — the builders' shape — is how
the buttons stayed English while the questions were translated. The browser's language is
the machine's, and a German reader filling in an English form on a French laptop reads
English buttons. An engine with no locale — a document with no `i18n` section — is English.

**A host adds a language and changes a word, one message at a time.** `words` is keyed by
locale, the shape of a document's own catalogue: `{ it: { 'form.next': 'Avanti' }, de: {
'form.submit': 'Senden' } }`. A word is the host's for the locale, then this package's for it,
then the same two for the locale's language (`de` for `de-CH`), then English. A host
translating into a language not shipped has a usable form at every step.

**The author's words win.** `submitLabel` still names the submit button, and a repeater's
`addLabel` and `removeLabel` from the document still name its buttons; the catalogue is what a
renderer says when nobody else has. A row's position around the author's remove word —
"Remove contact 1 of 2" — is the renderer's, and in the reader's language.

**A count is chosen by the rules of the language its message is in.** A host's Portuguese
without a resume-notice sentence falls back to English, and Portuguese rules call 0 `one`:
counted by the engine's locale, the notice said "One question is no longer on this form" about
none. Lists are joined by `Intl.ListFormat` in the words' language.

**A locale `Intl` cannot parse is not a form that cannot render.** In a builder a malformed tag
is a host's mistake and throws (0114); here it comes from a document's catalogue key and stands
between a respondent and a form, so the words are its language's where the language can be
read, and English otherwise.

**The drivers press the renderer's own controls by these words**, in the locale the form was
mounted in: Next, Back, Submit, a row's remove button with its position left open, a ranking's
buttons. Neither passes `submitLabel` any more, so the suite holds the default rather than a
name a driver chose. Running the new fixture found a defect of the Angular driver's own: it
compared a page's raw label with the step on screen, so a page labelled by a message reference
was never recognised.

## Consequences

**What it costs, measured 2026-10-10.** `@formancy/core/words` is 5.0 kB brotli on its own,
all three languages, with the comments the bundler keeps. A renderer cannot tell in advance
which language a document will be read in, so it carries all three: a deployment that only
ever serves English forms ships German and French it never shows. The alternative — a host
importing the languages it wants — is the shape in which forgetting to is invisible, which is
the defect. The React barrel went from 24.6 to 24.7 kB — a provider, a hook and a call where
each literal was — and the engine's barrel did not move: `dist/index.mjs` was byte-identical
after the second entry was added.

**`core/words` needs ECMA-402**, as `builder-core` does: `Intl.PluralRules` and
`Intl.ListFormat`. A runtime without data for the form's language — Node built with
`small-icu` — counts and joins in English.

**What a host sees change.** A host whose engine is built in German or French gets German or
French buttons and accessible names where it had English — the point, and also what breaks a
host's own tests that find a German form's controls by their English names. The resume notice's
breaking-change paragraph is three sentences now rather than one with an emphasised phrase in
it, because a translator cannot move a phrase spliced into somebody else's sentence; the English
still says the draft *cannot be submitted*. A theme keyed on the typeahead's `data-state="failed"`
is unaffected: the state is now read off a flag rather than off the start of the English
sentence, which would have stopped matching the day the sentence was German.

**The resume notice is English outside the form's provider.** It takes no engine, so where a
host draws it apart from the form there is no language to read. Inside `FormancyProvider`, or
under `provideFormancy`, it speaks the form's; the admin's fill pane draws it outside, and is an
English application.

**Not in the catalogue, deliberately:**

- **The engine's error codes.** A field's error and the error summary show `required`,
  `minLength`, as codes: they are the engine's vocabulary, the conformance drivers read them off
  the screen as codes, and a sentence for each code is a decision about who words them — the
  document, the host, or this catalogue — that is not this one. The sentence the summary puts
  them in is translated; the codes are not. arc42 §11 lists it.
- **A repeater's `addLabel` and `removeLabel`.** They are plain strings in every spec version,
  not `Text`, so a multilingual form that sets them says them in one language whatever the
  reader chose. Leaving them out gets the renderer's word in the reader's language. Making them
  translatable is a spec change, and spec 1 to 4 are frozen.
- **What a host's uploader or scanner says went wrong.** It arrives as an error's message and is
  set into the renderer's sentence as a value, in whatever language the host wrote it.

**The guard reads where a literal stands, not what it says.** Three words in a row, the
builder's rule (0119), would pass "Next". So any letter on screen — JSX text, template text, a
text attribute, a child expression or interpolation — is a word, and in code a word beside
whitespace or one capitalised word is. Exempt by what a literal is for: a thrown error's
argument, an operand of a comparison, a `case` label, a selector handed to the DOM, a property
name, a type, an import, a value piped into a function. It errs towards noise; a literal it
names wrongly is a conversation about whether it is a word.

## Alternatives considered

**In the barrel of `@formancy/core`.** Three languages of buttons in every engine, the
server's included, and §9.3's core figure measuring them.

**A package of its own.** The publishing, signing, SOUP and install-gate cost of a package for
one module, reached through a dependency both renderers have already.

**A catalogue per renderer.** The drift this replaces, and a third copy for Material.

**The host passes the catalogue, as the builders' host does.** Every host building a German
form would have to remember, and one that did not would be told nothing — the exact failure.
The builder's language is the author's and is not the document's, so its host must say it; a
form's is the document's, which the engine already knows.

**The browser's language.** A German speaker who chose the English form on a French laptop
would read French buttons around English questions: the defect, moved.

**The document's own catalogue.** Every form would carry button words for every language, the
author would translate the renderer to translate their form, and a form published before this
would stay English.

**An i18n library — i18next, FormatJS.** A first runtime dependency and a SOUP row for two
plural categories and a list join `Intl` already does, as in 0114.
