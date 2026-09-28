# Changelog

All notable changes to formancy. Every package moves on one version number; the
spec version inside a form document is a separate line, and a change to it is
called out explicitly. See [`MIGRATIONS.md`](./MIGRATIONS.md).

Loosely [Keep a Changelog](https://keepachangelog.com), with reasons attached —
a line that says only *what* changed is rarely the line you need six months
later.

## 0.2.0 — 2026-09-28

**The beta, and the release that freezes spec version 2.** A document written against
version 2 will validate against every future release that speaks it; what version 2 added
and what freezing it costs are in [`MIGRATIONS.md`](./MIGRATIONS.md). The short of the cost:
an async validator and a `signature` field type are now spec 3 features.

`0.2.0` is also the first release that **reads** version 2. `0.1.0` predates spec
versioning and pins documents to `{ "const": "1" }`, so it refuses a version 2 document
rather than ignoring the property — which is the loud failure rather than the silent one,
and still a failure.

**The hero form is a form, not three boxes.** Name beside email and the date beside the
total, through a `layouts` entry the page renders with — which is also why the company
field has to be added to the layout as well as the model when somebody asks for it, since
a field the layout does not place is invisible. It gained a date with an `earliest` bound
and a `toggle`, and it keeps the two rules a visitor can watch happen: a pass that decides
which questions follow and a total the engine computes.

**The admin's development proxy reaches the server on Windows.** `apps/admin/vite.config.ts`
targeted `http://localhost:4380` while the server binds `0.0.0.0` — IPv4 only — and Node
resolves `localhost` to `::1` first on Windows. Every API call answered 502 and the admin
showed an empty list of forms with nothing saying why. Measured rather than guessed: `curl`
against the IPv4 address answered 401 and against `[::1]` answered nothing at all.

**The page's closing argument sits beside its evidence.** "You have been filling in a
form" and the receipt it describes were stacked, so the submission a visitor was being
told about was below the sentence telling them. Side by side from 62rem, and the whole
close reads in one screen. The footer's version line came out from under the running
submission panel while I was there — it had been half covered.

**The card a shared link shows is a route, not a picture nobody can regenerate.**
`public/og.png` was an export that outlived two rewrites of the headline: every shared
link, search result and chat preview still read "One engine, in the browser and on the
server" long after the page stopped saying it. It is rendered from
`apps/site/src/og-card.tsx` at `?og` now — same fonts, same colours, same renderer — and
`counts.test.ts` fails when its headline and the page's disagree. Its `og:image:alt`
described the old image too, and the docs' own description still called the product a
self-hostable form engine.

**The landing page and the README say what a manufacturer can do with this.** "Built to
be incorporated. formancy is not a medical device and claims no conformity. It ships the
characterisation a manufacturer needs under IEC 62304 to treat it as software of known
provenance — a SOUP declaration, a safety analysis, the lifecycle, and design rationale —
as an input to your risk analysis, not a substitute for it." Each of the four is a link,
and the second sentence is the load-bearing one: conformity attaches to a device with an
intended purpose, a component has none, and `MDR-CONTEXT.md` tells a manufacturer to be
suspicious of a supplier who claims otherwise. The risk is not a false claim but a trimmed
true one, so `apps/docs/src/claims.test.ts` fails when either surface names IEC 62304
without "not a medical device" in the same breath, and when a document it offers is not
where the link says; `site.test.tsx` reads the claim off the rendered page rather than out
of the source, because a paragraph nobody renders would satisfy the first.

**The regulatory set said the spec is frozen at version 1.** It has been frozen at version
2 since this release, and version 2 is what the code writes. `MDR-CONTEXT.md` said it in
the one item that tells a manufacturer whether their stored submissions sit in a settled
shape; `LIFECYCLE.md` named only version 1 while describing change control on the data
format; `SAFETY-ANALYSIS.md` said "the spec is frozen" without saying which. All three
were true when written, which is the failure `claims.test.ts` exists for. It now checks
per paragraph: wherever a document in `docs/regulatory` discusses the frozen spec, the
version the code implements has to be one of the versions that paragraph names.

**A checkbox and a radio answer the pointer, and the pointer can no longer un-choose
them.** Reported twice — "the radio button and checkbox is still not visible when clicking
or hovering (dusk theme)" — and two defects were under that one sentence. Neither control
had a state of its own, so both fell to the rule every control shares: a fill one step
lighter, which is right for a text field and, measured across an 18px circle, a contrast
ratio of about 1.03:1. Each appearance now answers with an edge and a ring, and closes the
ring on the press, because a ring does not shrink with the control. The second defect was
the visible one: that shared rule carries a `:not(...)`, which puts it above `:checked` in
the cascade, so hovering a **chosen** radio in Dusk repainted it from the signal violet
back to the page's own dark — click it and it went out again under your pointer. The
shared rule is for text-like controls by name now
([0080](./docs/decisions/0080-a-choice-control-dresses-its-own-states.md), and D7 in
`SAFETY-ANALYSIS.md`), and `apps/docs/src/themes.test.ts` fails both when an appearance
has no pointer state of its own for the two and when a rule that dresses every control can
paint over a chosen one.

**The homepage holds still while somebody plays with the demo.** Reported as "the text on
the start page should not jump if the form changes (e.g. fields visible)". Measured at
1440x900: the headline sat 279px down the page, revealing the conditional field moved it
to 362, and adding the company field took it to 410 — the page rearranging itself under a
visitor who touched it. The words were centred against the preview, so the row's height,
which is the preview's height, decided where they sat. They are placed against the hero
now, at the distance centring used to put them at rest, and the preview grows downward
from its own top; the headline measured the same in all four states afterwards. The form's
sheet also sat flush against the tool rail with a margin on the other three sides — 0px
against 17px — which is what "the form is not centered in the box" was looking at.

**Date and time fields show a calendar or a clock on iPhone.** Reported from a
phone: "the date time fields have no icons on safari mobile". Mobile Safari
never draws one -- the field reads as plain text until it is tapped -- while
Chromium and Firefox draw their own button inside the control. All four themes
now draw a calendar in `date` and `datetime-local` fields and a clock in `time`
fields, in their own `--fm-muted` ink, inside `@supports (-webkit-touch-callout:
none)`, which only iOS WebKit matches: drawn everywhere, Chromium would show two.
`apps/docs/src/themes.test.ts` checks the rules exist only there and that the
icon's colour is the theme's, since a data URI cannot read a custom property.
Checked in Chromium that the rule does not apply; not yet seen on an iPhone.

**Dropping beside a field on the preview does what the line says.** Reported as
"the drag and drop is strange" in the playground builder, and measured there:

- Inside a row, the drop lands to the left or right of the field, and the
  indicator was a line across its top. The stylesheet had a left-edge rule for
  row children and a top-edge rule for every field, of equal weight, and the
  later one won. The surface now names the axis in the value it sets
  (`inline-before`, `inline-after`), so no two rules compete for it.
- A field in a table was treated as standing alone, because only a direct
  `layout-row` parent counted. It was offered the side zones that make a new
  row, and dropping on "Language on the gift card" built one inside its
  half-width cell, where the dropped field landed below it rather than beside
  it. Beside a spanning cell the same drop was offered and then refused with a
  message about `span`. A table's children, through the cell a span wraps them
  in, now count as side by side: left and right move among the cells.

A three-field row in the playground's narrow preview still wraps its third
field onto a new line. That is the reflow rule, twelve rems a column, and not
part of this.

**A radio or checkbox answers on the next frame.** Reported as "in Dusk the
radio is not immediate". The checkbox and radio rules match `input`, so they
inherited the short fade every theme gives its text fields. Dusk and Blueprint
draw the chosen state with exactly those properties, so the state itself faded
in: measured in Dusk, nothing changed for the first frames after a click, the
whole circle then filled with colour before the ring grew back, and it settled
after about 150 ms. All four themes now take the fade off the choice controls.

The first version of that fix kept the checkbox tick, and Pop's and Paper's
radio dot, growing in over 120-140 ms as an ornament. It was reported straight
back as still not immediate, which is right: the tick and the dot are the
state. They are drawn at once now, in every theme.

**Date and time fields fit their field on iPhone.** Reported from a phone as
"broken on mobile" in the playground. Mobile Safari draws `date`, `time` and
`datetime-local` inputs at an intrinsic width that `width: 100%` does not
override, so they ran past the edge of the field; it also centred the value and
collapsed an empty one's line. All four themes now take the platform appearance
off those three types and put the value back at the start of a line that keeps
its height. Chromium was never affected and still keeps its picker button.
Nothing in CI runs WebKit, so the guard in `apps/docs/src/themes.test.ts`
checks the stylesheets rather than a rendered box.

**The landing page shows all four themes, and a form the engine is visibly working on.**
The hero preview offered a light one and a dark one while the packages ship four, which
made a smaller claim than the product supports. It now switches between Paper, Blueprint,
Dusk and Pop, and the form it switches has a radio that decides both what the form asks —
a workshops field appears — and what it totals, computed in the browser as the radio is
clicked.

**The lower half of the page is laid out rather than stacked.** Accessibility and
self-hosting sit side by side from 62rem, the licence section gained the three things
Apache-2.0 actually gives and became two columns instead of a centred paragraph with a
screen of air around it, and the closing section follows the licence directly rather than
after an empty viewport. The hero's text starts at the top of the page instead of centred
against the preview beside it.

**The README's four screenshots are current again.** All four were taken from the built
site and the running admin: the landing page, the same form in all four themes with the
same answers and the same calculated total, the admin's builder over a real published
form, and the playground.




**A grid's rows are flat.** A `datagrid` column could name a `group`, and measured in both
renderers what that produces is the group flattened: its own name never reaches the page,
and its controls land in one cell under one heading that names the group and none of them —
with no labels of their own, because a theme clips a cell's label on the grounds that the
heading says it. Two date controls side by side with nothing to tell them apart, and it
looks finished rather than broken.

`validateSchema` refuses a grid whose child holds fields of its own, naming the child and
saying to give each of those fields a column instead. A stacked repeater is untouched — the
restriction is on the arrangement, which is the only thing that cannot express it.
[0078](docs/decisions/0078-a-grid-row-is-flat.md) has the CSS fix that was tried first and
why it was wrong. `belongsToColumn` is gone from `@formancy/spec` with the nesting it
existed for; a column is one answer, so the renderers compare a wire.

**A strict CSP really needs no configuration now, including `style-src`.**
`@formancy/angular` shipped one component style, `:host { display: contents }`, and Angular
emits a component style as a `<style>` element that `style-src 'self'` blocks without a
nonce — undoing the grid layout of a whole renderer, silently, since nothing in a browser
renders those bindings. It is set through CSSOM instead, which no directive governs, so the
package ships no stylesheet at all and 0008's "nothing below the kit ships CSS" is restored
rather than amended. [0079](docs/decisions/0079-a-host-is-undone-without-a-stylesheet.md)
supersedes 0073's mechanism; the decision itself stands.

**The publish audit row names the lists a form needs resolving.** `form.published` gained
an `optionsSources` detail — the `optionsSource` names the version uses, sorted and once
each, and absent when there are none. `SAFETY-ANALYSIS.md` A7 already told a manufacturer
to read them there; the record held only the version and the hash, so it described
something that did not exist.

**`SAFETY-ANALYSIS.md` C3 said the server does structured logging with configurable PII
redaction. It does neither.** Fastify is constructed with `logger: false` and nothing in
the repository redacts anything. The entry now says what is true — there is no log, so
submission content cannot reach one — with the larger residual spelled out: no log means no
diagnostics, and a deployment that adds one owns the redaction question alone.

**Focus in the builder tree follows the field, not the row number.** Move a field and the
tree reported whichever field slid into that position — for `billing` moved to the top,
`billing.street`, a field nobody chose, in a builder whose whole premise is the keyboard.
The test that should have caught it called `moveField` outside `act`, so it could not fail.


**A code node must say what it is.** [0070](docs/decisions/0070-a-code-is-an-arrangement-not-a-field.md)
has always said the picture is decoration and "the label and the value behind it are the
accessible content" — and `label` was optional, which made the accessible content
optional. The builder was the worst offender: it inserted `{ kind: 'qrcode', path }` with
no label at all, so every code node made that way was an unnamed live region announcing a
bare string.

`validateSchema` refuses a code with no label now, the builder supplies one named after the
answer it shows, and a code node added without one is refused outright rather than left to
fail at publish.

**A chooser stores a string.** A `select` or `radio` answer that is not one — an object, an
array, a number — is refused with `type`. It had to be: a field whose options live
elsewhere has no list to compare against, and the server's membership check walks only
strings, so `{"canton": {"$gt": ""}}` was stored with nothing having looked at it.

**Fixed: the server's membership check could not run.** `AppOptions` had no
`optionsSources` and `createApp` never set it, so in the shipped HTTP server the whole
server half of `optionsSource` was unreachable — while `SAFETY-ANALYSIS.md`'s A7 stated the
constraint unconditionally.

**Fixed: the "this source is missing" message was unreachable for the typeahead** — the
widget the feature was built for. Both renderers dispatched to the widget before checking,
so what somebody got was a working-looking combobox that returned nothing and announced "No
options match": that says the list has no such row, when the truth is there is no list.

**Fixed, in Angular only, three ways the two renderers had become two different controls.**
It looked the stored answer up in the document's options, which a sourced field does not
have, so the box rendered empty over an answer the form was holding. It asked every source
twice, because a select carrying the widget delegates to another component and both extend
the same base. And its labels request was never registered for abort, so it outlived the
component that asked for it.

**Fixed: a resolver was told the field key, not the field's path.** `OptionsRequest.path` is
documented as "the field's data path, e.g. `canton` or `people[1].canton`" in both
renderers, and both sent `def.key` — so a resolver could not tell two same-named sourced
fields apart, and never saw which row of a repeater it was answering for.

**Fixed: backspacing under the minimum query length reported the source as broken.** The
generation counter was bumped only on the path that sends a request, so the abort arrived at
a handler that still believed it was current — and the box stayed marked busy with nothing
in flight.

**Two bugs an adversarial review found before the beta, and neither was catchable by
the guards in place.**

**A datagrid with no authored column widths rendered as one column.** Eight rules per
theme — every definition of `--fm-datagrid-count` — were scoped to a placeholder a
script had failed to substitute, so the selector matched nothing and the variable was
never set. A grid whose author sized no column fell through to `repeat(1, …)`: one
content track for a grid the renderer had just declared to have four, with every cell
label still clipped, because the media query that un-clips them applies only below
40rem. A column of unlabelled controls.

The existing guards could not see it. The parts check asks whether a rule *names* a
part, and a dead rule names it; the scope check asks whether a `var(--fm-x)` with no
fallback resolves, and this use carries one. "Is it defined?" cannot distinguish a
definition in a rule that can never apply. There is a guard for that now: every rule in
a theme is scoped to that theme's own name, derived from the file rather than from its
filename.

**A control asked for the same name forever.** When a source did not know a stored
value — a resumed form holding one the list no longer offers, or a host implementing
only `kind: 'search'` — the answer still replaced the map, a new map was a new
dependency identity, the effect re-ran, and it asked again. Measured: **602 requests in
300 milliseconds** in React and 101 in Angular, with no "maximum update depth" to notice
it by, because every turn went through a promise. Both renderers remember what they have
*asked for* now, rather than inferring it from what came back.

**A `select` may take its answers from the deployment** —
`optionsSource: "pickup-points"` ([0077](docs/decisions/0077-options-may-come-from-a-named-source.md)).
Asked for as "connect an external data source"; delivered as a **name**, never a URL.

A URL in a form document is three problems at once: a deployment detail in a portable
format, so the same form copied from staging to production points at the wrong system;
unfixable, because a published version is frozen forever; and attacker-influenceable, on
an instance that sits inside a private network. A name costs one line of deployment
configuration and removes all three.

**Nothing in formancy fetches anything.** In the browser the host supplies a map of
sources — the third instance of the inversion the uploader and the scanner already are,
with one deliberate difference: a **map** rather than one resolver, because the control
has to know *synchronously* whether a name resolves. A select whose options come only
from a source collects nothing, so an unconfigured name renders a message where the
chooser would be, exactly as the file field does without an uploader.

On the server it is an injected port and **no HTTP client**: `members(values)` returns
the values a source does *not* offer, so an adapter answers from a SQL `IN` clause
without materialising a list. A source that cannot answer fails the submission **closed**
— 503 and retryable, because an accepted bogus value is undetectable afterwards while a
refusal leaves the draft holding the answers.

**The guarantee, stated plainly because it is weaker:**

> A `select` with `optionsSource` stores a string the deployment's own source confirmed
> was a member **at the instant the submission was accepted** — or, where the deployment
> supplied no `members` function, that nothing checked at all.

`schemaHash` no longer determines what a valid answer is for such a field, and a stored
submission cannot be re-judged later. `optionsSource` in the document is exactly what
declares that: greppable, enumerable per published version, and visible in the builder.
Recorded as hazard **A7** in `SAFETY-ANALYSIS.md`.

**What a source returns is unchecked input.** A bad row refuses the *whole* list rather
than being filtered out — a partial list silently lacks the row somebody came for, and
they cannot tell that from a source that does not have it.

**Accessibility:** `aria-busy` and never `disabled`, because disabling the element
somebody just typed into blurs it and the browser resets focus to the document body. One
status region saying four things and **never** the error region — a source being down is
not a wrong answer. A `labels` request names what a draft already holds, so a resumed
form is not an empty box over a stored answer.

`typeahead-empty` is now **`typeahead-status`**, because it says four things rather than
one, and a sourced plain select gains `select-status`. A theme styling the typeahead
needs the new names.

**Fixed: a generated property control could not be typed in.** Found by writing the tests
the coverage report said were missing — the two new panels were at zero, and two of the
first cases written against them failed.

`span` is `anyOf: [integer, const "all"]`, so typing `all` offers `a`, then `al`, then
`all`. The first two are refused by the schema, the document does not change, and a purely
controlled box re-renders empty — so the next keystroke lands in an empty box and **the
word could not be typed at all**. Clearing a table's `columns` to retype it is the same
shape: a table must have one, the empty moment is refused, and the old number snaps back
mid-edit.

The generated control now keeps a local draft and offers every edit to the session, exactly
as the options editor has always done; a refusal simply leaves the document where it was.
The form still cannot be *published* in an invalid state — `canPublish` says no — but it
can be typed in.

**Everything the format has is configurable from the builder, and a guard now says so.**
The question was asked out loud — "is it all settable?" — so it is answered by a check
that keeps answering rather than by a look. `packages/builder-react/src/properties.test.ts`
walks the JSON Schema itself and refuses any property that no panel offers, unless it is
named in a short list with the reason. It found two gaps on its first run.

**No layout node property could be set at all.** Not a table's `columns`, not a section's
`label` — since the day layouts existed — and not `span`, from the moment the format grew
it. The format validated them, both renderers honoured them, and the only way to write one
was to edit the JSON. There is a layout property panel now, generated from the same schema
the field panel reads, writing through one generic `setLayoutNodeProperty` command that is
attempted against the validator like every other.

**A datagrid's `columns` could not be set either**, because the schema hangs that branch on
`widget: "datagrid"` rather than on the field's type, and the derivation only ever matched
types. It matches both now, and there is a columns editor beside the options editor — a
column *names* a child field, so the choice is a list of the children that exist rather
than a text box.

**And a span typed as a number did nothing.** `span` is `anyOf: [integer, const "all"]`, so
the generated control is a text box — and the string `"2"` is refused by the schema while
`2` is accepted. The panel now hands over a number when the text is one, decided from the
schema rather than from the property's name.

**Fixed: the QR code's value had no accessible name.** Reported by somebody looking at the
running playground. The label was a `<span>` beside the value rather than attached to it,
so `computeAccessibleName` of the `<output>` holding the value was the **empty string** —
and `<output>` is a live region, so a screen reader announced a booking reference with
nothing to say what it was. The label carries an id now and the value points at it, in both
renderers.

**The playground audits itself.** The forms this tool produces have been audited since the
beginning; the tool never was, which is the more embarrassing half. `apps/playground/src/accessible.test.tsx`
computes the accessible name of every control on the page with a real implementation and
refuses an empty one, and runs axe in the same configuration the renderers are held to.

Live regions are deliberately **not** required to carry a name: `role="status"` does not
need one, and every region on the page says a whole sentence — "No options match" — that
explains itself. `<output>` is the one exception, because what it announces is a bare value.

**An answer is now checked against the options offered, and it never was**
([0076](docs/decisions/0076-an-answer-is-one-of-the-options.md)). This format's own schema
documented `widget: "typeahead"` with "The answer is still one of the options offered" and
`types.ts` said "Still one offered option value". Neither was enforced anywhere. Measured
against the built engine — the same build the server runs:

```
validate(): {"valid":true,"errors":{}}
value:      {"country":"XX","colour":"plaid","extras":["nope"]}
```

A `select` offering CH and DE accepted `XX`; a `radio` offering only `red` accepted
`plaid`; a `selectboxes` offering only `gift` accepted `["nope"]`. The controls could not
produce any of it — each reaches `setValue` with an option's own value or with `null` — but
a payload posted straight at the server is not a control.

`modelViolations` refuses it now, with the code `option`, in the one function the browser
and the server both run. The **value** and never the label, and only when the document
carries options — a field with none has nothing to be outside of, which is also the seam
remote options will need.

**This can refuse data that was accepted before, which is worth knowing before you
upgrade.** Stored submissions are never revalidated, so nothing already collected changes.
A **draft** is different: resume one holding a value whose option the author has since
deleted, and it now reports `option` where it used to say nothing. That is the honest
outcome — the draft holds an answer the form no longer offers.

**`widget: "datagrid"` on a repeater is built** — rows drawn as a grid whose columns line
up, in both renderers ([0075](docs/decisions/0075-a-datagrid-is-drawn-not-tabulated.md)).
It was the last widget the spec named and no renderer honoured, and the playground's
"not demonstrated yet" list is now **empty** for the first time.

**Generic elements and CSS grid, not a `<table>` and not `role="grid"`**, and the first
half of that was measured rather than argued: against the accessible-name implementation
this repository installs, a `<th scope="col">` contributes **nothing** to the name of a
control in its column, and neither does a `headers=` target. A clipped `<label>` does. So
the table earns no name for its cells, the per-cell label has to stay either way, and the
table would only add a header echo on every cell plus obligations this repository's axe
configuration does not even check — `td-has-header` is tagged `experimental` and does not
run under the tag list in use.

What the table would have bought is real and is not pretended away: coordinates, and the
heading announced on cell navigation. A screen reader user hears the same sequence as in
the block rendering and learns a row's position on reaching that row's buttons.

`role="grid"` is refused for the reason `toggle` is not `role="switch"` — a role is not
paint — and because the arrow keys are already owned cell by cell: a `select` with
`widget: "typeahead"` is legal in a row and claims Up, Down, Home, End, Enter and Escape.

**A row's buttons are marks rather than sentences inside a grid**, and the accessible name
is untouched. Measured in the playground: "Remove recipient 1 of 1" wrapped onto three
lines and took 180px of a 446px grid — more room than the answers beside it. The buttons
are now 28px square and the answer fields went from 138/46/46 to **229/76/76**.

The renderer draws no mark of its own: an icon is appearance, and appearance belongs to
the consumer. What it adds is a hook — each button's text moves into its own element so a
theme can **clip** it. Clipped and never removed, because `display: none` and
`visibility: hidden` both compute a button's accessible name to the empty string, and a
button called nothing is worse than a wide one. Confirmed in a browser: the control is
still `button "Remove recipient 1 of 1"` in the accessibility tree.

The WCAG position, stated rather than assumed: **2.5.3** binds the accessible name to the
*visible* text and an icon-only control has none, so the name stays the whole sentence
0068 put the row's position into; **1.1.1** is satisfied by that same name; **2.5.8** wants
24×24 CSS pixels and these are 28, which matters because three of them sit together and
the spacing exception does not apply; and the marks are drawn in `currentColor` from
borders rather than as images, so **forced-colours mode re-colours them instead of erasing
them**.

**Six new parts for a theme to style**, and two contracts that come with them. The cell
labels are **clipped**, never `display: none` or `visibility: hidden`: both of those
compute a control's accessible name to `""`, so a theme tidying them away that way would
silently unname every control in the grid. And rows take the container's tracks with
`subgrid`, which is what keeps the columns true across rows; verified in Chrome, **not
verified in Firefox or Safari here**.

**The column plan lives in `@formancy/spec`**, not in each renderer, for the reason the
typeahead's filter does: a grid that ordered its columns one way in React and another in
Angular would be two forms from one document, and each renderer's tests would be green
against its own ordering.

**A table child may span its grid** — `span: 'all'` or `span: <n>` on a layout node inside a
`table` ([0074](docs/decisions/0074-a-table-child-may-span.md)). Reported against the
playground, where a rich text editor and a file dropzone sat at **266px against 548px** for
a field in the flow.

The answer "put the wide thing outside the table" was wrong, and not only because it is
clumsy: a `table` carries its own `label`, and that label names a real group, so a field
moved out for the width is out of the group too. It was a layout the format could not
express. `span` lands in **spec version 2, which has never been released**, so it costs no
version bump now and would have cost one after the first release.

`'all'` rather than a number is the one to reach for: `span: 2` in a two-column table
silently becomes two thirds when somebody makes it three columns. A span outside a table is
refused rather than ignored, and a span wider than its table is refused naming the actual
column count.

**Only a spanning node is wrapped**, in a new `layout-cell` part, so a form that uses no span
has exactly the markup it had before. A theme that styles the table layout needs a rule for
that part, and its narrow-screen reset must come **after** the rule it beats — at one column
a numeric span would otherwise create an implicit second column and put the page back to
scrolling sideways. That ordering is guarded, and the guard was written because the first
version of this got it wrong.

**Fixed: a two-column table layout never produced two columns in Angular**
([0073](docs/decisions/0073-a-host-element-is-not-a-layout.md)). Angular gives every
component a host element and the layout component recurses, so a container's children
arrived wrapped in a `<formancy-layout>` that React does not emit — and that wrapper was
the grid's only item. Measured with both renderers' markup on one page: React put two
fields side by side, 442px apart; Angular stacked them.

`@formancy/angular` now ships one declaration, `:host { display: contents }`, which is a
deliberate narrow amendment to [0008](docs/decisions/0008-layered-packages.md) — it owns no
appearance, it undoes an element the framework forces the renderer to emit. **A deployment
under a strict `style-src` needs Angular's `ngCspNonce`**, which is the first such cost in
this repository and smaller than a layout that is wrong everywhere.

Worth saying plainly: **nothing could have caught it.** jsdom has no layout, conformance
queries by role and accessible name, axe had nothing to report, and no application here
renders the Angular bindings. It is the second CSS bug in a week found by a person looking
at a running page, and there is no gate for that.

**Fixed: the typeahead popup opened over its own label and box.** Reported against the
running playground. The list was absolutely positioned with `top` left at `auto`, on the
reasoning that it would then take its static position — where it would have sat in the
flow, directly under the box. That holds inside a block container and **not** inside a grid
one, and every theme lays a field out with `display: grid`: for an absolutely positioned
child of a grid container the static position is the container's own content-box origin, so
`auto` resolved to the top of the field. Measured in the playground before the fix, the
field's top edge was 457px, an in-flow child would have sat at 537px, and the popup sat at
459px.

Both renderers now emit a `typeahead-anchor` that wraps the box and the list and nothing
else, and every theme positions the popup against it with an explicit `top: 100%`. The
status region deliberately stays outside the anchor, because it is a row of the field's grid
exactly as the error region is.

**A theme that styles this widget needs one new part**, `typeahead-anchor`, and the popup's
offset is no longer optional. `apps/docs/src/themes.test.ts` fails if a theme leaves the
anchor unpositioned, leaves the popup without an explicit block offset, or positions the
field itself — which is the arrangement the bug was. Each of the three was reverted in turn
and watched to fail.

**And the decision record was wrong rather than incomplete**, which is worse, so
[0072](docs/decisions/0072-a-typeahead-is-a-combobox-over-the-same-answer.md) carries the
correction at the top rather than an edit in place. Nothing could have failed on the original
claim: jsdom has no layout, so no renderer test can see where a box lands. What replaced it
is a structural contract a test can hold.

**`widget: "typeahead"` on a select is built** — an editable combobox in both renderers,
shown in the playground demo
([0072](docs/decisions/0072-a-typeahead-is-a-combobox-over-the-same-answer.md)). Until now
the property validated and nothing happened, which is the documented-but-inert failure this
repository has shipped once already.

**No conformance fixture changes, and that was measured rather than hoped for.** A plain
`<select>` with no `multiple` and no `size` already maps to `role="combobox"` — `aria-query`
5.3.2's `comboboxRole.relatedConcepts` says so, and `elementRoles` maps the element — so
`getByRole('combobox', { name })` finds the plain control and the widgeted one alike, and no
fixture holding a select behaves differently ([0034](docs/decisions/0034-accessible-name-only.md)).
Each renderer's first test case asserts it, because that is the claim the widget rests on.

**It cannot store what somebody typed.** `setValue` is reached from two places in each
control, with an option's own value or with `null`, and the text goes nowhere but the filter
— so Escape abandons the query and keeps the answer, leaving the field with a partial or
unmatched query stores nothing, and an emptied box clears the answer, because a select's
empty option means un-answering is always available and a widget may not take it away
([0065](docs/decisions/0065-a-widget-is-authored-not-registered.md)).

**The ARIA the pattern is usually got wrong on:** the listbox element exists while the popup
is collapsed, because `aria-expanded` and `aria-controls` are required properties of the role
and an `aria-controls` pointing at nothing is an unresolvable IDREF;
`aria-activedescendant` is absent rather than empty when nothing is active;
`aria-autocomplete="list"` and not `"both"`, because nothing is ever written into the box for
you; no `aria-haspopup`; and `aria-selected` marks the chosen option and never the
arrowed-over one — following the arrow keys with it tells a screen reader the answer changed
on every press of Down. axe runs over all three states of the popup in both renderers, and
the guard was checked by deleting `aria-controls` and watching it report
`aria-required-attr`.

**One filter, in `@formancy/spec`.** `narrowOptionsByLabel` folds case and diacritics with
`normalize('NFD')` and no dependency, reads the **label only** — the value is not on the
screen, so matching it would behave on data the person cannot see — and returns the
document's order rather than a ranking, because re-ranking moves the row somebody is already
reaching for. It lives there for the reason `applyRichCommand` does: a filter may not narrow
one way in React and another way in Angular. It is folding and not collation, so `strasse`
does not find `Straße`; the limits are tests rather than a sentence.

**Three corrections to the typeahead before it landed, and one of them fixed a guard.**

The empty-result region is hidden with `margin: 0` on `:empty` and no longer with
`display: none`. `display: none` prunes the node from the accessibility tree, so the region
would have been *created* at the moment it got its text -- which is the announcement failure
an always-rendered live region exists to avoid.

Paper's typeahead option asked for `var(--fm-line-height)`, which that theme defines on its
textarea and nowhere else. Outside a textarea the reference resolved to nothing, the
declaration was dropped at computed-value time, and the row silently inherited its line
height -- scoped exactly like a variable that does not exist. `apps/docs/src/themes.test.ts`
did not catch it, because its orphan check grepped the file for a definition rather than
asking about scope; it now checks that every `var(--fm-*)` without a fallback is defined
either at the theme root or on the rule that uses it. Shown to fail by putting the defect
back, and its first version was *itself* vacuous -- it tested whether a selector contained
`[data-formancy-theme=`, which every rule in the file does, so paper's textarea counted as
the theme root.

And the `aria-selected` case in both renderers now arrows three rows rather than two.
`Français` is the second of five options, so two presses landed on the row that was also the
chosen one, the two facts coincided, and a control whose `aria-selected` followed the arrow
keys passed -- measured, by inverting the binding in each renderer and watching all 24 cases
stay green. It fails in both now.

**No combobox library and no positioning library.** The popup is placed in CSS and therefore
has no collision detection: a list opened near the bottom of the window runs past it and the
page scrolls rather than the popup flipping above the box, and the active option is not
scrolled into view. Both are stated in the record rather than discovered.

**A documentation claim that was already wrong, found while writing this:**
`docs/architecture/08-crosscutting-concepts.md` described the component registry as resolving
`(type, widget)` with a per-widget precedence step. There is no per-widget registry entry in
either renderer — the registry resolves per-path then per-type, and a widget is honoured by
the control for that type. It now says what the code does.

**Two corrections to the scanner before it landed**, both about the rule that a widget never
changes what a field collects.

A scanned answer is sanitised the way the control would sanitise it: `<input type="text">`
strips CR and LF from everything typed or pasted, and a scanned code payload can be several
lines — storing it verbatim put a value in the answer that typing could not produce. jsdom
does not implement that sanitiser, so nothing noticed until a case asserted it.

And the scan button no longer disables itself while scanning. Disabling the element somebody
just pressed blurs it and the browser resets focus to the document body, so a keyboard user
is returned to the top of the page and told to type instead into a field they must find
again. Busy is said with `aria-busy`; a re-entrancy guard does what `disabled` was doing.
**Not covered by a test**, and said so: jsdom does not blur a focused element that becomes
disabled, which is why it was written the other way round first.

**`widget: "scanner"` on a text field** — a camera route to a value somebody could
otherwise type, in both renderers and shown in the playground demo
([0071](docs/decisions/0071-a-scanner-is-supplied-not-built.md)). The widget name has
validated since spec 2 and no renderer did anything with it, which is the
documented-but-inert state this repository has shipped once already.

**The host supplies the scanner, exactly as it supplies the uploader.**
`ScannerProvider` in React, `provideFormancyScanner` in Angular, and one function:
`(request) => Promise<string | null>`. A renderer cannot own camera permission policy,
cannot own a decoder without putting one in every consumer's dependency closure, and has
no business owning a full-screen viewfinder in a design system it knows nothing about. So
it owns none of them, and **no decoder ships** — a consumer who wants one supplies it.

**Without a scanner there is no button, and the field is the ordinary text input.**
Unlike the file field there is no message, because nothing is unavailable: typing was
always this field's primary route, and it is also the fallback for a refused permission, a
damaged code and a person who would rather type. A `Scan` button that opens nothing is a
promise the form cannot keep, and worst for the people who cannot see that nothing
happened.

**A device failure goes in the field's own `role="status"` region, never in its error
region.** That region is the control's `aria-describedby` target and holds the engine's
verdict on the answer; a refused camera put there would describe a hardware problem as a
wrong answer, and would have a renderer writing content the engine owns. Rejecting means
the device failed and is said out loud; resolving with `null` means somebody closed the
camera, which is not a failure and is said with silence.

**What the camera read is stored, then judged like anything typed.** A scan the field's
`pattern` refuses becomes the value and the error, rather than being dropped — dropping it
would discard the only record of what the camera saw and leave the field looking
untouched. Both renderers have exactly one `setValue` call site for a text answer, taking
a `string`, so the guarantee that a widget cannot change what a field collects is
structural rather than careful.

**A code can be added from the builder, which it could not be.** The `qrcode` layout kind
reached the spec and both renderers with **no way to insert one** — the arrangement palette
offered Row, Column, Section and unplaced fields, so an author's only route was editing the
schema JSON. The construct existed, worked, and had no door.

It takes a step the other entries do not: a container needs no path and a field placement
takes one from the *unplaced* list, but a code offers **every** answer, because it is a
second view of an answer rather than a placement of it — and showing a code beside the field
it encodes is the ordinary case, which the unplaced list would have excluded.

**And it nearly shipped as a three-click dead end.** `validLayoutTargets` decides legality by
trying the edit against the validator, which refuses a code in a version 1 document — so the
button worked, the answer chooser worked, and the final step offered no targets at all. In a
version 1 document the palette now says the version and offers the one-step upgrade, which is
the shape the field palette already used. A test asserts the entry appears afterwards, so
saying yes gets what was asked for rather than an unchanged palette.

The key legend said `a` adds "a row, column, section or field". It names the code too, and a
test checks the legend against what the palette actually offers — the palette opens only by
pressing `a` on the tree, so the legend is how anybody finds it.

**Fixed: a code node sat flush against whatever followed it.** A field gets its spacing from
`[data-formancy-part='field']`, which ends with `margin-block-end: var(--fm-step)`, and a
code node is not a field — so it inherited none. It now ends with the same step in all four
themes.

**A code node appears in the Arrangement tree and not the Fields tree, and that is
correct.** Reported as missing from "the tree": the playground has two, and a code collects
nothing and has no key, which is the whole reason it is a layout node rather than a field
type. It is listed as "Code for <the answer>" rather than "Code", because a tree of several
rows needs each one to say which is which.

That was true already and had no test, so two now assert it — that the pane lists it by that
name, and that it is a leaf nothing tries to look inside.

**Fixed: the playground's file field could not accept a file.** Reported from the running
playground, and there were two reasons rather than one.

The app provided a rich-text editor and **no uploader**, so the field rendered read-only
and said there was nowhere to put a file — correct behaviour for a missing uploader and
the wrong thing for a demo, where the file field is the one a visitor most wants to try.
The landing page had had an uploader all along, which is why it worked there and not here.

And the field is **hidden until gift wrapping is chosen**: there is a visibility rule on
it. That is the demo working as intended, and it also means anybody looking for the
uploader had to find the conditional first.

The playground's uploader keeps the bytes for the session and says so —
`playground:in-this-tab/…`, which is not a location any server would recognise. It
deliberately differs from the landing page's, which records that the bytes went nowhere:
that page is a pitch and a plausible-looking storage key would make the product look like
it silently drops files, while the playground is a tool and somebody there wants to see
the round trip.

**The test for it was vacuous twice before it worked.** It first waited for the message "no
upload destination has been configured" to be absent — which it is while the form has not
rendered, and again while the field is hidden. Both passes would have survived removing the
uploader. It ticks the option and waits for the control now, and removing the provider
fails it.

**A `qrcode` node draws an actual code.** Reversing the position taken one change ago, which
argued the encoder was not worth its cost — an argument about cost rather than about value,
and a code node that shows no code is a feature named after something it does not do.

`uqr` is MIT, has **no dependencies**, and measures **6.6 kB brotli** rather than the ~10 kB
the earlier reasoning guessed. The build leaves it **external**, so a consumer with no code
node pays nothing for it in their bundle; `@formancy/react`'s barrel grew 0.4 kB, which is
the drawing component and not the encoder.

**Only `encode` is used, never the library's own `renderSVG`**, which emits `fill="white"`
and `fill="black"`. A renderer choosing colours is what
[0004](docs/decisions/0004-headless-core.md) exists to prevent, so the modules are drawn from
the boolean matrix with `fill="currentColor"` and the light ones are simply absent — a theme
sets `color` and whatever is behind shows through.

**The picture is decoration and the value is the content**, unchanged: the SVG is
`aria-hidden` and the value stays on the page as real text, because a picture of a code says
nothing to a screen reader and an `alt` of "QR code" says nothing either.

**Nothing is drawn for an empty answer.** An empty string encodes to a perfectly valid code,
and a scannable picture of nothing is worse than no picture, because somebody would scan it.

Under `forced-colors` the code overrides the user's palette to stay dark-on-light — the one
place doing that is correct, because a scanner is not reading the palette and an inverted
code does not scan.

**Stated because no test here covers it:** a mis-encoded code is a picture that looks right
and does not scan. The tests assert the matrix is drawn, its colours and its accessibility —
not that a scanner reads it. A deployment whose codes are load-bearing should scan one.

**My own guard from the previous change caught this one.** The bundle figures in §9.3 are
checked against a fresh measurement, and adding the drawing component failed it with
"says @formancy/react is 12.1 kB; it measures 12.5 kB" — one pull request after it was
written.

**Fixed: four documents claimed a bundle-size gate that does not exist.** The budgets table
in the architecture document carried "gate configured" in its Actual column for both
bundles; the verification view and the **regulatory evidence table** both listed
`size-limit` as running under `pnpm check:pkg`. Nothing in the repository runs it — and
[0038](docs/decisions/0038-esm-only.md) said so plainly in its own *Verified by* line all
along, which is three documents contradicting a fourth.

Measured instead, and dated: `@formancy/core` is **14.8 kB** brotli against an 18 kB
budget; `@formancy/react`'s whole barrel is **12.1 kB** against a 4 kB budget.

**The React figure is not reported as a breach, because it is not known to be one.** 4 kB
was written for a tree-shaken entry — the per-entry `exports` map exists so that
`@formancy/react/fields/date` pulls only what it needs — and 12.1 kB is every field type,
the error summary, the resume notice and the wizard together. Which number the budget meant
cannot be settled without running a bundler over a realistic import, and nothing here does.
So it is **unverified, neither met nor missed**, and listed as debt.

No threshold was added, deliberately: a number chosen today would be chosen to pass, which
is a guard written green. `apps/docs/src/bundles.test.ts` instead recomputes the sizes and
fails when the document's figures no longer match them — so the prose cannot go stale even
though the gate is absent.

**A `qrcode` layout node** — a machine-readable code drawn from an answer the form already
holds, rendering in both renderers and shown in the playground demo
([0070](docs/decisions/0070-a-code-is-an-arrangement-not-a-field.md)).

**Not a field type, because it collects nothing.** A field type would put a non-answering
entry in the model: a key that is an identity forever, a path in the data, a row in every
diff, a CSV column nobody filled in, and a target a computed rule could aim at. Not a
widget either, for the opposite reason to `scanner`: a widget sits on a field that
collects, and replacing an input with a picture changes what somebody may enter.

**It is not a placement.** A code is a second view of an answer a field node places
elsewhere, so it is exempt from the one-place-per-field rule and ignored by `placedPaths`
— counting it would report a field as placed when no control for it exists.

**The union's two-shape assumption is now named once.** `LayoutNode` had exactly two
shapes — `field`, childless, and everything else, with children — and **fourteen** places
encoded that as `node.kind === 'field' ? … : node.children`. `qrcode` is the first
childless node that is not a field, so all fourteen were about to be wrong: the compiler
caught most, and two walkers instead read `undefined` at runtime. `LAYOUT_LEAF_KINDS` and
`layoutChildren` say it once, so the next childless node is a one-line change.

**There is no QR encoder, and that is stated rather than hidden.** Encoding one is a
matrix, mask patterns and Reed–Solomon error correction — about 10 kB for the smallest
honest implementation, in a package budgeted at 4 kB brotli, and a SOUP row for every
consumer including the Node engine. So the renderer emits the value as real text plus the
part hooks, and a consumer who wants the picture registers a component. **Out of the box a
code node shows the value and no code**: a usable form with a visible gap, which is the
right way round.

The accessible content is the value rather than the picture in any case — a picture of a
code says nothing to a screen reader, and neither does an alt of "QR code". What somebody
needs is the value, which they can read, copy or dictate.

**The same bug was written twice and caught twice:** both renderers first read the field
snapshot without subscribing, so the value rendered once and never again — in React because
nothing subscribed, in Angular because a method call is not a signal an OnPush component
re-runs for. Measured in both: the node stayed empty after the answer was typed.

**Rows can be reordered while a form is being filled in.** `engine.moveRow`, with Move up
and Move down buttons in both renderers
([0068](docs/decisions/0068-a-row-keeps-its-own-state.md)).

Buttons rather than a drag, and that ordering is the point: WCAG 2.5.7 requires a non-drag
equivalent for any drag operation, so a drag affordance can only ever be a second route to
these. The accessible name carries the position and says where the row goes — "Move Item 2
of 3 up" is a sentence somebody can act on without counting rows first — and the buttons
are absent at the ends rather than disabled, because a disabled button is still in the tab
order in some browsers and announces a control that does nothing.

**Fixed: removing a row showed an error on a row nobody had visited.** Touched-ness gates
error presentation and was stored against a row's POSITION. Measured: two required empty
rows, visit the first, try to submit, remove the first — and the surviving row, which
nobody had visited, reported `touched: true`, `errors: ['required']` and
`aria-invalid="true"`. `removeRow` had always done this. It was found by adding `moveRow`,
which is the same defect with a bigger blast radius: a removal shifts a suffix by one, a
move shifts a whole span.

State is remapped with the rows now, in `interaction.ts` where the set lives rather than in
the engine. Errors need no remapping because they are recomputed from values — a row that
moves is re-validated where it lands.

**Fixed in both renderers: a reordered row did not redraw.** Each memoised its row ids on
the row COUNT, with the same comment — "the engine mints an id when a row is created, so
the count changing is exactly when the ids change" — true until rows could be reordered. A
move leaves the count alone, so both held stale ids and would have keyed rows by them,
reusing the wrong DOM. Both read through a subscription now.

**Known limitation: focus is lost on a reorder.** A row's container travels, but the
controls inside it are keyed by their positional wire, so they are recreated. Keying them by
the field's key fixes it and was **reverted** to keep the renderers identical: in Angular
that lets the framework reuse a component whose path is read once in `ngOnInit`, so after a
row removal it shows the previous row's answer — caught by an existing conformance fixture.
A test in each renderer pins the limitation so that fixing it fails them.

**`time` and `datetime` field types, with `earliest`/`latest` bounds.** Both render in
React and Angular, both appear in the playground demo, and the bounds are handed to the
browser as well as checked by the engine
([0067](docs/decisions/0067-a-temporal-answer-is-one-fixed-width-string.md)).

**One canonical form per type, at one fixed width**, because CEL has no time type: an
answer binds as a string, so the only ordering a bound can use is lexicographic — and
that equals chronological order only under conditions the format has to guarantee.
Measured: `'9:30' < '10:00'` is **false** while `'09:30' < '10:00'` is true, so an
unpadded hour turns every bound into a coin toss; and
`'2026-09-19T10:00:00+03:00' < '2026-09-19T08:00:00Z'` is **false** although the first
instant is 07:00Z, which is why a `datetime` stores `Z` and never a numeric offset.

**A `datetime` is an instant; a `time` is a wall clock** and carries no zone, so it
cannot be compared with `now()` — which is what a time of day is rather than a gap.
**There is no per-field `timezone` property**, and the absence is the decision: an
instant already carries its zone, a wall-clock commitment's zone belongs to the answer
rather than the field, and a zone *name* would put the host's IANA data into the replay
contract, so two runtimes with different ICU versions would disagree about one answer.

**Bounds are `earliest`/`latest` rather than `min`/`max`**, which are `number` and
gated to number fields — widening them would let TypeScript accept `min: "5"` on a
field the schema refuses. A bound is a literal, never the clock: `now()` inside one
would let the same submission pass in the browser and fail on the server by the width
of the trip.

**Behaviour change: a `date` answer's shape is now checked.** Version 1 fixed `date` as
a date-only ISO 8601 string and **nothing ever enforced it**, so a deployment posting
`19/09/2026` has been accepted until now and will start failing with `shape`. Taken
deliberately: the freeze promises a version 1 *document* keeps validating, not that a
malformed *answer* keeps being accepted — and an unchecked date cannot be bounded,
sorted or exported without the reader guessing which of `03/04` is the month.

`date` also gains the bounds, in version 2. An optional property only a version 2
document may carry takes nothing from any version 1 document.

**The landing page's field-type count is derived now.** It carried a literal `15` with
a test guarding it; the test worked and the literal was the mistake, so it is counted
from the spec's own list like the decision-record count beside it — rather than
corrected to 17 for somebody to correct again.

**Both renderers draw a `toggle` as a switch, and it is still a checkbox.** React and
Angular emit `data-formancy-part="toggle"`, all four themes style it, and the
playground's consent field uses it so the widget is shown rather than only described.

**Deliberately not `role="switch"`**, which resolves the question
[0065](docs/decisions/0065-a-widget-is-authored-not-registered.md) left open. ARIA's
switch means a control that takes effect when you operate it; a form field sets a
value submitted later, possibly never, possibly after somebody changes their mind
twice — so announcing "switch" describes it incorrectly to exactly the people who
depend on the description. And a role is not paint: changing it would make `toggle`
the first widget to change what a control *claims to be*, which is the line the
widget mechanism exists to hold. The happy consequence is that conformance is
untouched, because every fixture finds the control by role `checkbox` either way.

**The themes guard caught the widget, then failed to catch a broken one.** It reported
all four themes missing `toggle`, as designed. What it could not see is that the first
CSS used `--fm-ink`, `--fm-paper` and `--fm-signal` in every theme, and **three of the
four do not define them** — so the switch was styled, guarded, green, and invisible.
A `var()` that resolves nowhere is not a soft failure: the declaration is discarded
and an `appearance: none` input falls back to nothing at all, which is the invisible
field that guard was written for in the first place.

`apps/docs/src/themes.test.ts` now checks that every custom property a theme uses is
one that theme defines. Its first run found a pre-existing use of `--fm-radius` in
`paper.css` — which turned out to be correct, because it supplies a fallback, so the
check was narrowed to uses without one rather than left to report a false finding.

**A grid's columns can be configured, and `datagrid` stayed a widget.** `columns`
says which of a repeater's fields become columns and in what order, with a relative
width, an alignment and an optional shorter heading
([0066](docs/decisions/0066-a-widget-may-be-configured.md)).

[0065](docs/decisions/0065-a-widget-is-authored-not-registered.md) said a widget is a
single name, so configuring the columns looked like it forced `datagrid` to become a
field type. **That was built, and the build refuted it.** A widget can carry
configuration — the document schema gates `columns` on `widget: "datagrid"` exactly
as readily as on a type name. And the type version produced a defect on the way:
`walkFields` opened its row scope on `type === 'repeater'` alone, so a grid nested
inside a repeater walked through a rule that exists because the engine cannot count
rows two levels deep. Correct for every type that existed when it was written; wrong
the moment a second type held the same row model. One row model, one type.

The rule from 0065 that mattered is unchanged: **a widget may change how a field
looks and may not change what it collects.** Columns decide which answers appear
where, never which exist — so a field left out of the list is still collected and
still shown, after the configured ones.

A width is a unitless ratio and zero is refused. A CSS length in a document is the
format deciding your design system, and a fixed length is one no renderer can honour
on a narrow screen; a zero-width column still holds a field that is collected and
required-checked, which is the same harm as a field missing from the only layout a
form uses.

**Fixed: the spec reference published an empty heading, and called itself v1.** That
page is generated from the JSON Schema, and the generator read conditional blocks by
field type only — so the block gating `columns` on a widget produced a `####` with
nothing after it. It also hard-coded "Spec reference (v1)" and "the JSON Schema for
spec version 1" while the page documented `selectboxes`, `file`, `richtext` and
`widget`, all version 2: a title contradicting the body of its own page. The version
is read from the schema now, and a block gated on something the page has no
vocabulary for throws rather than publishing a heading nobody can interpret.

The generator also renders the keys of an array-valued property, so a reader learns
what a column contains rather than only that `columns` exists — which is where the
guidance lives.

**A stale message, found in passing:** the nested-repeater error said "in version 0
of the spec" long after the spec reached 2. It names no version now. Which version
forbids it is not what the author needs, and a number in a message goes stale
silently.

**An author can say how a field should look: `widget`.** Four names to begin with —
`toggle` on a checkbox, `datagrid` on a repeater, `typeahead` on a select, `scanner`
on a text field — each gated to the type it belongs to, with a typo refused at
authoring time rather than falling back differently in each renderer
([0065](docs/decisions/0065-a-widget-is-authored-not-registered.md)).

All four arrived as requests for new *field types*, and none of them changes what is
collected: a toggle stores `true | false | null` like the checkbox it is. Four types
whose data is indistinguishable from four existing ones is not what the type list is
for. **A widget may change how a field looks and may not change what it collects** —
the moment a hint alters the value, the validation, or what somebody may enter, it is
a field type, and a test asserts the set rather than trusting it.

**A developer could already do this, and that was the problem.** `registry.byType`
and `registry.byPath` swap the component for any field at no cost to the format —
for anybody who writes code. The builder exists for people who do not, and a choice
only a developer can make is a theming feature rather than an authoring one.

**It is in version 2, and needed no version 3.** The first reasoning here was that a
presentation hint is safely ignorable, so an older reader drops it and renders the
default control. Measured against the real validator, false: the document schema is
closed, so a reader that has never heard of `widget` answers `Unknown property
"widget"` and refuses the whole document. But version 2 has never been released —
the published `0.1.0` pins `"specVersion"` to `{ "const": "1" }` — so no pinned
version 2 reader exists and a construct added before it ships costs nobody anything.

`versionErrors` therefore gates a property for the first time, not only a field type
and a layout kind: a version 1 document carrying a widget would otherwise validate
here and be refused by every conforming version 1 reader.

**Renderers still ignore it**, and a form is correct while they do, because the
default control collects the right answer. React and Angular honouring each name is
separate work — and not merely cosmetic there: a toggle rendered as `role="switch"`
changes the accessible role, so the conformance suite has something to say about it.

**Fixed: the landing page offered a spec version no released package speaks.** It
said the schema spec is at `specVersion: "2"` in the same paragraph as "They are on
npm … at `0.1.0`", while both quickstarts said the schema is frozen at version 1.
The quickstarts were right. `0.1.0` predates spec versioning entirely — its
`formancy.schema.json` pins `"specVersion"` to `{ "const": "1" }` — so it does not
ignore a version 2 document, it **refuses** it. A reader who followed the landing
page installed from npm and could not write the version it named.

The page now says version 2 is implemented here and arrives with the next release,
and points at the quickstarts for what to write today.

`apps/docs/src/claims.test.ts` guards the half that is derivable: the landing page
must name the version `CURRENT_SPEC_VERSION` implements, so bumping the code without
touching the page fails. Whether a version has been *released* depends on npm and on
git tags, which CI does not fetch — a check of that would answer differently in CI
than locally, which is not a gate.

**Uploaded bytes can live in an S3-compatible object store.** Local disk was the
only implementation of `FileStore`, and its ceiling is one replica: two containers
with two volumes each accept uploads the other cannot serve, so a file is
intermittently missing depending on which container answered. Set
`FORMANCY_S3_ENDPOINT` and the four settings beside it and that ceiling is gone
([0064](docs/decisions/0064-an-object-store-behind-the-same-interface.md)).

Garage is what it is tested against — a real one, in a container, on every run.
The same code path serves MinIO, Backblaze B2, Cloudflare R2 and Amazon S3.

**None of the settings is defaulted, and configuring both stores is refused.** A
guessed bucket uploads into nothing; guessed credentials make every file read as
missing; two stores means files land in one and are looked for in the other. All
three fail at startup, which is the only point at which they are cheap.

**The request signer is ours, and no runtime dependency was added.** SigV4 for four
operations is sixty lines against a frozen specification; `@aws-sdk/client-s3`
would have been dozens of packages to characterise in the SOUP declaration for a
PUT and a GET. That is only defensible with an oracle, which is why the tests run
against a real Garage and why one of them asserts a **wrong** secret is refused —
without that case the others would prove nothing.

Two defects the tests found and reading the code would not have. A 403 was treated
as "no such object", on reasoning that holds for a restricted caller and not for
this one — so wrong credentials would have looked like a store where every file
had vanished, and the collector would have deleted every row while every object was
still there. And `content-length` can be neither set nor signed, because undici
computes its own; nothing is lost, since the signed body hash constrains the bytes
exactly rather than just their length.

**Still going through the server.** A presigned upload straight from the browser is
the remaining piece, and it is the only thing that would lift the request body cap
off the largest single file. Neither compose file runs a store either: a fresh
Garage node accepts no data until a layout is assigned, which is four commands
after start rather than anything compose can declare, so a shipped Garage service
would look configured and silently store nothing.

**Fixed: two documentation links 404ed in production.** `Drafts` was linked as
`/concepts/drafts/` from the versioning page and the roadmap. The docs are served
under `/docs/`, so a root-absolute link resolves against the landing page instead
— it builds cleanly and fails only when somebody clicks it.

The check for exactly this already existed in `scripts/build-web.mjs`, and
**nothing ran it**: `pnpm build:web` was in `package.json` and in no workflow, so
the guard fired on the hosting provider after merge rather than on the pull
request before it. It is a CI gate now. A guard that is not a gate is a comment,
and this one had been one for long enough to let two links through.

**A compose file for the published image.** The release workflow builds, pushes
and signs the server image by digest, and nothing consumed it: the only compose
file declared `build: context: .`, so the documented way to run formancy was to
clone the repository and rebuild the image the release had just signed.
`compose.published.yaml` pulls it instead
([0063](docs/decisions/0063-a-compose-file-for-the-published-image.md)).

**It is usable from the next release, not today**, and both the file and the
quickstart say so. No release has run the push — `v0.1.0` predates those steps
and signed only the SBOM — so the registry is empty and the version in the
example is the shape rather than a tag anybody can pull. Shipping the file first
is deliberate: the release that publishes the first image should not also be the
one that finds out nobody can run it.

`FORMANCY_VERSION` has no default and compose stops without it, because no
`latest` tag is published — the SOUP declaration tells a manufacturer to pin an
exact version and calls `latest` uncharacterised software, so defaulting to one
here would be the project contradicting its own advice in the most convenient
place to do it.

**Fixed: `FORMANCY_CHALLENGE_SECRET` did nothing under docker compose.**
`.env.example` documents it in fourteen lines and neither compose file passed it
through, so somebody who put a public form on the internet, read that the
proof-of-work challenge defends it and set the secret as instructed got a server
with the challenge off and no indication of it. A documented switch that is inert
is worse than an undocumented one.

The spelling is a bare key rather than `${FORMANCY_CHALLENGE_SECRET:-}`, and that
was measured: the interpolated form resolves to the empty string when unset, which
is not `undefined`, which trips the server's 32-character minimum and refuses to
boot every deployment that never wanted a challenge. A test asserts the spelling
for that reason.

**Fixed: two pages denied capabilities the server has.** The landing page said the
server had "no proof-of-work challenge, no submission tokens and no audit
logging", of which only the middle one was true — while the self-hosting page,
two clicks away, correctly listed audit logging as present. Both sentences were
written before those things shipped and neither changed in the diff that made them
false. A pre-alpha notice is the paragraph a reader uses to decide whether to
deploy, and one that under-claims is not the safe direction: it tells somebody to
leave off a defence the software already has. `apps/docs/src/claims.test.ts` now
pairs a capability with a file that would have to be deleted for the denial to be
true again.

The self-hosting page gained the published-image quickstart, and rows for
`FORMANCY_CHALLENGE_SECRET` and the two webhook opt-outs, which its environment
table had never listed.

**The SOUP declaration stopped transcribing test counts.** Ten per-package figures
were written into it by hand, they changed on almost every commit, and nothing
failed when they stopped matching — so a reader could not tell a figure one
release old from one that was never right. The suite prints its own counts; the
document now points at the command and keeps by hand only the shape, which does
not drift.

**Corrected in the roadmap:** the remaining deployment gap was described as the
missing one-command path, and `docker compose up -d` had been that path for some
time. The real gap was that it built from source. The gap that is actually left is
the object store — both compose files give a local volume where the design calls
for Garage, which does not survive more than one replica.

**A condition can combine more than one comparison.** "Country is Switzerland and
total is more than 100" is the thing a form author reaches for second, and the
editor could not express it — the expression language handled `a && b` all
along, so anybody wanting two comparisons had to write CEL by hand. Fine for a
developer, and the whole difficulty for the audience this builder exists for.

A rule draft now holds any number of comparisons with one join, **all** or
**any**, and the join only appears once there is something to join — a control
that does nothing is a control somebody has to work out is irrelevant. Rows are
numbered from 1 in their labels, and only when there is more than one, so a screen
reader user can tell "Field 2" from "Field". The first comparison has no remove
button, because `compileGroup` refuses an empty group rather than compiling to an
expression that always passes, and the UI must not be able to ask for one.

**Groups are flat: one cannot contain another.** Nesting is where a condition
editor stops being readable — three levels in, nobody can tell what the
parentheses do — and it is the same reason the repeater refuses to nest. Someone
who genuinely needs it can still eject to raw CEL, which is the escape hatch that
makes the restriction affordable rather than a limitation. One join per group also
means the compiled expression needs no parentheses, because there is no precedence
to get wrong; a test asserts the output contains none, so adding nesting later
fails it and forces the question.

**A single comparison compiles byte-for-byte to what it did before** — no join,
no parentheses — so no existing form reads as changed the moment somebody opens
it. The `editor` metadata does change shape, from a bare condition to the group.
It is documented as regenerated and never evaluated, nothing reads it back yet, and
one shape for one comparison and for many is worth more than keeping that object
unchanged.

No spec version is involved: `editor` is `unknown` in the types and free-form in
the JSON Schema, which was checked before any of this was written rather than
assumed.


**Every third-party action in the release workflow is pinned to a commit hash**,
with the tag in a comment. That workflow holds an npm token, an OIDC identity that
can sign on the project's behalf, and push rights to the registry; a tag is a
mutable pointer, so whoever controls an action's repository can move `v3` to
different code and that code would run here with all three. CodeQL flagged the
three added with the image work, and the two that were already there are pinned in
the same commit because the argument does not distinguish them. Updating one now
means reading what changed and writing a new hash, which is the cost and also the
point.

CodeQL also caught a real defect **in the guard itself**: `/:latest|latest\s*$/`
anchors only its second alternative, so the first half matched `:latest` anywhere
including inside a longer word. Grouped, and `` rather than `$` so it also
catches a tag with something after it on the line.

**The server image is published and signed.** CI built it on every pull request
and proved it starts, and the release threw it away — so a self-hosted,
security-adjacent product whose npm packages carry provenance and a signed SBOM
had no published image at all, which asks people to build it themselves and calls
that a supply chain.

Releases now push `ghcr.io/sharkysan/formancy-server:<tag>`, **signed by digest**
rather than by tag: a tag is mutable, so signing `:v1.2.3` says nothing about the
bytes anybody later pulls under that name, and being about the bytes is the entire
point. The SBOM that was already generated and signed as a file on the release page
is now also **attached to the image** as a CycloneDX attestation — a file beside a
download is a file somebody has to know to look for, whereas
`cosign verify-attestation` finds an attestation without being told where it is.
The image carries GitHub's build provenance too, which is the same statement the
npm tarballs make.

Built in the release workflow rather than carried from CI: an image somebody
deploys should be produced by the workflow that signs it, at the commit the tag
names, and not passed between jobs where the thing built and the thing signed
could drift apart.

**There is deliberately no `latest`.** The SOUP declaration tells a manufacturer to
pin an exact version and says in as many words that `latest` is not characterised
software; publishing one anyway would be this project contradicting its own advice
in the most convenient place to do it. `RELEASING.md` has the verification
commands — against the digest, with `crane digest` to get it — and the SOUP
declaration's integrity row now says what the image carries.

`packages/server/src/release-image.test.ts` fails if the release pushes without
signing, signs by tag instead of digest, stops attaching the SBOM, or starts
publishing a `latest` tag. Its first version failed against a workflow that was
**correct**: it looked for `--push` where the workflow says `push: true`, and for
the digest on the same line as `cosign sign` where the command is written across a
line continuation. That is the third guard here whose regex was the thing at fault,
so each assertion now spells out the alternatives instead of assuming one.


**Four documents said adding a field type is "a compatible change". The decision
record that governs the version line says it is a version bump.** Found before
building `signature`, by checking what it would cost rather than assuming.

The format half of the claim is true — a new type removes nothing, every older
document stays valid, and `upgradeSpecVersion` stays one line. But the version
line is a contract for *readers*, and a reader on the older version does not
half-understand a type it has never heard of: it renders nothing, collects
nothing, and drops the answer, which looks exactly like a field somebody left
blank ([0051](./docs/decisions/0051-spec-2-adds-types.md)).

The claim was written before spec 2 existed, was true of the plan at the time, and
nobody went back to it when 0051 settled the rule. It was in the roadmap twice, in
the architecture goals, and — worst — in the **SOUP declaration**, where it
read as though a manufacturer could pick up a reserved type without a change of
version. That one now says what is actually true: a pinned deployment keeps
working untouched, and acquiring one of these types is a new spec version and a
re-characterisation.

**The practical consequence, now written down: field types should arrive in
batches.** Each bump is an event for every consumer — a pinned reader, a
regulatory characterisation, a line in `MIGRATIONS.md`. Shipping `signature` on
its own and `datagrid` a fortnight later spends two of those where one would do,
which is why neither has been started yet.

`apps/docs/src/claims.test.ts` fails if any live document says it again. The
changelog is excluded deliberately: it records what was said at the time, and
rewriting an old entry to agree with a later decision would be falsifying the
record — a worse fault than the stale sentence.


**Drafts are documented.** There was no page for them, which is a poor state for a
feature whose API changed in a breaking way this week and which has a security
story worth reading before you use it. The new
[Drafts](https://formancy.ai/docs/concepts/drafts/) page covers the three calls,
why the server picks the id and signs it rather than accepting one, and the three
things a host has to get right:

- **Debounce the save.** The obvious implementation writes a database row per
  keystroke. The routes are rate-limited, so an undebounced save starts returning
  429 rather than quietly costing anything — but a form that hits its own limit
  while somebody types stops saving exactly when they are working hardest.
- **Show the migration report**, and the plain statement that nothing forces a host
  to. Resuming is the host's call because the host holds the transport, so this is
  the one part of the draft story the library cannot guarantee.
- **Handle the read-only outcome**, where the draft comes back against its own
  version and cannot be submitted.

It also says what a draft is *not*: not validated on the way in, not private from
the deployment, and not expiring — the token stays good until the draft is
swept. `versioning.md` now sends the reader there, since it described the
migration severities without mentioning that the report is only useful if somebody
sees it.

The roadmap entry for this is corrected rather than ticked off. Every part exists
and none of them is demonstrated: the playground and the marketing site are
client-only, and the admin is the authoring tool rather than a form-filling
surface. So what remains is a host, and saying "described and not demonstrated" is
more useful than calling it done.


**A resumed draft now says what changed while you were away.** The server already
did the careful half — a republished form migrates a draft lazily, and answers
whose field is gone move to `data.__orphaned` rather than being deleted — and
reported it as a severity and a list of changes. **Nothing showed that to
anybody.** Somebody resumed a draft, found some answers no longer on the form, and
submitted believing everything they had typed was in it. The answers were never
lost from storage; they were lost from view, with no notice.

`ResumeNotice` in React and `formancy-resume-notice` in Angular, with the same
wording in both — two renderers agreeing about what a form *tells* somebody
matters as much as them agreeing about what it collects, and this is a case the
conformance fixtures cannot catch, because they drive a form rather than a resume.

It names what was set aside, **says the answers are still kept** rather than
implying they are gone, and uses a caller-supplied label where there is one,
because a field key is not what the question asked. The semantics are copied from
the error summary rather than reinvented: the container takes focus through
`tabindex="-1"` and is deliberately *not* `role="alert"` and carries no
`aria-live`, because focusing it already announces it and doing both announces it
twice. An unchanged draft renders nothing, since a form that opens by announcing
that nothing happened teaches people to dismiss the notice unread.

The themes shape it like the error summary and deliberately do not colour it like
one: nothing is wrong, and answers that were kept safely should not arrive looking
like a failure. Only the breaking case — where the draft genuinely cannot be
submitted — borrows the invalid edge.

`SAFETY-ANALYSIS.md` B2 gains this as a constraint, and its residual is corrected:
it mentioned only the retention question that orphaning raises, which read as
though the person being told was already handled. It also now states plainly that
a library cannot make a host render the notice — resuming is the host's call,
because the host holds the transport.


### Security

**Every unauthenticated route was enumerated and checked**, after the draft hole
turned out to be one of two problems in the same area. The sweep found the limits
were applied inconsistently rather than any second hole: the file routes are
sound — downloading requires an actor, and uploading needs a server-minted id
in `offered` state, writable once, with the byte count checked against the offer.

Two limits were missing and are now in place:

- **Reading a draft.** The write was limited and the read was not, which is the
  wrong way round: the read is where somebody would try tokens one after another.
  An HMAC is not realistically guessable, but limiting the write and leaving the
  guess surface open is not a position worth defending.
- **Minting a challenge.** One per submission attempt is the legitimate rate. The
  point of a proof of work is that the *attacker* pays; handing out unlimited
  puzzles for free is the one part of it that costs us instead.

**One public route is deliberately still unlimited**, and now says so in the
source: fetching a published form. Every other anonymous route is a write, a
guess, or work somebody can demand — this is the read every visitor has to make
before they can do anything at all. Limiting it by IP would refuse the form to
real people sharing an address, an office or a phone network behind CGNAT, and the
failure would look like the form being broken rather than like a limit. The
asymmetry is deliberate and was written down because it looks like an omission.


**Both draft routes are rate-limited now**, on the same terms as submissions and
keyed by IP. A draft write is a database row per request and reachable without an
account; the limiter had only ever been pointed at submissions, because they used
to be the only unauthenticated write. That stopped being true when drafts were
exposed on the public plane and nobody moved the limit across — it was recorded
as a residual when the draft token landed, and is now closed.

**And one rate limit was silently inert.** The upload-target route passed
`timeWindowMs` on its per-route config, where `@fastify/rate-limit` reads
`timeWindow`. The plugin ignored it and the route fell back to the *global*
window. It had no visible effect only because the global registration happens to
use the same numbers, so a deployment that set a different window for that route
would have found it quietly ignored with nothing saying so. A configuration key
that does nothing is worse than a missing one, because it reads as configured.
`packages/server/src/rate-limit-config.test.ts` now fails on any per-route limit
that uses the wrong key.


**A draft now carries its own key. Before this, anybody could read or overwrite
anybody's part-filled form.** `PUT` and `GET /f/:path/drafts/:draftId` were both
unauthenticated and the id came from the caller — no ownership check, no rate
limit, no origin check. A draft holds whatever the form asks for: a name, an
address, a complaint, a medical history.

Reading it was an unauthenticated disclosure to anybody who knew or guessed an id,
and guessing was not hard, because a client that numbered its ids made every other
draft on that deployment readable. **Overwriting it is worse**: the person resumes
what they believe is their own form, does not re-read the fields they had already
filled in, and submits the substituted content under their own name. Nothing in
the submission, the audit log or the draft says the content was not theirs.

`POST /f/:path/drafts` now starts a draft and returns an id the caller did not
choose plus a token over it — HMAC over form and id, required in
`X-Formancy-Draft-Token` on both other routes, verified before the write and
before the lookup, compared in constant time. Stateless, the same shape the
proof-of-work challenge uses: no second table, and starting a draft stays a
read. A wrong token is answered exactly like a draft that is not there, so the
reply cannot be used to discover which ids exist
([0062](./docs/decisions/0062-a-draft-carries-its-own-key.md)).

**This is a breaking change to a published API and deliberately not softened.** A
compatibility window in which the old routes keep working is a window in which the
hole is open, and anybody relying on the old shape is relying on being able to read
other people's drafts. See [`MIGRATIONS.md`](./MIGRATIONS.md).

**The hazard analysis did not have this either.** `SAFETY-ANALYSIS.md` section C
had four entries and none was about drafts — C2 covers a *submission* read by
somebody not entitled to it, and a draft is not a submission and took a different
route with no check on it. C5 records the hazard, its constraint, and that the
document was missing it, because an analysis that misses a live hole is a worse
artefact than the code was.

Two residuals are recorded rather than fixed: the token does not expire, so a
leaked one is good until the draft is swept, and the draft routes still have no
rate limit of their own.


**Formatted text no longer looks double-spaced.** Nothing controlled the space
between paragraphs, so the browser's default `margin: 1em 0` applied: three short
paragraphs sat **36px apart on a 21px line**, a full blank line between each. It
reads as double spacing, and it makes pressing Enter once look like it inserted
two newlines — which is how it was reported. Now 28px, clearly a paragraph
break and not a blank line.

Set for the **editing surface and the read-only rendering together, in one rule**,
because the surface is meant to *be* the preview: if the two space paragraphs
differently then what somebody writes is not what they are shown afterwards.
`apps/docs/src/themes.test.ts` fails if a theme stops naming both parts in the same
rule, which is what keeps them equal by construction rather than by two numbers
somebody has to remember to keep in step. Lists get the same treatment, keeping
their indentation and losing their block margins.

The first version of this cancelled itself — the reset was written after the
sibling rule, same specificity, so paragraphs came out completely flush and two of
them were indistinguishable from one that had wrapped. Caught by measuring it in a
browser rather than by reading the CSS.


**Dropping a field on another field's side puts both in a row**, on the form
itself. The pointer route for what `w` already does in the arrangement pane, and
it calls the same command — the keyboard path is what satisfies WCAG 2.2
SC 2.5.7, and it existed first on purpose.

The side zones are the outer quarter of the element, capped at 64px so a wide
field does not get a 300px zone swallowing its middle, and they are only offered
on something **at least 80px wide**: a side zone on a narrow control is one nobody
can aim at. They are also not offered on a field already inside a row, where left
and right already mean "before" and "after" among its siblings — giving them a
second meaning would make the commonest drag there ambiguous.

**The gesture found a gap in the command it uses.** `wrapLayoutNodes` placed the
new container where the *earliest* node stood, which is right when nothing prefers
one — and wrong for a drop, where the row belongs where the thing dropped ON
was. Dragging a field out of a row onto a top-level field nested the new row inside
the old one. It now takes an optional position argument, kept separate from the
order of the addresses because the two are independent: dropping on the left makes
the dragged node the first child while the position still comes from the target,
which is the second address.

**The drop indicator on the form was never styled at all.** The arrange surface
sets `data-drop` on the rendered form's own elements and no stylesheet dressed
them, so a drag on the preview gave no indication of where anything would land. Now
in `workbench.css` rather than in a form theme — the indicator is an affordance
of the tool, a form's own theme should not have to know somebody is editing it, and
a form in production carries those attributes with nothing reading them. A side
drop draws down the side rather than across the edge, because the two gestures have
to be told apart before the drop and not after it.


**`w` puts two arrangement items side by side in a row**, which is the keyboard
route for the gesture the builder was missing. Press it on an item, choose what to
pair it with, and both go into a new row — the two-step shape the move command
already uses rather than a second idiom to learn. The focused item becomes the
first child, because a rule somebody can state beats an order that depends on
document position.

**Built before the pointer gesture, deliberately.** WCAG 2.2 SC 2.5.7 requires a
complete keyboard path for every drag operation, and a builder that grows one
afterwards never quite gets it. The side-edge drop comes next and will call the
same command.

Items it cannot legally pair with are left out of the list rather than offered and
refused afterwards: a container's own children and its own ancestors, since
`wrapLayoutNodes` will not wrap a node together with something inside it. An item
with nothing to pair with says so instead of opening an empty dialog.

**Escape now closes a dialog in the arrangement pane** — all three of them. It
was not handled for any, which left the Cancel button as the only way out, and
Escape is the first thing somebody tries. It is handled on the tree as well as on
the dialog, because pressing `w` leaves focus on the tree item and the dialog's own
handler never sees the key.


**`wrapLayoutNodes`: put several arrangement nodes inside a new container.** The
inverse of `unwrapLayoutNode`, and the command behind the gesture a builder is
expected to have and this one does not yet — dropping a field beside another
to make a row. Until now that took three steps and three undos: add a row, move
one field in, move the other.

Three decisions in it worth knowing:

- **The addresses need not be siblings.** The field being dragged is usually
  somewhere else entirely, so requiring siblings would rule out the gesture it
  exists for.
- **The children follow the order the addresses are given in**, not document
  order, because the side somebody drops on is what decides which field ends up
  on the left.
- **It is one command, so one gesture is one undo.** A gesture that takes three
  presses of undo to reverse is one people stop trusting.

The new container lands where the **earliest** address stood — its container as
well as its index, so wrapping a node that lives inside a row puts the new row in
there beside its siblings rather than at the top level. The first version of that
test assumed the top level and the implementation was right; the case now pins the
real behaviour and says why.

It refuses what would quietly invalidate the document rather than letting publish
catch it later: fewer than two nodes, the same node twice (spliced out once and
inserted twice places one field in two positions), a node together with something
inside it, a wrapper that is not a container, and an address that is not there.
Removal runs deepest-last so that taking one node out cannot invalidate the
address of another — the whole difficulty of editing a document whose nodes
have no keys.

The pointer gesture that uses it is still to come, and the keyboard route comes
first: WCAG 2.2 SC 2.5.7 needs a complete keyboard path for every drag, and a
builder that grows one afterwards never quite gets it.


**Files can be dropped on the field, and removing one can be undone.** The field
was an `<input type="file">` and a list: no drop zone, and removing an attachment
was a button with no way back.

Dropping is a **second** route rather than a replacement. It is a pointer gesture
with no keyboard equivalent, so the input stays exactly as it was, keeps the
field's label and ARIA wiring, and the region around it hands dropped files to
the same function the picker uses — two routes, one implementation. The drag
state is announced through `data-state`, and the themes change the border's
*style* as well as its colour so the state does not depend on seeing a hue.

A removed attachment keeps its row with an **Undo** beside it. It leaves the
answer immediately, so a submit in between is correct, and it goes back in the
position it came from rather than on the end — the order matters to somebody
who numbered their attachments in a covering note. The bytes are still in storage
until the unclaimed collector runs, so this costs nothing but the row, and a
misclick on the wrong row of six is the ordinary way somebody loses the evidence
they came to attach.

`apps/docs/src/themes.test.ts` earned its place immediately: it failed on
`file-dropzone` in all four themes on the first commit after it merged, which is
the invisible-control bug it was written for, caught before anybody saw it.

Per-file progress is still missing. Reporting it needs the `Uploader` interface to
emit it, which is a wider change than the control, and it is on the roadmap with
thumbnails and reordering.


**A file that uploaded is no longer thrown away because a later one failed.**
Both renderers collected a batch into an array and set the value once, so a
throw on the third of five discarded the two that had **already** uploaded:
their bytes were in storage, the submission never mentioned them, the unclaimed
collector reclaimed them within the day, and the person was told the upload
failed when half of it had not. Whose fault the failure is does not change who
loses the file.

Each file now succeeds or fails on its own. What reached storage is recorded
*before* the failure is reported, so nothing sits unclaimed while somebody reads
the message, and the message names the files that did not make it — "the
upload failed" over a list of five attachments does not say which one to try
again. Identical in both renderers, tested in both, and both tests fail when the
all-or-nothing behaviour is put back.


**The rich-text editor was invisible, and nothing said so.** The field grew a
mount point and an editing surface; no theme knew either name. A bare
`contenteditable` has no border, no padding and no height, so the control
rendered as nothing at all — the markup was there, every render test passed,
and the field could not be seen. Reported, not caught.

All four form themes now style it, by extending the selectors they already use
for `input`, `select` and `textarea` so each theme's own palette applies rather
than this change inventing colours per theme. The surface is named
`richtext-surface` by the renderers: the editor library mounts its
contenteditable as a CHILD of the mount point, so the child is the box a person
sees, and naming it ourselves keeps a theme from being coupled to TipTap's class
names.

`apps/docs/src/themes.test.ts` now derives every `data-formancy-part` the
renderers emit and fails when any form theme does not style it — with an
explicit, reasoned list of the wrappers that need no styling, and a check that
the list has not gone stale. It also checks that the editing surface has a
`min-height`, which is the specific reason the field was invisible rather than
merely unstyled. Form themes are told from the tool's own stylesheet by whether
they scope to `data-formancy-theme`, not by filename, so a new theme is covered
the moment it exists. Verified by putting the bug back: three cases fail.

**The site demonstrates the editor**, which it previously described without
showing — its bug-report example has a `richtext` field and was rendering the
textarea fallback. Its one rich-text test now asserts the safety property
directly (angle brackets stay characters) rather than through a preview that the
WYSIWYG surface replaces, and jsdom's missing layout APIs are stubbed in one
place with the reason, because ProseMirror asks for all three and jsdom has none.

**The toolbar stays when the editor is mounted.** The first version dropped it,
on the reasoning that the editor brings its own commands. It brings keyboard
shortcuts and no toolbar UI, so Bold was reachable with Ctrl+B and by no visible
control — worse than the `<textarea>` it replaced, and useless to anybody who
does not already know the shortcut.

One toolbar now drives either surface over the same `RichCommand` values, so the
two cannot come to offer different things: with the editor mounted a command runs
against the document, and without it the same command edits the markup as before.
Against the editor rather than the text, because with a WYSIWYG surface the
markers are not what somebody typed — inserting them would put literal
asterisks into the answer. The ARIA toolbar pattern is unchanged: one tab stop
for the row, arrows within it.

Wiring the toolbar exposed a second bug, in a browser and not in jsdom: **the
editor reverted its own change.** Pressing Bold updated the document and reported
the new answer, and for one render the form still held the old one — that
render pushed the old answer back, un-bolded the word and reported *that*. The
stored value went to `**hello**` and back to `hello` with nobody touching it. A
value arriving from elsewhere is no longer pushed into an editor that has focus:
losing what somebody just did is not recoverable, and a late sync is. Both
renderers, both tested, and the test fails when the guard is removed.

**The roadmap is honest again.** It listed the per-destination breaker, the
proof-of-work challenge and audit logging as missing; all three shipped. It now
also names the field types that are absent — `signature`, `datagrid`,
`qrcode`, `autocomplete`, `tagpicker`, `time`, `datetime`, `toggle` — with what
each actually costs rather than as a wish list, and prioritises formancy against
form.io and FormEngine feature by feature, including what is deliberately not
being copied.


**A real rich-text editor, and the stored answer does not change.** A `richtext`
answer was edited in a textarea, with a toolbar that inserted the grammar's own
markup and a live preview underneath. That taught the grammar, and it also meant
somebody filling in a public form saw `**bold**` and had to work out what the
asterisks were for — which, for the field type whose whole purpose is that the
writer sees the result, is close to not having the feature.

`@formancy/tiptap` is a TipTap editor **configured from the grammar**, so it
cannot produce anything the grammar cannot store. ProseMirror's document is JSON
rather than markup and its schema is closed by construction: the editor is built
from exactly six nodes and three marks, and there is no button, shortcut or
console call that puts a heading into it because the document model has no
heading. `StarterKit` was refused for that reason — one line, and six
constructs with nowhere to go. Nothing calls `getHTML`, no stored answer is ever
markup, and the rich-text field stays out of the stored-XSS class entirely
([0061](./docs/decisions/0061-tiptap-over-the-closed-grammar.md) revisits
[0052](./docs/decisions/0052-richtext-is-not-html.md), whose argument turned out
to be about HTML rather than about contenteditable).

**The host supplies it, and the textarea stays.** ProseMirror is larger than the
React renderer and most forms have no rich-text field, so the renderers take an
editor factory — the same shape the `file` field already uses for its uploader
— and fall back to the textarea and toolbar when there is none. That fallback
is not a degraded mode: the answer is still editable, still valid and still the
same grammar, and it remains the surface the conformance drivers drive, because a
`<textarea>` is a control every assistive technology already knows. A deployment
that wants neither pays for neither. Both renderers implement the identical
interface and both are tested against it, because what the *host* passes in is
the one thing a conformance driver structurally cannot see.

Two conversions in `@formancy/spec` do the work — `toEditorDoc` and
`fromEditorDoc`, pure functions between two JSON trees — plus
`serialiseRichText`, the counterpart `parseRichText` never needed until now.
Three things worth knowing about them:

- **Mark nesting is canonicalised, and this was the near-miss.** Marks are flat
  on a text node in an editor and nested in the grammar. Rebuilding them
  run-by-run is the obvious implementation, and it turns `**a *b* c**` into
  `**a***b*** c**` — same meaning, different string. An answer opened and saved
  without being touched would come back **rewritten**, which shows up as a
  spurious revision on every form somebody merely looked at. The longest adjacent
  stretch sharing a mark is grouped instead, which is what makes the round trip
  an equality rather than an equivalence.
- **Shapes the grammar cannot hold degrade rather than fail.** A list item with
  two paragraphs is joined with a space, a nested list is flattened into its
  parent, an unknown node becomes a paragraph and an unknown mark is dropped with
  its text kept. Every function is total: an editor that rejects a paste is worse
  than one that flattens it, because the person pasting cannot tell which part
  offended it.
- **The editor's output is untrusted.** It runs in the browser, so a document
  really does arrive carrying a `javascript:` href if one is put there —
  measured, not assumed. Two independent checks refuse it on the way out and the
  server re-parses the stored string regardless.
- **An empty answer is one empty paragraph, not an empty document.** A
  ProseMirror `doc` is `block+`, so a doc with no children is invalid rather than
  empty, and the editor built from one contained no `<p>` at all — no block for
  Enter to split, so newlines did nothing. It shipped to the playground and was
  reported as newlines not working. Now asserted against the editor's DOM,
  because with the fix reverted every value-level case still passes under jsdom
  and only the DOM assertion fails: a browser is stricter about an invalid
  document than jsdom is, which is why a green suite missed it.

The engine keeps owning the accessibility wiring: the ids and the
`aria-describedby` composition are passed to the editing surface rather than
invented on it, so the two renderers cannot drift in what they announce, and the
surface carries `aria-multiline` because a contenteditable without it is
announced as a single-line field. No manual screen-reader audit of the
contenteditable has been done, and the SOUP declaration says so — which is part
of why the textarea remains the default.

**formancy.ai tells search engines and link previews what it is.** The site
had a title and a description and nothing else: a shared link showed a bare
text card, and a crawler had no sitemap to start from. It now has:

- **A sitemap for the whole deployment.** `/sitemap.xml` is an index over the
  landing page and the playground and over the documentation's own sitemaps,
  and `/robots.txt` points at it. Both sitemap files are static, in
  `apps/site/public`. They were first written by `pnpm build:web`, and the live
  site 404'd on them because its deployment still ran the older shell
  one-liner, which never calls that script. `build:web` now checks the files
  instead: it fails if they no longer name the pages and the documentation
  sitemaps the build produced, or if the documentation built no sitemap at
  all, which Astro skips without a word when `site` is missing.
- **Link previews.** Open Graph and Twitter/X tags on the landing page and the
  playground, and a 1200×630 preview image the documentation uses as well.
- **Canonical URLs, a touch icon and structured data.** The landing page
  describes formancy as `SoftwareSourceCode` in JSON-LD: name, repository,
  licence, language. It carries no rating and no price, because there is
  nothing honest to put there.
- **A fix.** The colour-scheme hint was spelt `colour-scheme`, which no browser
  reads. It is `color-scheme` now.

**The SOUP declaration's composition table is now derived from the manifests.**
`docs/regulatory/SOUP-DECLARATION.md` is written for a manufacturer
incorporating formancy under IEC 62304, who builds their own dependency
assessment on that table. It had drifted three packages — `challenge`,
`builder-react` and `mcp` — and four dependencies: `server-core` acquired
`@noble/hashes` and `recheck` while the table still said "none", and `server`
grew `undici`. None of it was visible in a diff, because the table did not
change. The code did.

`apps/docs/src/soup.test.ts` now checks the table against every published
package's `package.json`, names and version ranges both, and fails on a row that
is missing, extra or stale. It also checks the claims the table's prose makes
about the repository: that the engine really has no third-party runtime
dependency, that a package with a peer says so, and that the version the
document characterises is the version the packages carry — because a
characterisation describes one version and no other. The same document's list of
things "not implemented in v0.1" had gone stale in the other direction: uploads,
webhook delivery, rate limiting and the challenge all exist now, which for a
pinned-version characterisation is a different statement, not a better one.

`apps/docs/src/counts.test.ts` does the same for the decision records: the
README said "Forty-eight" when there were sixty, and a spelled-out number
survives twelve additions because it does not read as a number. It now says
"the decision records" and carries no figure, and the test fails if one is put
back. It also holds the set's own rules — no gaps or repeats in the numbering,
and every record carrying a status, a date, a title matching its number, a
**Verified by** line and an entry in the index.

`docs/regulatory/LIFECYCLE.md` said 808 tests and 21 against PostgreSQL;
measured, 1,661 and 62. It now states a floor — "over 1,600" — with the
measurement and its date beside it, because an exact count there goes stale on
the next commit that adds a test, which happened twice while this line was being
corrected.

**`CLAUDE.md` gains the enforcement half of the documentation rule.** It already
said which documents a change must keep true; it now also says that a claim in
prose is backed by something that fails, in three shapes — derive it, check
it, measure it — and that a guard is watched to fail before it is trusted,
because guards are the tests most likely to be written green and to stay that way
for the wrong reason. Plus two things that were being carried in conversation
rather than in the repository: that a branch targets `main` and that a commit
pushed to an already-merged branch goes nowhere, which had stranded work three
times.

**The proof-of-work challenge hashes synchronously.** `@formancy/challenge` was
built on Web Crypto to keep it dependency-free. Measuring it killed that: a
hundred thousand hashes — the default ceiling — cost 269ms synchronously
against about 4,800ms through `crypto.subtle`, because every candidate pays an
await and a call boundary rather than the hash itself. The overhead fell on the
wrong person. An attacker writes the fast synchronous loop, so the only visitor
paying 18x was the one using the solver we published, and **a proof of work
where the defender pays more than the attacker is worse than none**. The hash is
`@noble/hashes` now: audited, no dependencies of its own, and already in the
tree for the canonical schema hash. `solveChallenge` stays asynchronous, but
only so it can yield to the event loop every `progressEvery` candidates — a
new option, because a page that freezes for three seconds was the other symptom.
The documented figure had been "around a tenth of a second"; it was 3,408 ms,
and the wrong number was hiding the design error rather than being a typo.


**Spec version 2.** Five constructs form.io has and formancy did not:
`selectboxes`, `file` and `richtext` field types, and `tabs` and `table` layout
kinds. Adding them is a version bump rather than a quiet addition, because the
version line answers "can I read this?" and the answer changes the moment the
format grows something a reader has never heard of
([0051](./docs/decisions/0051-spec-2-adds-types.md)).

Version 2 is a superset: it adds and removes nothing, so every version 1
document is a valid version 2 document, `upgradeSpecVersion` is one line, and a
1-to-2 diff is `compatible`. A version 2 construct inside a document declaring
version 1 is refused by name with the fix in the message. Going backwards is
refused rather than performed, because dropping what the newer version added is
data loss wearing the word "conversion".

- **`selectboxes`** — several answers from one list. A fieldset and a legend,
  like the radio group, because the relationship is the same one; the answer is
  stored in the options' own order, so two people who choose the same answers
  produce the same submission. Nothing ticked is `[]`, never null
  (see below) — an empty list is an answer, and treating it as the absence of
  one is the mistake every implementation makes first.
- **`file`** — attachments, now with a server behind them. The submission
  stores what each file is and where it went, never its bytes. `accept` and
  `maxFileSize` are enforced by the
  engine as well as by the picker, because a picker's filter means nothing to
  somebody posting to the endpoint directly. The renderers take an uploader
  from the host and say so plainly when there is none.
- **`richtext`** — formatted text, **stored as a small closed grammar rather
  than as HTML**. Parsed once into a typed tree and rendered as elements by
  both renderers, so there is no path from an answer to `innerHTML`, no
  sanitiser to keep correct forever, and a `javascript:` link renders as the
  text somebody typed ([0052](./docs/decisions/0052-richtext-is-not-html.md)).
- **`tabs`** — one panel at a time, the full ARIA pattern with a roving
  tabindex. Presentation, unlike pages: a field in a closed tab is still
  validated and still submitted, so a panel is hidden rather than unmounted and
  the strip opens the tab that focus lands in.
- **`table`** — a grid whose columns line up across rows, which stacked rows
  cannot do. Not a `<table>`: arranging fields in columns is not tabular data.

**File uploads work.** The `file` type shipped with a renderer and nowhere to
put bytes; the server now has somewhere. A file is **offered** before any bytes
exist, **stored** when they arrive, and **claimed** inside the submission's own
transaction — so a submission exists if and only if the files it names belong
to it, and two submissions naming the same file are adjudicated by the database
rather than by whichever check ran first. The field's `accept` list and size
limit are enforced at the offer, before a byte is sent, because a browser's
filter means nothing to somebody posting to the endpoint directly. Unclaimed
files are collected after a day, bytes first and the row second. Files come
back as authenticated attachments with `nosniff`, never inline
([0055](./docs/decisions/0055-files-are-claimed.md)).

Set `FORMANCY_FILES_DIR` to turn uploads on. Leaving it unset is a supported
state, not a misconfiguration: a form with a file field still renders and still
submits, and the field says plainly that there is nowhere to put one.

**A rule reading a list field now hides what it was told to hide.** An
untouched `selectboxes` or `file` field reached expressions as null rather than
as `[]`, so `'migration' in topics` was `in` against null: no overload, a
runtime failure, and a `visible` rule that fails is shown rather than hidden
([0022](./docs/decisions/0022-fail-open-fail-closed.md)). Every field whose
visibility depended on a tick was therefore visible until the first tick, which
reads as an inverted rule rather than a broken one. `LIST_VALUED_FIELD_TYPES`
now names the types whose answer is a list, in `@formancy/spec` rather than in
the engine, because two readers disagreeing about it disagree about whether a
form is showing a field.

**The conformance run audits accessibility, and it found a bug on its first
pass.** axe-core now runs on every mounted form and after every step that can
change the DOM — an error appearing, a row arriving, a page turning — which
are the states a hand-written audit never visits. The rule set lives in
`@formancy/conformance` rather than in a driver, because two renderers audited
against two rule sets are not held to one standard and both suites would stay
green while they drifted. The auditor itself belongs to the driver: the
published package stays framework-free, and a third party may certify with a
different tool.

The bug: a required `radio` or `selectboxes` group carried `aria-required` on
its `<fieldset>`. `role="group"` does not support that attribute, so assistive
technology ignored it — a required group said nothing about being required,
and the attribute was invalid ARIA besides. Requiredness for a grouped field is
now announced through the group's description, which the engine composes, and
is visible as well as announced. A required radio group never announced it at
all, which no test could have told you, because the wrong answer and no answer
look identical from the outside.

Two documents already described axe as running in the conformance suite. It
was not. That is the second time writing something down has been what found it
missing.

**The playground is a version 2 document, and works on a phone.** Two reports,
one cause each.

The rich text field could not be added, and neither could tick boxes or a file
field: the starter declared `specVersion: '1'`, so the builder refused all
three — correctly, because a version 1 document may not contain a version 2
construct — while the form's own intro claimed "every field type the spec
defines". The form advertised everything and the palette said no. The starter
is now version 2 and contains every field type except `group` and `page`, the
two that nest a form inside a form, with a `tabs` and a `table` arrangement
over them. A test enforces the claim against `FIELD_TYPES`, so the intro cannot
drift from the document again.

The playground also scrolled sideways on a phone — 528 pixels of it at 390
wide. The header was a flex row of six items that would not wrap, and a flex
item's default `min-width` is its content, so those six set a floor under the
whole document and the three-pane grid below never got a say. It wraps now, and
the strap line stands down on a narrow screen because the controls are what
somebody came for.

**The admin looks like the rest of formancy.ai.** It was the last piece still
dressed as a first draft: inline styles throughout, a sign-in form with no
styling at all, bare tables, and a schema preview rendered in no theme, which
looked like a broken page rather than like the form. It now shares the
playground's room — a dark bench, glass panels, the builder re-coloured
purely through `workbench.css`'s own variables — with a sign-in card, a form
list that marks the open form and its version, a segmented tab strip, a
"published" badge that turns teal once the server has the form, tables with
status pills for webhooks, empty states that say what to do next, and the
schema editor in the same Monaco theme as the playground. Every inline style
is gone; every text and role the tests rely on is unchanged.

On a narrow screen the form list becomes a bar across the top and the
builder's panes stack at useful heights. Two grids had no declared columns,
so their one implicit track took the width of the widest property row and the
workspace ran off a phone's screen; they shrink now.

**Four themes, and the two that existed look finished.** `@formancy/themes`
gains **Pop** — neo-brutalist: black outlines, hard offset shadows, choices as
chips, an error as a sticker, a submit button that presses in — and **Paper** —
editorial: a serif, spaced small capitals for labels, a line to write on
rather than a box, ruled lines under a long answer, sections numbered in
roman numerals and an introduction with a drop capital. With Blueprint and
Dusk that is four products that do not look related, over the same markup;
none of them needed a component changed.

Blueprint and Dusk were functional and plain. Both now draw their own
checkboxes, radios and select arrows instead of borrowing the platform's
(`appearance: none` changes how an input looks, not what it is), style the
file picker's button, set an introduction as a lead, and tell adding a row
from removing one. Blueprint numbers its wizard steps and rules its section
headings to the edge; Dusk's inputs were a shade off its ground and are now
wells that differ from whatever surface they sit on, its tabs are a segmented
pill, and its submit button glows.

Every theme now sets `box-sizing` on its own subtree. Without it, every
full-width control overflowed its column in any host page that had no reset of
its own — the playground and the site had one, which is why nobody saw it.

The landing page's live examples switch between all four, in place: one
attribute changes, nothing remounts, and what somebody typed stays typed. The
playground offers all four as well.

**The playground looks like the rest of formancy.ai, works on a phone, and
has a way back.** It is drawn in the landing page's colours now — a dark bench,
glass panes, violet for what you act on and teal for what the engine decided —
with the builder re-coloured purely through `workbench.css`'s own variables
and the JSON editor in a matching Monaco theme. The form keeps whichever theme
is chosen, on a sheet, because the themes are what is being shown. The header
leads back to the landing page, the way every page on the site starts.

On a desktop the three panes fill the screen and each scrolls on its own; the
page used to be 1,420 pixels tall on a 900-pixel screen, because a grid track's
default minimum is its content. Below 64rem the page shows one pane at a time
at its full height, chosen from a switch that sticks to the top, with the form
first. Stacked, each pane had been a 320-pixel box with a scrollbar of its own
inside a page with another — a form you could see four fields of at a time.

**Blueprint sets its own text colour.** Fields always did, but a form's title,
section headings and static text inherited the host page's colour, so a light
Blueprint form inside a dark app read as pale text on white paper. Dusk has
always set it; Blueprint does now.

**`validate_form` asks the engine, so it no longer calls a broken form
valid.** It ran the schema check and the expression check and not the engine's
own compile, which the server's publish gate runs between them — so a document
with a misspelled field name, a cycle between computed fields, or a checkbox
written as a condition on its own came back "Valid, and every expression
type-checks", and was then refused by the server and could not be opened by
any renderer. The builder's authoring loop had the same gap, so such a
document could land in the editor. `engineRefusal` in `@formancy/core` answers
the question by building an engine, not by re-implementing its checks, and
both now call it in the gate's order. Only the analysis of backtracking
`pattern`s stays on the server
([0056](./docs/decisions/0056-agents-get-the-checks.md) says why, and records
the drift it warned about).

The engine's refusals also say what to write instead. A checkbox used as a
condition — the most natural way to write "when the box is ticked" — is
refused because an untouched box is null, and the message now ends with
`write halfBoard == true` rather than "produces dyn". The expression package's
own hints, the decimal ones, used to be attached to the error and dropped by
the engine; they are carried through now.

**The spec reference keeps its link.** Its generator still wrote the old
root-absolute link to *Versioning*, so every docs build undid the fix
committed by hand — and `pnpm build:web` then refused to finish, because it
checks for exactly that link.

**The landing page, made to excite.** It still read as plain, and its one
example — a quote request — was the form nobody has ever wanted to fill in.
There are three now, behind a tab strip: a conference ticket that prices
itself, a bug report that asks more of a blocker, and a night in a mountain
hut. Beside each form is its document, generated from the schema so the two
cannot drift, and under that every rule lights up as the engine evaluates it —
read through `useField`, so it is the engine's answer rather than the page's.
Every example passes the same validator and expression check the MCP server
runs on an agent's document, and builds an engine; that last check exists
because a bare checkbox in a visibility rule passes the first two and then
takes the whole page down.

Around it: light drifting behind a fading grid, glass windows, a feature grid
whose cards catch a light that follows the pointer, and a section on coding
agents with the session played out line by line — including the real message
the MCP server sends back when a model writes `seats * 4`. The stack now lists
the packages that exist (`@formancy/themes`, not `ui-react`), and the readings
count agent tools and decision records, both checked, instead of a test count
nothing checked. Everything that moves animates `transform` or `opacity`, and
`prefers-reduced-motion` still removes all of it
([0053](./docs/decisions/0053-the-page-is-the-product.md) records what was
reversed and why).

**The landing page fills its frame.** Every section was reserving fifteen rems
of its right edge for the submission panel, which occupies one corner — so
two fifths of every screen sat empty the whole way down and the page read as a
draft. The hero is two columns now: the headline, and the document it is
talking about beside it. Under it, a strip of measured readings — one engine,
**zero** uses of `eval`, fifteen field types, 1,435 tests, 56 decision records
— because the audience has been told "blazing fast" before. Each figure is
checked: the zero by the CSP test that already existed, the field count against
`FIELD_TYPES`.

Display type is Archivo, a grotesque with a width axis set slightly narrow:
engineered rather than editorial. The stack stopped being rounded cards and
became a drawing, hairline-ruled, and every section heading now carries a rule
to the edge of the frame.

**The stack, in three dimensions.** formancy is a layer cake, so the landing
page draws one: the shared layers deep and carrying both accents, the two
per-framework layers near the reader and split violet from teal. Where the
product forks is now something you can see rather than read. It is an ordered
list of packages underneath — without 3D, without scroll timelines or with
motion turned off it is exactly that, because the geometry is a second reading
of the content and never the only one. Built with `timeline-scope` and
`animation-composition`, so the depth readout in the heading follows a list in
a different branch of the document and nothing needs a frame loop. The mark
from the favicon is now in the bar.

**A new form in the admin starts at version 2.** It started at version 1,
which meant a form created today could not be given tick boxes, a file field
or formatted text: the builder refuses a version 2 construct in a version 1
document, correctly, and offers to move it — a dead end nobody asked to be
in. The same mistake the playground's starter had.

**The admin is tested.** It was the least-covered part of the repo at 57% of
lines while being the part a self-hoster touches most: the workspace — four
tabs, publish, versions, submissions, the CSV export — had almost none. Now
86%, and every case is a thing that would have been silently wrong rather than
loudly broken: a publish reporting success it did not get, an edit lost on a
tab switch, a refusal swallowed. The uploader is at 100%, including the part
where the offer succeeds and the bytes do not land.

**Describe a form and get one, in the builder.** `PromptPane` takes an
instruction and produces a document — and it is not a box that pastes a
model's answer into the editor. `authorForm` parses the answer, validates it
against the spec and type-checks its expressions, and when any of that fails it
tells the model exactly what was wrong and asks again, up to three times.
Nothing reaches the document until it would work, so the outcomes are a valid
form or a refusal that says what was tried and what the model last said. It
lands as **one undoable step**: Ctrl+Z puts back what was there.

The model is the host's. `AskModel` is a prop, exactly as `Uploader` is a
provider: no vendor, no key, no network call in this package, and a self-hoster
can point it at something on their own hardware so nothing about a form leaves
their network. Without the prop the pane renders nothing, which is the honest
way to show a feature nobody has configured.

`session.replaceDocument` is new and is how a whole document arrives —
through the same validator every other command uses, so a session still cannot
come to hold something invalid.

**`@formancy/mcp`: formancy as tools for a coding agent.** Seven of them, over
the Model Context Protocol, installable in Claude Code or Cursor with
`claude mcp add formancy -- npx -y @formancy/mcp`.

The difference from wrapping a REST API in tool definitions is that **the tools
check before they act**. A model writing a form is a model writing logic, and a
wrong expression does not throw — it shows the wrong field to the wrong
person for a year. `publish_form` runs the document through `validateSchema`
and `expressionProblems` first and refuses to open a socket for one that would
not have worked, so the model is told `no such overload: double * int … write
4.0` instead of getting a 201 and a form that computes nothing.

Four tools need no server and no credentials at all, which makes authoring and
checking a whole form possible before anything is deployed
([0056](./docs/decisions/0056-agents-get-the-checks.md)).

**A rich text editor, not a box you type markers into.** The `richtext` field
has a toolbar now — Bold, Italic, Link, bulleted and numbered lists, with
Ctrl+B and Ctrl+I — and it toggles: pressing Bold on bold text takes it off,
whether the reader selected the word or the markers around it. The selection
survives the press, because an editor that drops the caret to the end after
every button is one nobody can use for a second word.

Still a textarea underneath, still no contenteditable, still no HTML. The
transformations are pure functions in `@formancy/spec`, so React and Angular
run the same code and a Bold button cannot mean two things; the toolbar is the
ARIA pattern with one tab stop and arrow keys, so it adds no stops between a
keyboard user and the box. It adds no dependency: an editor library would have
meant an HTML-first document model to keep restricted forever, formatting the
grammar cannot store, and — the actual blocker — Angular support that is
community-maintained and behind
([0052](./docs/decisions/0052-richtext-is-not-html.md) has the full reasoning).
A host that wants TipTap can still put it in through the component registry.

**A publish is one transaction.** It was three storage calls — create the
form when it is new, insert the version, point the form at it — and the
middle failure is the one that hurts: a form row whose `currentVersionId` is
still null resolves to nothing, so the form is in the list, answers its URL and
has no schema to render. `GET /f/:path` 404s for a form that is right there.

`publishVersion` does all of it in one commit, with the audit row inside, and
refuses to leave a version pointing at a form that is not there — an UPDATE
matching no rows is not an error in SQL, so the row count is checked. An
integration test asserts no form anywhere is left pointing at nothing.

Found by writing the audit log: recording a publish meant asking when a publish
is finished, and the answer was "after three calls that could stop in the
middle".

**The container was broken, and nothing noticed.** Adding `@formancy/challenge`
as a dependency did not add it to the Dockerfile's COPY list, so the image
built cleanly, passed every test, and exited on startup with
`ERR_MODULE_NOT_FOUND`. The build says nothing because the package is only
needed at runtime; the suite says nothing because it never ran the container.

Two guards now. `dockerfile.test.ts` derives the server's workspace dependency
closure from the manifests and fails if the COPY list has forgotten one — it
runs in milliseconds and names the package. And CI builds the image and runs
it, which catches what a static check cannot: a dependency needing a
postinstall, a file the runtime stage drops, a Node version that stops
resolving something.

**`@formancy/challenge`: the challenge scheme, in one isomorphic package.** It
is used in two places that cannot share server code — the server mints and
verifies, a browser solves — and a solver written separately would be a
second description of one protocol. The day the two disagreed, the symptom
would be submissions the server rejects for no visible reason, which reads as
an attack rather than as a bug.

So it is one module running in both places, and `@formancy/server-core`
re-exports it rather than restating it. The hash is `@noble/hashes` and
synchronous, which was a correction: `crypto.subtle` needs nothing from npm,
but a hundred thousand hashes cost 269ms synchronously against about 4,800ms
through it, and the only person paying that 18x is the visitor using the
solver we published — a proof of work where the defender pays more than the
attacker is worse than none. `solveChallenge` takes an optional progress
callback and yields every `progressEvery` candidates so a page does not
freeze; the advice is still a Web Worker. Spent challenges are swept hourly, on their own
timer rather than the file collector's, because the two are configured
independently.

**A proof-of-work challenge for anonymous submissions, and no third party in
it.** Turnstile and reCAPTCHA round-trip every visitor through somebody else's
service before that visitor may speak to a form — which, for a self-hosted
deployment, turns a form on your own server into a data transfer to a third
party on every visit, whether or not anybody submits. A Tor or VPN user gets a
puzzle or a refusal on the strength of their address, with no override.

So the default is arithmetic the browser does by itself. The server publishes
`sha256(salt + number)` and signs it with its own key; the browser searches for
the number. Verification recomputes the hash and checks the signature, so a
challenge nobody minted cannot be solved into a valid one, and the expiry rides
in the salt so a stale one costs nothing to refuse.

Spending is separate and storage-backed, because a correct solution stays
correct: `spent_challenges` has the challenge as its primary key and the insert
is the claim, so two requests racing one solution are adjudicated by the
database rather than by whichever check ran first. There is an integration test
that races them.

Set `FORMANCY_CHALLENGE_SECRET` to turn it on. Unset is supported: a deployment
whose forms all need a session has no anonymous surface, and the challenge
route says 404 rather than failing. Signed-in submitters are never asked
([0059](./docs/decisions/0059-proof-of-work-not-a-captcha.md)).

**The admin has a Webhooks tab.** Which destinations are failing, since when,
and what died on the way to them — with a button to send a dead delivery
again. This is the reason the breaker's counters live on the webhook row rather
than in the worker's memory: a self-hoster has no operations team watching a
dashboard, so the answer has to be in the product. Until now it was only
reachable with curl.

The state is a word rather than a colour ("Working", "Trying again", "Not
delivering"), the pane does not poll — an operator looking at a failure wants
it to hold still — and a replayed row is marked rather than removed, because
a list that shrinks as you work leaves you unsure which one you pressed.

**A circuit breaker per webhook, and dead deliveries you can replay.** The
retry schedule gave up after eight attempts per DELIVERY, which is the wrong
unit when the destination is down: a form taking a submission a minute produced
a minute's worth of deliveries, each independently trying eight times against an
endpoint that had been returning 502 since Tuesday.

Three consecutive failures now open the breaker — not one, because a single
failure is a deploy or a restart. Five minutes later exactly one delivery goes
through as a probe: it succeeds and the breaker closes, it fails and the
cool-down starts again. Being skipped does not cost a delivery an attempt.

The counters live on the webhook row rather than in the worker, because a
self-hoster has no operations team watching a dashboard and memory does not
survive a restart. `GET /webhooks` says which destinations are failing and since
when, without the signing secret. `GET /deliveries/dead` says what died and why,
without the body — that is the submission in another coat.
`POST /deliveries/:id/replay` puts one back with its attempts reset, refuses
anything not actually dead, and is audited, because it sends data to a third
party on somebody's say-so
([0058](./docs/decisions/0058-a-breaker-per-destination.md)).

**Audit logging.** Who did what, to which thing, and when — written
append-only, and enforced there by a trigger rather than by application
discipline, because the one moment it matters is the moment somebody has a
reason to edit it.

Two things it does that the usual audit log does not. It records **reads**:
`submission.read` and `submission.exported` alongside `submission.created`, so
"who downloaded four thousand people's answers" is answerable — which is the
question actually asked and the one a mutation-only log is silent about. And it
records **failed logins**, because a hundred failures then one success is the
shape of an attack and recording only the success hides it.

It never contains the data. `detail` carries identifiers and counts, and there
is a test asserting the submitted values appear nowhere in the row that
describes them — an audit log is read by more people and kept longer than the
data it describes, so answers inside it are a second copy of the thing being
protected.

The row joins the submission's own transaction, so a submission that rolled
back leaves nothing saying it happened. Reads and publishes are appended after
the fact, for two different reasons, and
[0057](./docs/decisions/0057-the-audit-log-records-reads.md) says which and
why rather than leaving it to be discovered. `GET /audit` reads it back;
reading is deliberately not itself audited.

**The documentation is deployed, and describes what actually shipped.** The
landing page's footer has linked to `/docs` since the page existed, and nothing
ever built the docs site into the deployment — the link has been dead in
production the whole time. `pnpm build:web` now composes three apps rather than
two, and the docs are built with `base: '/docs'` so their asset URLs and
navigation point at themselves.

Three things that had shipped with no documentation at all now have some:
`@formancy/mcp` (a quickstart of its own), file uploads on both sides — the
renderer's `UploaderProvider` and the server's `FORMANCY_FILES_DIR` — and the
rich text field's toolbar. The sidebar also stopped calling the spec reference
"v0"; it has been v2 for a while.

Two guards went in with it, because both failures are silent. The build refuses
to finish if a nested app's assets point outside its own base, and it refuses
if a Markdown link is root-absolute without `/docs/` — which builds cleanly
and 404s against the landing page. The second one caught a link on its first
run.

**The website deploys as one static site.** The landing page at `/` and the
playground at `/playground/`, built by `pnpm build:web`. The playground is
built with `base: '/playground/'`, without which Vite's absolute asset URLs
point at the site's asset directory instead of its own — the page loads, the
script 404s, and the deployment is a blank screen while the build log says
everything succeeded. The build script reads the built HTML back and refuses
to finish if that has happened, because a check that only runs when somebody
remembers to look is not a check. The site also has a favicon now; it had been
asking for one that was never there.

**The website.** `apps/site` is formancy.ai, and the form halfway down it is a
real document handed to `@formancy/react` rather than a screenshot
([0053](./docs/decisions/0053-the-page-is-the-product.md)). It exercises every
type spec 2 added — `selectboxes`, `richtext` and `file`, arranged in `tabs`
over a `table` — which is how the list-field bug above was found. Its file
field uploads nowhere and says so in the storage key, because the page is
static and a demo that looks like it stored something makes the product look
like it silently drops files. The playground is one click away from the bar,
from the demo and from the end of the page.

### Fixed

- Deleting or renaming a field that a layout placed was refused outright, so a
  field could not be changed at all once it had been arranged.
- The Angular rich-text component recursed through its own selector without
  importing itself, which Angular renders as an empty custom element and does
  not report.
- `newFieldOfType` produced choice fields with no options — a control nobody
  can answer.

- **An expression that compiles and then never works is refused at publish.**
  `seats * 4` on a `number` field computed nothing — not an error, nothing —
  for every value anybody typed, with no signal in the builder, at publish or
  at runtime. Two correct decisions produced it: leaves are declared `dyn` so
  that a half-typed answer is not a type error, and a computed rule that fails
  writes nothing so that a half-filled input keeps its previous value. CEL is
  strongly typed at runtime and a JSON number is a double, so `double * int`
  has no overload and the engine cannot tell "not ready yet" from "never will
  be".

  `expressionProblems(schema)` re-checks each rule with leaves declared as the
  model says and reports the failures strictness is reliably right about — and
  only those, because a check that refuses a valid form is worse than the
  silence it replaces. It runs at publish, not at render, so a form already out
  there keeps opening for whoever is filling it in.
  ([0054](./docs/decisions/0054-expressions-that-never-work.md)).

Four packages reach npm for the first time: `@formancy/builder-react` — the embeddable
builder, and the package a prospective adopter most wants to see — along with
`@formancy/challenge`, `@formancy/mcp` and `@formancy/tiptap`. The server image is
published and signed by digest for the first time as well; `v0.1.0` predated those steps,
so there is no `v0.1.0` image.

- The homepage introduces the editor with a real interactive form preview:
  add a field, change its theme and check answers without sending them. A
  responsive product walkthrough and illuminated 3D treatment keep the editor
  in focus; reduced-motion preferences disable the movement.

- The homepage and README highlight six product strengths, including keyboard
  access and automated accessibility checks, with the limits of WCAG claims
  stated explicitly.

- The homepage uses a wider content area on large screens while keeping
  paragraph lengths bounded for readability.

- The homepage and README now introduce formancy as a visual form builder for
  Angular and React, link directly to the editor, and explain features through their use
  in a form. Search and sharing descriptions use the same product description.

### What 0.2.0 knowingly does not have

`RELEASING.md` asks a release entry to say this, because the absence a reader discovers
for themselves is the one that costs them a day.

- **No submission token bound to the form version.** This is the gap that keeps the
  public plane off a public deployment. Everything else guarding it — the origin
  allowlist, the rate limits, the proof-of-work challenge, the body cap — is in place.
- **The server writes no log at all.** Fastify is constructed with the logger off, so no
  submission content can reach one and nothing will tell an operator why a request
  failed. The audit log records mutations, including submission reads, and is all there
  is. A deployment that adds a logger owns the redaction question alone.
- **The rate limiter's store is per process**, so it is wrong behind more than one
  replica. Documented rather than fixed.
- **No virus scanning, no resumable or multipart uploads, and no presigned uploads.**
  Bytes still pass through the server, so the request body cap is the ceiling on a file.
- **`signature`, a many-answer tag picker and async validators are spec 3**, now that
  version 2 is frozen. None of them is reserved ahead of use.
- **No manual screen-reader audit and no VPAT.** The accessibility claim rests on
  automated checking, which catches roughly 57% of machine-detectable issues.
- **Appearance is reviewed, not verified.** jsdom implements no layout, and no
  application in this repository renders the Angular bindings in a browser at all.
- **Nothing verifies a release after it is published.** Every gate runs inside the
  workflow that publishes, against the tree it built from.

## [0.1.0] — 2026-09-20

The first release. **Spec version: `"1"` (frozen).**

### Read this first

The *spec* is frozen; the *packages* are not. A form document written today
keeps working, and the submissions stored against it keep their shape. The
package APIs are pre-alpha and will change before 1.0.

The packages are **on npm** under the
[`@formancy`](https://www.npmjs.com/org/formancy) scope: `@formancy/spec`, `@formancy/expressions`, `@formancy/core`,
`@formancy/react`, `@formancy/angular`, `@formancy/conformance`,
`@formancy/builder-core`, `@formancy/server-core`, `@formancy/server` and
`@formancy/themes`. Each was
published from CI with a SLSA v1 provenance attestation, so `npm audit
signatures` can say which workflow run and which commit built the tarball you
installed.

`@formancy/builder-react` is not among them. It was written after this release
was cut and lands in the next one; clone the repository to use the builder
today.

Do not deploy the server anywhere public. It has authentication, role-based
authorization, a fail-closed access gate on anonymous submission, per-IP rate
limiting and a request body cap — but no challenge, no submission tokens and no
audit logging. The route comments say so too.

### What it does

A form is a JSON document. An engine evaluates it — visibility, requiredness,
calculations, validation — and the **same compiled engine runs in the browser
and on the server**, so the two cannot disagree about whether a submission is
valid. Renderers for React and Angular bind to it natively and emit your markup,
not ours.

### The spec, version 1

Frozen on 2026-09-20. It shipped as `"0"` and unstable first, because three
things about the model turned out to be undiscoverable without a renderer and a
server actually using it. All three now have answers:

- **A hidden field's answer.** `clearOnHide`, defaulting to true, decides
  whether it is pruned — and the server applies its own reading, so a client
  cannot smuggle data into a branch the person could not see.
- **A repeating-group row's identity.** Each row carries `_id`, minted by the
  engine, in the data. Position was never an identity: removing a row renumbers
  everything after it. `_id` is reserved and no field may use it.
- **Where a validation check runs.** `runsOn: 'both' | 'client' | 'server'` on a
  validate rule. Metadata rules may not set it, because a visibility rule that
  differed between the two sides would leave the server unable to check what the
  browser did.

**Twelve field types:** `text`, `textarea`, `number`, `checkbox`, `select`,
`radio`, `date`, `hidden`, `static`, `group`, `page`, `repeater` — all twelve
rendered, and all editable in the builder. Deferred type
names are reserved, so adding `file` or `datetime` later is a compatible change.

**Five rule kinds**, all written in CEL: `visible`, `disabled`, `required`,
`computed`, `validate`.

**Validators:** `required`, `min`/`max`, `minLength`/`maxLength`, `pattern`
(anchored), and a closed format list — `email`, `url`, `uuid`.

**Layouts render.** `layouts` places fields side by side, in sections, in an
arrangement that is not model order — and both renderers do it identically. The
DOM order is the layout's declared order and the stylesheet places by source
order alone, so reading order, tab order and visual order cannot come apart
(WCAG 1.3.2, 2.4.3); a row reflows to one column with a media query rather than
a measurement (1.4.10); a row carries no semantics and a labelled section is a
real `group` (1.3.1).

**Optional sections:** `i18n` for message catalogues, so any text a person reads
can be `{ "$t": "some.id" }` instead of a literal; and `layouts`, for named
arrangements of one model. A form using neither behaves exactly as if neither
existed.

### Packages

| Package | What it is |
|---|---|
| `@formancy/spec` | Types, JSON Schema, canonical hash, `diffSchemas`, validation |
| `@formancy/expressions` | CEL, behind our own facade, with the safety policy |
| `@formancy/core` | The engine. No framework, no DOM, no Node |
| `@formancy/react` | React 19 bindings, via `useSyncExternalStore` |
| `@formancy/angular` | Angular 22 bindings, zoneless and signal-based |
| `@formancy/conformance` | The behavioural suite, published so others can self-certify |
| `@formancy/builder-core` | Headless schema editing: commands, undo/redo, legality |
| `@formancy/builder-react` | The builder UI: structure tree, field palette, property panel, logic authoring. Keyboard-first, no drag surface |
| `@formancy/server-core` | Use cases, framework-free |
| `@formancy/server` | Fastify routes, PostgreSQL, auth runtime |
| `@formancy/themes` | Two reference form themes, plus the workbench chrome for the tools. Nothing depends on them |

### Engine

- Dependencies are extracted statically from each expression's AST, so a form
  that could loop is **refused when it is saved**, with the cycle named, rather
  than discovered by somebody filling it in.
- The clock and randomness are injected and frozen per pass. The engine never
  reads an ambient `Date.now()`, which is what makes the server's replay a check
  rather than a second opinion.
- Snapshots are identity-stable, so React needs no memoisation and Angular's
  `OnPush` sees the change.
- The engine owns element ids and ARIA composition, so both renderers wire
  accessibility identically and the `useId` hydration-mismatch class of bug does
  not exist here.
- Metadata expressions fail **open**, validation expressions fail **closed**. A
  broken visibility rule shows the field; a broken check rejects the submission.
- **No `eval` and no dynamic function construction anywhere**, so formancy runs
  under a strict Content-Security-Policy with no configuration.

### Renderers

React and Angular pass the **same conformance fixtures with no
framework-specific skips**. Neither ships a CSS file. Styling attaches to
`data-formancy-part` and `data-state`.

Two reference themes — Blueprint (light, technical) and Dusk (dark, rounded) —
are deliberately different design languages rather than two palettes. The
playground switches between them to demonstrate that the renderers emit no
styling of their own. If either theme had needed a component change, the claim
would be false.

### Server

Twelve endpoints across two planes. The public plane is unauthenticated by
opt-in; the management plane requires a session or an API key and runs
`can(actor, action, resource)` on every route.

- A submission is replayed server-side against the exact version the client
  rendered. Every computed value is recomputed and **overwritten**; visibility
  and requiredness are recomputed; hidden branches are stripped. What is stored
  is the canonical result, not the request body.
- Published versions are immutable, enforced by a **database trigger** rather
  than application code, so it holds for every path into the database.
- A submission binds to its version by foreign key *and* by schema hash — one
  for joins, one for tamper evidence.
- Drafts migrate lazily on resume, driven by diff severity. Answers belonging to
  removed fields move to `data.__orphaned` and are never deleted. **Submissions
  never migrate.**
- Login is enumeration-resistant: a missing user costs the same argon2
  verification as a wrong password.
- A form is **private until opened**. `PUT /f/:path/access` turns on anonymous
  submission and optionally pins an origin allowlist, which is matched exactly
  — a missing `Origin` is refused, and an empty allowlist allows nothing rather
  than everything. Access is a property of the deployment rather than of the
  form document, so exporting a form cannot carry "anyone may submit this"
  across a boundary where it is wrong.
- The public submission route is **rate limited per IP** — 30 a minute by
  default — and counts attempts rather than successes, so a refused request
  still costs an attacker their budget. Login is limited to 10 a minute, which
  matters because enumeration resistance makes each wrong guess cost a full
  argon2 verification. Requests are capped at 256 kB before the JSON parser
  sees them.
- Every `pattern` is checked for catastrophic backtracking at publish time and
  a vulnerable one is refused — a form author's regular expression is run by
  the server against submitted text, and it cannot be timed out once started.
  The check found a polynomial case in formancy's own email format the first
  time it ran.
- CSV export unions columns across every version a form has had, and neutralises
  spreadsheet formulas — type-aware, so a numeric `-5` stays `-5`.
- **Webhooks** are queued by the same transaction that stores the submission,
  so a delivery exists if and only if the submission does. Delivery resolves
  the hostname itself, refuses if any returned address is private, and connects
  to the address it checked through a pinned agent — "validate the URL then
  fetch it" is defeated by DNS rebinding, since the two lookups are
  independent. Redirects are not followed, the response is capped at 64 kB and
  never interpreted, and the signature is Stripe's scheme so receivers can use
  code they already have.
- **The outbox is drained** by a five-second polling worker in the server
  process — no queue library, no second container. Retries are exponential with
  full jitter over eight attempts, and a delivery that runs out of them is
  marked dead rather than deleted, because the row is the evidence that
  something was supposed to be sent and never arrived. It is **not** a
  distributed queue: run exactly one replica, or a delivery goes out twice.
  Plain http and private addresses are each opt-in per deployment
  (`FORMANCY_WEBHOOK_ALLOW_HTTP`, `FORMANCY_WEBHOOK_ALLOW_PRIVATE`) for a
  receiver on a trusted network — per deployment, never per form, since a form
  author is exactly who the address guard defends against.

### The arrangement editor

- **Rows, columns and sections are authorable**, which is how two fields end up
  side by side. Renderable since the layout work landed, and until now editable
  only as JSON.
- **Two views of one document.** A separate arrangement tree beside the
  structure tree — the model says what a form collects, the arrangement says
  where it appears, and a field can be in one without the other — and the
  **rendered form itself is a drop target**. Both go through the same session
  command, so they cannot disagree.
- **Keyboard first, again.** Add, move, unwrap and remove all work with no
  pointer, and the move palette reads destinations as sentences: *"Row with
  First name and Last name, between First name and Last name"*. Dragging came
  afterwards, in all three places.
- **The renderer knows nothing about any of it.** It emits two inert
  attributes; the builder reads them from the outside. Nothing in
  `@formancy/react` imports anything from `@formancy/builder-react`.
- **Fields the arrangement leaves out are named**, because a field the only
  layout omits is collected by the form and invisible to everyone filling it in.
- **Deleting or renaming a field now keeps every layout in step.** Both were
  refused outright before — a layout node pointing at a field that does not
  exist is invalid — so a field could not be deleted or renamed at all once it
  had been arranged.

### Applications

- **Admin** — the builder in a three-pane inspector with live preview, plus a
  raw schema editor, publish, version history, submissions and CSV export. The
  left pane switches between the form's **structure** and its **arrangement**.
- **Playground** — schema *or* the builder on the left, the live form in the
  middle, the engine's actual state on the right. Under Build, *Fields* and
  *Arrangement* are two views of one document, and the form in the middle is a
  drop target for the second. A theme switcher that proves the renderers ship
  no CSS, and a language switcher over a demo form written in `$t` references
  with a deliberately partial French catalogue, so the fallback to the default
  locale is visible rather than claimed. A link to the repository, since this
  page is where most people meet the project.
- **Docs** — Astro Starlight; the spec reference is generated from the JSON
  Schema.

### Verification

- **808 automated tests** across eight packages, plus **21 integration tests**
  against a real PostgreSQL instance via Testcontainers.
- One conformance suite, executed against the engine in Node, the engine in a
  browser, both renderers, and the server.
- Conformance drivers may find elements **only by role and accessible name** —
  never a test id, never a CSS selector. A renderer whose markup a screen reader
  cannot navigate fails the suite.
- axe-core after every mount and every DOM-mutating change.
- Property-based invariants over hide/unhide, repeater identity and evaluation
  order.
- The official CEL corpus, with results pinned: **586 of 704 in-scope cases
  pass**. The 118 failures are enumerated in
  `packages/expressions/CEL-CONFORMANCE.md` rather than averaged into a
  percentage.
- Performance, measured: keystroke on a large conditional form **≈0.38 ms**
  against a 1 ms budget; cold graph compile **≈1.7 ms** against 30 ms.

### Supply chain

Releases are cut by a GitHub Actions workflow and nowhere else, because
provenance is a statement *by GitHub* about which workflow produced a tarball —
a release built on a laptop cannot carry one.

- **npm provenance** via OIDC, so every tarball is bound to the workflow run,
  commit and repository that built it. Check it with `npm audit signatures`.
  There is no private key, so there is none to leak.
- **A CycloneDX SBOM** attached to each GitHub release, describing what ships
  rather than the workbench, and **signed with cosign** keylessly.
- **Licence enforcement.** Apache-2.0 requires the licence and NOTICE to travel
  with the work. Both are copied into every package at build time and the
  release refuses to publish a tarball missing either.
- **Version agreement.** A tag that disagrees with the manifests fails the
  release rather than publishing the wrong version under the right name.

See [`RELEASING.md`](./RELEASING.md).

### Known limitations

Named rather than implied.

**Not built yet.** Conditions combining more than one comparison; file upload;
a per-action circuit breaker and dead-letter replay from the admin, so a
receiver that has been down for a day is retried on the same schedule as one
that failed once and re-queueing a dead delivery is a SQL statement; a
proof-of-work challenge on the public plane, which the rate limit and the
origin allowlist stand in for; multi-tenancy; a published container
image — one builds locally from `docker compose up`, but nothing is pushed to a
registry or signed.

**Known gaps.**

- 118 CEL specification cases fail. If your forms use expressions, read
  `CEL-CONFORMANCE.md` rather than this summary.
- A `pattern` that `recheck` cannot decide about is accepted rather than
  refused, and patterns published before the gate existed were never analysed.
- `@fastify/rate-limit`'s default store is per-process and therefore wrong
  behind more than one replica. The outbox worker has the same constraint for a
  different reason — `claimDueDeliveries` takes no row lock — so more than one
  replica delivers every webhook more than once.
- A `visible` rule that fails at runtime shows the field. That is deliberate,
  but it means a form whose visibility rules are quietly failing looks as though
  it is working.
- No manual screen-reader audit and no published VPAT. Automated checking
  catches roughly 57% of machine-detectable issues, and about 30% of WCAG 2.2
  criteria are machine-testable at all.
- Async validators do not exist. They need a new rule kind, which is a spec 2
  change; `runsOn` is already in place so that change is additive.
- The container image is neither published nor signed, because no registry has
  been chosen. It builds locally from `docker compose up`. The npm side of the
  release pipeline has run: provenance attestations and a cosign-signed
  CycloneDX SBOM went out with `0.1.0`.
- `@formancy/builder-react` missed the release. It was written after `0.1.0`
  was cut, so the builder is reachable only by cloning.

### Getting it

```bash
npm install @formancy/react @formancy/core @formancy/spec   # or @formancy/angular
npm audit signatures                                        # check the provenance
```

Or from source, which is the only way to get the builder for now:

```bash
git clone <this repository> && cd formancy.ai
pnpm install && pnpm build && pnpm test

docker compose up -d                     # PostgreSQL on :5439
pnpm --filter @formancy/server dev       # API on :4380
pnpm --filter @formancy/admin dev        # admin on :4382
pnpm --filter @formancy/playground dev   # playground on :4381
```

Requires Node 22.12 or newer, pnpm via `corepack enable pnpm`, and Docker.

### Documentation

- [Architecture](./docs/README.md#architecture) — arc42, twelve documents
- [Decision records](./docs/decisions/) — 43, each naming what fails if the
  decision is violated, or saying plainly that nothing does
- [Regulatory](./docs/regulatory/MDR-CONTEXT.md) — for anyone incorporating
  formancy into a product that answers to a regulator. formancy is not a medical
  device and claims no conformity

### Licence

Apache-2.0, every package, no dual licensing.
