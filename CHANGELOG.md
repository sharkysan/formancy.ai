# Changelog

All notable changes to formancy. Every package moves on one version number; the
spec version inside a form document is a separate line, and a change to it is
called out explicitly. See [`MIGRATIONS.md`](./MIGRATIONS.md).

Loosely [Keep a Changelog](https://keepachangelog.com), with reasons attached —
a line that says only *what* changed is rarely the line you need six months
later.

## Unreleased

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

The engine keeps owning the accessibility wiring: the ids and the
`aria-describedby` composition are passed to the editing surface rather than
invented on it, so the two renderers cannot drift in what they announce, and the
surface carries `aria-multiline` because a contenteditable without it is
announced as a single-line field. No manual screen-reader audit of the
contenteditable has been done, and the SOUP declaration says so — which is part
of why the textarea remains the default.


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
