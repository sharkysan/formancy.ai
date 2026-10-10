# 10. Verification

What is checked, how, and what each check actually proves. The organising
principle is **one conformance suite, N drivers**
([0033](../decisions/0033-one-suite-n-drivers.md)): correctness is specified
once, as data, and executed against every implementation.

## 10.1 The fixture

```jsonc
{
  "name": "a required field blocks submit until it has a value",
  "description": "why this behaviour is the correct one",
  "schema": { /* a complete form document */ },
  "steps": [
    { "expectNoErrors": true },
    { "submit": true },
    { "expectSubmit": { "status": "rejected" } },
    { "expectErrors": { "email": ["required"] } },
    { "set": { "email": "ada@example.com" } },
    { "submit": true },
    { "expectSubmit": { "status": "accepted" } }
  ]
}
```

One file feeds five runners: the engine in Node, the engine in a browser, the
React driver, the Angular driver, and the server's revalidation endpoint.
A behaviour is written once and verified in five places.

The fixture format has its own validator, which refuses a case that could not
run honestly — including a field with no resolvable accessible name, since a
driver could never find it, and a `locale` the document has no catalogue for,
since `resolveText` would fall back to the source language and every lookup
would succeed against it. Cases are embedded by a generator and the case list
is **pinned in a test**, so a case that silently stopped being embedded is
caught rather than leaving every renderer passing a suite that no longer tests
it.

A fixture may name the **locale it mounts in**, which is the only way this
suite can hold a renderer to translating anything: mounted in the document's
default, a form in which nothing is translated looks exactly like one in which
everything is. It holds the renderer and not the driver, and the distinction is
load-bearing — every lookup here is by accessible name and the driver resolves
that name itself, so a driver that drops the locale mounts a source-language
form, looks up source-language names, agrees with itself and passes. Each
driver therefore carries one case of its own, outside the fixtures, that reads
the translated string off the document
([0107](../decisions/0107-layout-text-is-read-in-the-engines-locale.md)).

## 10.2 The checks

| Check | Command | What it proves |
|---|---|---|
| Engine fixtures, Node and browser, deep-diffed | `pnpm test` | No client/server rule drift — the flagship claim |
| `fast-check` invariants | `pnpm test` | Hide/unhide restores iff `clearOnHide` is false; repeater add-then-remove is identity; evaluation is order-independent; cycles report deterministically |
| Renderer conformance, both drivers | `pnpm test` | Both renderers behave identically, with no framework-specific skips |
| axe-core after every mount and DOM-mutating change | in the same run | Zero automated accessibility violations |
| Server integration on real PostgreSQL via Testcontainers | `pnpm test` | Versioning and submission defects only manifest against real SQL semantics |
| Each React, Angular and Node version in `compatibility.json`, the lowest each declared range admits and the newest: the packed packages installed, rendered or run in Chromium, and the engine and server tested | `test:e2e:install`, `test:e2e:angular`, the `node` job | A range is a promise to every consumer below it, and nothing had run at the bottom of any of them; a test holds the file to the ranges ([0134](../decisions/0134-the-versions-it-says-are-the-versions-it-runs.md)) |
| An upload the scanner refuses, or cannot be asked about, is not stored and cannot be claimed; the ClamAV adapter frames its bytes and reads every answer against a protocol stand-in | `pnpm test` | Fail closed is the decision, and a claim is a row's state, so it is held on real SQL; a real clamd is in no gate and was run once by hand ([0131](../decisions/0131-an-upload-is-scanned-before-it-is-kept.md)) |
| The official CEL corpus, counts pinned | `pnpm test` | The expression evaluator has not regressed, and its gaps are known rather than assumed |
| Performance benchmarks | `pnpm bench` | The budgets in [§9](09-quality-requirements.md) |
| `publint` + `attw` | `pnpm check:pkg` | The commonest cause of "it doesn't work in my app" for a multi-framework library |
| ~~`size-limit`~~ | — | **Not wired up.** This row claimed it ran under `check:pkg` and nothing in the repository runs it; the byte budgets in [§9.3](09-quality-requirements.md) are measured by hand and dated. |
| The site as the host composes it, with the documentation link check | `pnpm build:web` | A root-absolute documentation link resolves against the landing page rather than `/docs/`, builds cleanly and 404s in production |
| Typecheck with no `@types/node` in the isomorphic packages | `pnpm typecheck` | The layer boundary holds |
| No horizontal overflow, the pane row's computed column count, and both renderers' computed `touch-action` — four viewports in Chromium against the composed site | `pnpm test:browser` | The facts jsdom cannot represent: it applies no CSS, resolves no media queries and performs no layout. Two defects shipped through every other gate here in one week for that reason ([0102](../decisions/0102-what-jsdom-cannot-see-is-checked-in-a-browser.md)) |
| The Angular page's embedded demo is the starter, running — its heading and its builder's tree inside the frame — at a phone's width and a desktop's, and the page cannot be scrolled sideways | `pnpm test:browser` | jsdom never loads an iframe, so a starter built for the wrong place would leave a blank frame on the page with every other gate green. Its build is also refused by `build:web` if an asset URL is absolute outside its base ([0136](../decisions/0136-the-angular-page-runs-the-starter.md)) |
| The Angular page's install command names only published packages, and its snippet imports only names those packages export | `pnpm test` (`apps/docs/src/site-snippets.test.ts`) | Code on a page goes stale while the page goes on rendering it. Exports read by the compiler, not a pattern: with no semicolons, a pattern from `export` to a name spans every export block ([0136](../decisions/0136-the-angular-page-runs-the-starter.md)) |
| Every `@formancy/` package a page names is in the workspace; every package it has `npx` or another runner fetch is published and declares the command run; every one it installs is published; every `formancy…` command it runs is declared — all read from the manifests | `pnpm test` (`apps/docs/src/package-references.test.ts`) | Three pages named a command-line package that was never built, and the roadmap gave an `npx` line that ran it — a 404 from npm. A plan written in the present tense changes nothing in any diff; a manifest does. Decision records and the changelog are not read — one names packages it rejected, the other what was said at the time, this mistake included. A page that says "the CLI" in words names no package, so nothing here sees it |
| The site's pages compared to the landing page — computed ground, ink, body and display families, bar, navigation and mark — plus the hero's theme tone, the panel's clearance, and that every control is reachable | `pnpm test:browser` | The templates gallery shipped as a light page in a family nothing loads, under its own header and footer, inside a dark site. Compared between the pages rather than against a literal, so changing the palette is one change and not two ([0106](../decisions/0106-one-shell-for-every-page-of-the-site.md)) |
| No theme names a side, and a side named as a value is named again for the other reading order | `pnpm test` | Right-to-left was true by accident — zero physical directional properties across five themes, because somebody reached for the logical ones out of habit. Looking for the guard found the exception it had been told to ignore: four themes positioned an iOS icon at a fixed side while the padding that made room for it moved ([0113](../decisions/0113-a-theme-is-written-in-reading-order.md)) |
| Every stylesheet the package ships, the builder's included, draws a bar down one side only with a `:dir(rtl)` rule for the same selector drawing it down the other | `pnpm test` | The reading-order cases read four of the five stylesheets — the one left out styles both builders — and an inset shadow is a side named as a value nothing looked for. Per rule, because the drop indicators name both sides between them ([0123](../decisions/0123-the-builder-reads-right-to-left.md)) |
| The builder flips in Chromium and its selected node's bar moves to the right; no stylesheet the site serves has `:dir()` rewritten as a list of languages | `pnpm test:browser` | With every source check green the bar stayed on the left: Vite's default CSS target rewrote `:dir(rtl)` as `:lang(ar), :lang(he), …`, so `dir="rtl"` on an English page matched nothing ([0123](../decisions/0123-the-builder-reads-right-to-left.md)) |
| A picked PNG is decoded and drawn as its thumbnail in both renderers, at its own shape and no larger than the theme allows | `pnpm test:browser` | jsdom decodes no image and draws on no canvas, so the renderer tests can only say the right calls were made; removing the theme's maximum fails it ([0130](../decisions/0130-each-file-is-its-own-upload.md)) |
| Every request the landing page, the templates, the Angular page with its frame, the playground and one docs page make, with any to another origin — or a `preconnect` or `dns-prefetch` hint to one — aborted and named; each page's text in a face the document loaded, the playground's editor arrived, and its content security policy refusing a picture and a connection on another host; and the playground again while a model's turn is carried through its relay in each builder, copied, pasted back, reviewed and applied — and once more asked in Angular and answered in React after a switch | `pnpm test:browser` | Every page loaded its faces from Google Fonts and the playground its editor from jsDelivr, and a request that fails is a page that still renders, so nothing noticed. Aborted rather than let through, so the runner's network cannot decide the answer ([0154](../decisions/0154-the-website-makes-no-request-to-any-other-site.md)). The relay's round trip is the one flow on the page that exists to take something elsewhere, and the person does that, not the page; its first run found the playground blank, with `react-dom` bundled into the React builder, and carried through React alone it passed an Angular pane whose Copy opened the chat itself ([0160](../decisions/0160-a-person-carries-the-models-turn.md)). The turn carried across the switch fails with the Angular prompt pane holding its own run, which the switch stops ([0163](../decisions/0163-a-models-run-belongs-to-the-host.md)) |
| The rendered form responds to `dir`, nothing it lays out stays pinned, and nothing overflows mirrored | `pnpm test:browser` | A narrower claim than the row above, and said so: the asymmetries it measures come from the renderer and the user-agent stylesheet, not from a theme |
| No published package that ships script refers to `console`, outside the server's own process | `pnpm test` | A debugging probe in the Angular builder logged two lines on every ↓ keypress from the release that introduced it, and no gate could see a log line. A library's console is its host's ([0115](../decisions/0115-a-library-writes-nothing-to-its-hosts-console.md)) |
| Every surface of each builder — the two trees, the property editors, the logic, translations, prompt, relay and scenario panes — walked through the states it can show in a pseudo-language, shows nothing that came from neither the catalogue nor the document | `pnpm test` | A builder in the author's language has no English written into its components — judged by one function both builders call, so the two cannot disagree about what counts ([0116](../decisions/0116-what-a-builder-says-is-decided-once.md)) |
| No string in `builder-core` reads as a sentence outside the catalogue, the model instructions and a thrown `Error` — read through the TypeScript compiler's syntax tree | `pnpm test` | The change that moved the builder's words into a catalogue said every refusal had moved; four had not, and a rename built half a German sentence and half an English one. A refusal only appears when something is refused, so only a check of the source sees one nobody listed ([0119](../decisions/0119-a-sentence-in-builder-core-comes-from-the-catalogue.md)) |
| A validator error is built from its code, and the values it is given are exactly the placeholders that code's sentence names — read off the sentence's literal type | `pnpm typecheck` | A value a sentence names and a call forgets reaches an author as `{key}`, and no test of the English would notice in a sentence nobody had a fixture for ([0122](../decisions/0122-a-validator-error-has-a-code.md)) |
| German and French say every validator sentence, with the English's placeholders and the format's own words kept, and a session refuses in its language | `pnpm test` | The refusal an author meets most came from the validator in English inside a German builder. The shipped translations are typed as every code as well, so a new sentence does not compile until it is translated ([0122](../decisions/0122-a-validator-error-has-a-code.md)) |
| Every commit author in a pull request has signed the CLA | `node scripts/check-cla.mjs` | The agreement [0069](../decisions/0069-contributions-under-a-cla.md) decided is checked rather than only stated, and a range it cannot read is refused rather than passed ([0098](../decisions/0098-the-cla-is-checked-in-the-repository.md)) |

There was a table of per-package test counts here, and it is gone for the reason
it was wrong: the figures were transcribed by hand, they moved on almost every
commit, nothing failed when they stopped matching, and they ended up disagreeing
with the same figures in `SOUP-DECLARATION.md`. Two documents in one repository
giving different counts for one suite is worse than neither giving any — a reader
has no way to tell which was maintained.

`pnpm test` prints the counts, per package, and is the evidence. What is written
by hand here is the part that does not drift: every distributed package has a
suite, the largest are the engine and the expression language, and the server's
integration tests run against real PostgreSQL rather than a stub.

## 10.3 The driver interface is the accessibility contract

A driver may resolve elements **only** by role and accessible name —
`getByRole`, `getByLabelText`, `getByRole('group', { name })`. Never a test id,
never a CSS selector ([0034](../decisions/0034-accessible-name-only.md)).

A renderer whose markup is not queryable this way fails conformance.
Accessibility stops being a parallel workstream and becomes a property of
passing the tests.

The rule earns its keep rather than merely sounding principled. The first
fixture containing a radio group immediately proved that the React driver could
never have answered one: its radio branch sat below a control lookup that
throws first, because a group's accessible name is on the `fieldset` and not on
any control. Angular had it right; React was corrected.

## 10.4 Adversarial review

Packages whose failure would be expensive were reviewed with a brief to find
the defect rather than to approve the change. Three critical findings, none of
which the existing tests had caught:

| Package | Finding |
|---|---|
| `spec` | `diffSchemas` was blind to changes inside nested containers, so a breaking change could be reported as compatible — and draft migration trusts that answer |
| `conformance` | An assertion failing was confused with the driver crashing, so some failures presented as passes |
| `expressions` | An unmetered `split()` let a small expression allocate without bound |

Listed because a review process that has never found anything is not evidence
of quality.

## 10.5 What is planned and not yet in place

- **Integration by install** through a local Verdaccio registry, including a
  Next.js App Router case and an Angular SSR case. Hydration is where form
  libraries actually break in the wild, and in-repo tests structurally cannot
  see it.
- **An SSRF DNS-rebinding fixture suite** and a **ReDoS corpus**, for the two
  vectors most likely to be missed.
- **Visual regression**, narrowly: pixel tests only for the reference theme,
  the builder and the admin app, on pinned Linux and Chromium in a container.
  Deliberately *not* for the headless renderers — they ship no styling, so a
  pixel snapshot would be testing demo CSS. The meaningful invariant there is
  the accessibility-tree snapshot.
- **A manual accessibility tier**: keyboard-only journeys under
  `prefers-reduced-motion`, `forced-colors: active`, 200% zoom and a 320 px
  viewport; then NVDA with Firefox and VoiceOver with Safari each minor release.

## 10.6 The honest limits

Automated accessibility testing catches roughly **57%** of machine-detectable
issues by Deque's own published figure, and only about **30%** of WCAG 2.2
criteria are machine-testable at all. Zero axe violations is a floor, not a
conformance claim.

The expression evaluator passes 586 of 704 in-scope CEL specification cases.
The 118 failures are enumerated rather than averaged away, because a percentage
would let a reader assume their expressions are in the passing set.

## Starter templates

`apps/docs/src/templates.test.ts` checks catalogue/file agreement, schema validity,
engine compilation, expression checks and every referenced translation. It executes
fictional samples and scenario changes in client and server modes, checking exact
errors, visibility, recalculated values and removed answers. This covers the stated
examples rather than proving all possible paths or domain suitability.

The site and playground suites exercise discovery, translated previews and editor
links. `scripts/template-browser-test.mjs`, called by `pnpm test:browser`, checks the
built `/templates/` page on phone and desktop widths, modal focus restoration, real
JSON downloads and navigation into the selected template and locale. The composed
build refuses a missing gallery HTML file or a sitemap that omits the page.
