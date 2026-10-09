# Changelog

All notable changes to formancy. Every package moves on one version number; the
spec version inside a form document is a separate line, and a change to it is
called out explicitly. See [`MIGRATIONS.md`](./MIGRATIONS.md).

Loosely [Keep a Changelog](https://keepachangelog.com), with reasons attached —
a line that says only *what* changed is rarely the line you need six months
later.

## Unreleased

**Fixed: a `.txt` or `.json` file could not be attached — its upload was refused as
`no_body`.** Fastify parses `text/plain` and `application/json` bodies itself, and the server's
catch-all byte parser only ever saw the types with no parser of their own, so those two reached
the upload route as a string or an object whatever the form's `accept` list allowed, and a
`.json` file that was not valid JSON was refused before the route ran. The upload route now has
a Fastify context of its own whose only parser hands any body over as bytes, and a text, JSON or
empty file is kept byte for byte — tested on PostgreSQL, failing first. The same move takes the
catch-all off every other route, which keeps Fastify's JSON and text parsers: a body of any
other type is answered 415 there, where it used to be read as raw bytes up to the file ceiling
rather than the request body cap. A submission sent as `application/octet-stream` is the case
the tests hold.

**Fixed: an upload's offer accepted a size that is not a whole number of bytes.** A fractional
size reached the `integer` column and failed there as a 500 that named the query; a negative one
was stored, and no upload could ever match it. Both are refused with 400 `invalid_request`
before a row is written. Zero is a size.

**Changed: `FORMANCY_MAX_FILE_BYTES` must be a whole number from 1 to 2147483647, or the server
does not start.** That is the most `files.size`, a PostgreSQL `integer`, can record: a larger
ceiling let an offer through the route and failed it at the insert, and a fractional one passed
the old check. `createApp` refuses a `maxFileBytes` outside the same range, for a deployment that
embeds the server. The rule lives in the new `upload-settings.ts`, and a test reads the column's
precision from the database, so the ceiling cannot outlive the column.

**Fixed: a slow upload could take an accepted submission's attachment away from it**, in every
release since uploads arrived in 0.2.0. The `PUT` that receives a file's bytes wrote the row
back as it had read it before the write — and, from 0.4.0 with a scanner, before the scan:
`stored`, with no submission. A second `PUT` for the same file, sent while the first was still
being scanned or written, could be stored and claimed by a submission first; the first then put
the claimed row back to unclaimed — for the collector to delete a day later — and wrote its
bytes over the ones the submission was accepted with. The supplied clients never send that
second `PUT`: the file field's **Try again** runs the uploader again, and the admin's uploader
offers the file anew, under a new id, every time. It comes from a proxy or HTTP library
retrying the request, an integrator's uploader that sends the bytes again without offering
again, or whoever holds the file's id, on purpose. Reproduced on real PostgreSQL against
0.4.0's route, with a scanner held open and, without one, with the write held open. One request
at a time now receives a file's bytes: it holds a two-minute lease on the row, a second request
is answered **`409 busy`** before its bytes are scanned, the lease is checked again before the
write, and the row is settled only while the file is still offered and the lease is still that
request's. A refusal by the scanner gives the lease back before it replies, so the same file
sent again is not busy, and a release that fails does not replace the reply. What this does
not close: a request whose scan and write together outlast the lease can
still replace the bytes, though never the row — and the supplied clamd adapter does not prevent
it, because its 30-second timeout is for silence on the connection, not for the whole scan.
Nothing records that it happened beyond the `409` that request is answered with, and a test
asserts it so that closing it is deliberate
([0153](docs/decisions/0153-a-file-is-received-by-one-request-at-a-time.md), B10 in
[`SAFETY-ANALYSIS.md`](docs/regulatory/SAFETY-ANALYSIS.md)).

**Breaking, for anybody implementing `Storage` themselves: `updateFile` is replaced by
`leaseFile`, `settleFile` and `releaseFile`, and `FileRecord` carries `receivingUntil`.** Each
new method is one conditional write that answers whether it matched, as `spendChallenge` does.
`updateFile` set the row from whatever its caller held, which was the defect above, and a port
offering such a write invites the next caller to repeat it. `@formancy/server`'s PostgreSQL
storage adds the nullable `receiving_until` column to `files` on start; there is nothing to run.
What each method must do, and why, is in [`MIGRATIONS.md`](MIGRATIONS.md).

**Fixed: the object store could not be used through either compose file — the server
restart-looped.** Both files passed `FORMANCY_FILES_DIR` to the server as a literal path, so
a deployment that set the `FORMANCY_S3_*` variables as `.env.example` says handed the server
two stores, and it refused them — `Set FORMANCY_FILES_DIR or FORMANCY_S3_ENDPOINT, not both`
— on every restart; measured with the published `v0.4.0` image, and the same in every
release since `0.2.0`. The files now read `${FORMANCY_FILES_DIR-/var/lib/formancy/files}`,
so `.env` can blank the directory, and the object-store block of `.env.example` does, with
`FORMANCY_FILES_DIR=""`. **The server reads an empty `FORMANCY_FILES_DIR` or
`FORMANCY_S3_ENDPOINT` as unset**: an empty directory used to resolve to the working
directory, and an empty endpoint to demand four more settings. Blanking therefore needs a
server with this change; `v0.4.0` and older read the empty string as a directory. **A `.env`
that sets `FORMANCY_FILES_DIR` to some other path is now honoured** where compose ignored
it, and is a directory inside the container unless a volume is mounted there too.
`compose.test.ts` follows the object-store block through both files and asks the server's
store settings — now a function of the environment rather than lines in `main.ts` — which
store results. Its pass-through check reads the parsed environment's keys, where a comment
naming a variable used to satisfy it, and its check that a secret stays mandatory in both
files no longer skips a name with a digit in it.

**Fixed: `compose.published.yaml` said nothing was in the registry.** `v0.2.0` to `v0.4.0`
are, checked 2026-10-09; `v0.1.0` and `latest` are not. The self-hosting page said the same
of its example version.

**Corrected: the documentation named `@formancy/cli`, which does not exist.** The roadmap
said `npx @formancy/cli types` emits a TypeScript type per form — given as the reason formancy
does not copy form.io's untyped per-form API — and the migration guide and the versioning page
said `@formancy/cli migrate` rewrites documents forward. No such package was ever built, so the
one command a reader could copy was a 404 from npm. Migrating a document is `upgradeSpecVersion`
from `@formancy/spec`, a function, and those pages now say so; a command-line tool and a type
per form are listed under what does not exist yet, with what it would take. Two sentences
naming "a script, the CLI or an agent" lose the CLI. Nothing had compared the pages with the
manifests: `apps/docs/src/package-references.test.ts` now reads every package's name, whether
it is published and the commands it declares from the workspace manifests, and fails when a
page names a package that is not there, has `npx` or another runner fetch one that is
unpublished or has no command to run, installs a private one, or runs a `formancy…` command
nobody declares.

**Changed: an option's picture is drawn smaller in every shipped theme.** All four themes drew
it 7rem wide in a 4:3 frame — 112 by 84 pixels, whatever the screen — so the playground's two
delivery pictograms made a two-option question mostly picture, and it was reported as too big.
They are 4rem wide now, 64 by 48 pixels, the same fixed shape so a row of pictured options
still lines up. A stylesheet that wants them larger sets `inline-size` on
`[data-formancy-part='option-image']`.

**Fixed: a static text and a repeater could not be picked up on the preview.** Both
renderers drew a static text as a bare paragraph and a repeater's fieldset naming nothing,
while every other field carries `data-formancy-field-path`, which the builder's arrange
surface finds fields by. Both now carry it — so a published form has the attribute on those
two elements as well, and a selector for it matches a repeater's fieldset too. The surfaces
also walk past a repeater row's field, which no arrangement places, to the repeater around
it. A test in each renderer derives the types from the spec and requires each placed field
to name itself ([0150](docs/decisions/0150-every-field-an-arrangement-places-names-itself.md)).

**Fixed: a layout that places a group drew nothing — both renderers threw.** The validator
accepts a group's path as a field node and the arrangement pane offered one, but neither
renderer had a drawing for it, so the form did not render at all; the playground's demo block,
a group, placed whole, broke the preview. A group placed whole is now drawn as its fields under
its label, as a labelled section is, on the page its fields are on — decided once in
`@formancy/core` (`placedGroup`, `placedPage`) and read by both renderers, and held by a new
conformance fixture. **Validation is stricter in one case:** a group placed whole beside one of
its own fields is refused as `layout.placedInGroup`, since the field would be drawn twice; any
document doing that threw before, so none that rendered becomes invalid. `unreferencedPaths` no
longer lists the fields of a placed group, nor a group one of whose fields is placed. The
renderers emit two new parts, `group` and `group-heading`, which every theme dresses
([0151](docs/decisions/0151-a-group-placed-whole-is-drawn-as-its-fields.md)).

**Fixed: the Angular starter's date field had no calendar button in Chrome and Edge.**
Material's stylesheet hides Chromium's own calendar and clock buttons on every `matInput`,
because its datepicker brings a toggle of its own, and `@formancy/angular/material` draws a
date as the platform's input instead — so a date could only be typed there. Measured in all
three engines: Chromium lost the button, Firefox kept its own, WebKit draws none either way.
The starter's stylesheet puts Chromium's back, the Angular guide gives the rule to every
application using the adapter, which ships no CSS, and `test:browser` checks that the
starter's date field shows the button
([0149](docs/decisions/0149-a-material-date-keeps-the-platforms-calendar-button.md)).

**Fixed: after one drop on the playground's preview, nothing in its Angular preview could be
picked up again.** The arrange surface marked what could be dragged when it rendered, and the
Angular preview it holds is redrawn after that, on Angular's schedule — 33 nodes could be
picked up before a drop and none after. A field a rule shows had the same problem without a
second framework: its own slot mounts it, and the canton appeared unmarked once Switzerland was
chosen. Both surfaces now keep their marks up with the DOM, by observing what arrives in the
tree under them while arranging is on, and `test:browser` checks that a preview offers as much
after a drop as before, and that the canton can be picked up
([0148](docs/decisions/0148-the-arrange-surfaces-marks-follow-the-dom.md)).

**Added: a rule in a repeater row says, row by row, what it does now and why.** The rules
overview gave such a rule no verdict, because it reads an `item` the form as a whole does not
have — so a note required in one recipient's row and not another's had no reason shown, and a
row rule that cannot be decided, which shows its field in every row, could not be found there.
`explainRows` in `@formancy/builder-core` evaluates each row as the engine does — `item` with
every field of the row present, null where empty, and `index` — and both builders draw a
verdict per row under the rule. `explainRule` still gives such a rule none
([0147](docs/decisions/0147-a-rule-in-a-repeater-row-is-explained-row-by-row.md)).

**Fixed: a node dropped in the space between two others on the preview lands between them.**
A browser reports a pointer in that space as over the container, so a field dropped between
two fields in a section landed above or below the whole section, and between two top-level
nodes — where the form itself names no layout node — no drop was offered at all. Both builders
now ask `gapNeighbour` in `@formancy/builder-core`, which reads the gap from where the
container's children were drawn and aims at the nearer of them; a gap only ever moves, never
makes a row. The renderers emit nothing new, so a published form is unchanged, and
`test:browser` drags into the space in both renderers' markup
([0146](docs/decisions/0146-a-drop-between-two-nodes-is-read-from-where-they-were-drawn.md)).

**Fixed: everything a document can say has a spec version, and the check reads it from one
ledger.** 0.4.0 said its freeze check covered field types and widgets but not properties or
rule kinds. Writing that check found a rule kind outside version 2's list taken to be version
3's, a layout kind outside version 1's taken to be version 2's, and two version 2 properties,
`columns` and `span`, never named: a version 1 document carrying one was refused only through
the widget or the table that carries it. Every property, rule kind and layout kind now has its
version in `version-ledger.ts`, keyed by the type that lists them, so a property added to
`FieldDef` without one is a compile error, and a test derives from the document schema what a
document may say and requires each to be refused one version early. A property with no sentence
of its own is reported as the new code `version.property`, translated in German and French
([0145](docs/decisions/0145-a-version-for-everything-a-document-can-say.md)).

**Fixed: one mark everywhere.** The documentation drew its own mint mark on dark green, the
site's and the playground's favicons a darker violet and teal than the site's bar, and the
Angular starter had no favicon. Every copy is now the site's favicon in the site's palette,
the touch icon is re-rendered from it, and a test compares them all
([0144](docs/decisions/0144-one-mark-and-the-sites-favicon-is-it.md)).

**Fixed: every part of both builders is dressed by `@formancy/themes/workbench.css`.** The
prompt pane was a textarea at the browser's default size and in its default monospace, beside
a grey native button, because nothing styled it — and neither did anything style the
scenarios, blocks, a datagrid's columns, a group inside a condition, a layout node's
properties, two layout dialogs or the translations, which only the admin's own stylesheet
dressed, for the admin. A test now derives the parts from both builders' sources and fails
for one the workbench does not select. The workbench gains one token, `--wb-caution`, for a
change that costs some answers and a translation still missing
([0143](docs/decisions/0143-the-workbench-dresses-every-part-a-builder-draws.md)).

**Corrected: three documents said uploads are not scanned.** The documentation's front page,
the self-hosting guide and the SOUP declaration's list of what is still absent all said so, while
0.4.0 scans every upload before keeping it when a deployment runs ClamAV
([0131](docs/decisions/0131-an-upload-is-scanned-before-it-is-kept.md)) — and the SOUP
declaration said so too, a section earlier. No check caught it: each is a sentence about what
the server does not do, and nothing compares such a sentence with the server.

**Fixed: the Angular starter looks like the Material application it is.** Material's type
tokens name Roboto with no fallback and nothing loaded it, so every Material label was drawn in
the browser's serif; the builder beside the form had no styling; and the submit and repeater
buttons were the platform's. The starter now loads Roboto itself rather than from a font
service, dresses the builder with `@formancy/themes/workbench.css` recoloured by Material's
tokens, and dresses the controls Material does not draw in those tokens too — through the
`data-formancy-part` hooks, in its own stylesheet, which is yours to change
([0142](docs/decisions/0142-the-angular-starter-is-dressed-in-materials-tokens.md)).

**Fixed: `@formancy/angular/material`'s radio and tick groups carry the default group's
hooks.** The fieldset around Material's radios and ticks is the adapter's own markup and had
none of `data-formancy-part="field"`, `"label"`, `"required-hint"` or `data-state`, so a
stylesheet that reached the default group's required hint missed Material's, and *required*
stood as bare text before the radios.

**Removed: the SurveyJS comparison from formancy.ai/angular-form-builder.** The page makes its
case about formancy alone: the starter running, the install, saving and opening a form, and the
tested versions ([0141](docs/decisions/0141-the-angular-page-compares-with-no-other-product.md)).

## 0.4.0 — 2026-10-09

**The first release since `0.3.0`, and it freezes spec version 4** — with the two survey
types it was opened for, `ranking` and `matrix`, beside the `rating` and `slider` widgets
and the `step`, `mask` and option `image` properties. A document written against version 4
will validate against every future release that speaks it, and no version is open. A reader
pinned to `0.3.0` refuses a version 4 document, loudly: upgrade the readers before the
documents.

Newest first, as it was written. Nothing was published in between, so there is no `0.4.0`
anywhere that means something narrower.

**Fixed: the error summary named fields by their data path.** Unless the host passed `labels`,
both renderers listed a failed submit's problems as "email: required" — the key, as a link's
accessible name — for a field whose document gives it a label. The summary now uses the field's
own label in the form's language, and the key only for a field that has none. The Angular test
had pinned the old text.
**Spec version 4 is frozen.** It holds the `ranking` and `matrix` field types, the `rating`
and `slider` widgets, and the `step`, `mask` and option `image` properties; a document that
validates against it now will validate against every release that speaks it. **No version is
open**: the next construct that changes what a document may say opens version 5. The freeze is
a test as well as a heading — a field type or widget in no version's list fails the spec's
suite, where it used to be taken for the newest version
([0140](docs/decisions/0140-spec-4-freezes-with-the-two-types-it-opened-for.md)).

**Spec 4: `matrix`, a field type.** One question asked of several rows, with the same answers
for each: `rows`, and the field's `options` as the columns. The answer is `{ row: column }`
for each row answered, `{}` untouched, and a required matrix needs every row — a matrix half
answered has not been answered. Both renderers draw a group per row of radios named by column,
so arrow keys move within a row and every answer is reached by role and name; the four form
themes dress the options as they dress radio options. The builder edits the rows with the
options editor, under the words "Rows" and "Add a row" — taken by name, they were offered as a
text box asking for JSON — and the condition editor reads a matrix as answered when any row is
([0139](docs/decisions/0139-a-matrix-answers-one-question-per-row.md)).

**Fixed: a ranking accepted pictures on its options and drew none.** A picture is refused on a
ranking and on a matrix now, as it is in a dropdown.

**Fixed: four themes kept a side when a form was read right to left.** Ten padding and
margin shorthands named a left unlike their right — a tag picker's chips, an error message, a
file row, a repeater legend, a drop cap — and two rules floated left. They are block and
inline longhands and `float: inline-start` now, and the theme check refuses both spellings; it
knew `padding-left` and not `padding: a b c d`. Found by the real-browser gate the first time
a control that borrowed a chip's padding was on screen when the form was mirrored.

**Spec 4: `ranking`, a field type.** Options put in order; the answer is the chosen values
in the order chosen, most preferred first. It starts empty rather than in the options'
written order, because an order nobody chose is not an answer, and `minItems`/`maxItems`
bound how many are ranked ("your top two" is `maxItems: 2`). Both renderers draw it as
two lists of buttons named after their option — move up, move down, take out, rank —
keyboard-first, with focus following the option being moved; there is no drag. The engine
refuses a repeated value, a value nobody offered and a string where an order belongs, on
the server as well. The builder offers it with two starter options, and the condition
editor treats it as a list. A version 3 document carrying one is now refused: the version check
answered "3" for every type newer than 2, so it would have **accepted** a document that
says version 3 and that no version 3 reader can read
([0138](docs/decisions/0138-a-ranking-stores-the-order-chosen.md)).

**The job application template is a wizard.** Its questions are on three pages, each drawn
in the template's layout, so the gallery has a form answered a step at a time; pages hold no
data, so its sample answers and behaviour cases did not change. A gallery card now reads its
languages and its steps from the template rather than printing "3 languages" on every card.

**Fixed: the two renderers drew a paged form with a layout differently, and both wrongly.**
React drew the whole layout on every step, so a later page's questions were on the first —
answerable, and not checked by Next; Angular dropped the layout for any paged form. Both now
draw it a page at a time: each step is the layout holding that page's fields, with no empty
section or tab for a page somebody is not on. The decision is `layoutNodeShows` in
`@formancy/spec`, which both ask
([0137](docs/decisions/0137-a-paged-forms-layout-is-drawn-a-page-at-a-time.md)).

**`@formancy/conformance`: a fixture can name a layout.** `layout` on a fixture and on
`MountOptions`; the validator refuses one the document lacks. A new fixture holds both
renderers to the paragraph above, so **a third-party driver must now pass the layout to its
form** — it failed nowhere before only because no fixture asked.
**formancy.ai/angular-form-builder.** A page for somebody looking for an Angular form builder,
with the Angular starter running in it — the real application, built from the repository and
served at `/angular-form-builder/demo/`, not a recording — the install command, an editor
component, the save-and-reload code, the versions CI runs, and a comparison with SurveyJS
part by part: renderer, visual builder, backend. What it says about SurveyJS is dated and
links SurveyJS's own pages, because it is true on a day and this repository cannot keep it
true. The install command and the snippet are checked against the packages they name
([0136](docs/decisions/0136-the-angular-page-runs-the-starter.md)).

**The Angular starter saves the form being built, and opens on it.** `saved-form.ts` keeps it
in the browser's storage and is the one file to change to keep it on a server; a saved form
that is no longer valid is not opened, since a session refuses one by throwing. The starter is
now built with a relative base, so it can be served from any path, a copy of it included.

**Fixed: the site's footer said "Spec version 2".** It was typed, and stayed at 2 while the spec
reached 4. It is now the version the spec package writes.

**Blocks: a piece of a form saved to use again.** Both builders save the focused field —
usually a group or a repeater — as a block with `b`, and offer blocks in the add palette
beside the field types. A block carries the rules that read only inside it and the words its
labels name; inserting one makes its keys unique (`country` becomes `country2`), renames a
word the form already says differently, and re-roots and renames every rule it carries, so
the canton still shows only for Switzerland — one edit, which undo takes back. A rule reading
a field outside is left behind and the builder says how many. The host keeps blocks: a
builder takes `blocks` and hands back each one saved (`onSaveBlock` in React, `blockSaved`
in Angular), and only a host that binds the list gets the `b` command. The playground starts
with an address block and shares one list between its two builders. Why a copy rather than a
reference, and what a block refuses to carry, is in
[0135](docs/decisions/0135-a-block-is-a-field-with-its-rules.md).

**A tested compatibility matrix.** The lowest and newest versions of React (19.0.0 and the
newest 19), Angular (22.0.0 and the newest 22, with Material at the same version) and Node.js
(22.12.0 and 24) are each a CI run, read from one file, `compatibility.json`, which a test holds
to the ranges the packages declare. The React run now renders a form with that React rather
than only bundling it; the Angular run is new — the packed Angular packages installed into an
Angular project at that version, built by it and run in Chromium. The documentation has a
Compatibility page saying what each run proves and what is not tested
([0134](docs/decisions/0134-the-versions-it-says-are-the-versions-it-runs.md)).

**An Angular starter: `apps/angular-starter`.** An Angular application with the form builder
and the form it builds side by side — `@formancy/builder-angular` editing an expense claim,
and the claim filled in, drawn with Angular Material, re-made whenever the document changes.
Everything a host decides is in three files; its README says how to take it out of the
repository and how to send files to a formancy server
([0133](docs/decisions/0133-the-angular-starter-is-the-builder-and-the-form.md)).

**Angular Material, as a registry: `@formancy/angular/material`.** `provideFormancyMaterial()`
draws text, paragraph, number, date and time in `<mat-form-field>`, a list as the platform's
`<select>` under `matNativeControl`, and ticks and radios as Material's. Everything Material
has no equivalent for — a mask, a typeahead, a rating, a picture on an option, a file — is
drawn by the default control, so nothing disappears. It is held to the same conformance
fixtures as the default controls, axe included. `@angular/material` and `@angular/cdk` are
optional peers, needed only by an application importing `/material`
([0132](docs/decisions/0132-material-draws-what-it-has-an-equivalent-for.md)).

**Fixed: an error summary's link did nothing for a control whose id is on its host.** Both
renderers' `focusControl` now moves focus to the first control inside an element that cannot
take focus — which a design system's checkbox, Material's included, puts the engine's id on.

**An upload can be scanned before it is kept.** Set `FORMANCY_CLAMD_HOST` and every upload's
bytes go to a ClamAV daemon before they are stored: clean is kept, a finding is refused with
its name — which the file field shows as the reason it was not attached — and a scanner that
cannot be reached refuses the file too, with "try again", because configuring a scanner is a
promise that nothing unscanned gets in. A refused file is never in the store and cannot be
claimed by a submission. The adapter speaks clamd's own INSTREAM protocol, so it adds no
dependency; `Scanner` is a port, so any other scanner fits behind it. Measured once against
ClamAV 1.5.4: set `AlertExceedsMax` in `clamd.conf`, or an archive that expands past clamd's
limits is answered clean without being scanned
([0131](docs/decisions/0131-an-upload-is-scanned-before-it-is-kept.md)).

The admin's uploader passes on what the server said when it refuses bytes after they
arrived, rather than "The upload failed (422)".

**Each file is its own upload.** A file field shows every file it is sending — waiting its
turn, uploading with how far it has got, or refused with the uploader's reason — with a way
to cancel it, to try it again, or to dismiss it; the picker stays open while files upload;
attached files can be moved up or down; and an image picked in the session gets a thumbnail.
What happens to each file is `@formancy/core`'s (`fieldUploads`), read by both renderers.
The thumbnail is decoded and drawn on a canvas rather than loaded from an object URL, so it
needs no `blob:` in a page's `img-src`
([0130](docs/decisions/0130-each-file-is-its-own-upload.md)).

**`Uploader` takes `(file, options)`.** `options.field` is the data path a server reads
(`items[].receipt` in any row), `options.signal` is aborted when the person cancels, and
`options.onProgress(sent, total)` draws the bar. An uploader of the file alone still is one;
code that calls an `Uploader` itself has to pass the options. The admin's preview uses all
three: it offered every file against the first file field in the form until the renderer
said which field a file was for, and it now sends the bytes by XHR, because `fetch` cannot
report an upload's progress.

**Fixed: a file finishing after its row moved was attached to another row.** A row that moves
remounts its controls, and the field wrote the finished file to the position it had when the
file was picked — measured, a taxi receipt landed on the hotel row. Uploads now belong to the
form, found by the row's identity, and a finished file goes to its own row wherever it is, or
to none if the row was removed.

The playground's uploader copies the bytes into the tab in pieces and reports each, so its
progress bar is of real work; it kept only a handle on the file on disk before.

**A rule on a field in a repeater row, from the builder.** The logic panel addressed such a
field by its dotted path, `items.note`, which no field has, so every rule written on one was
refused. It is now addressed as the engine scopes it, `items[].note`; the condition may compare
the fields of its own row, offered as "Quantity in this row"; and renaming a row field, the
repeater, or unwrapping a group in the row carries the target, the condition (`item.qty`) and
the editor metadata along — before, renaming a row field succeeded and left every rule in the
row reading its old name, with nothing but a warning at publish. The playground's starter has
one ([0129](docs/decisions/0129-a-row-rule-is-written-in-the-row.md)).

**Fixed: a list compared in a repeater row failed open on a fresh row.** In a row an
untouched list is null, not `[]` as at the top level, so `compileCondition` — exported, and
already accepting `items[].tags` — wrote `"gift" in item.tags`, which throws there; a
`visible` rule then showed the field it was meant to hide. It now writes
`item.tags != null && "gift" in item.tags`. The guide's advice to use `has()` "for a path
inside a group or a row" was wrong for a row, where every key is present and `has()` is
always true; it now says `!= null`, and the table is checked against the engine.

**Every rule in the form, and why a field is hidden now.** Both builders have a rules overview
(`RulesOverview`, `formancy-rules-overview`): every rule grouped under the field or page it is
about, in the form's order, with its condition in words — "Show this field when Country is
Switzerland or (Age is at least 18 and Terms is Yes)" — or as CEL where somebody wrote it by
hand. Given the answers a host's preview holds, and that preview's clock, each rule says what
it does now and why: "Hidden now. Country is Switzerland: no — it is Germany". A rule that
cannot be decided says so and says what that does — a `visible` rule that fails shows the
field it was meant to hide, which is the case nothing on screen explained before. The verdicts
are tested to agree with the engine for the same answers. The playground has a Rules tab fed
from the form pane: change an answer and watch the reason change
([0128](docs/decisions/0128-a-form-says-why-a-field-is-hidden.md)).

**The condition editor nests one level, offers what a field can take, and no longer fails
open.** Both builders' logic panels can write "(A and B) or C": a group of comparisons
inside a condition, joined its own way. The comparisons offered follow the field — before
and after for a date, contains for text, at least and at most for a number, includes for a
list of ticks — and so does the value control: a choice's own options by label, yes or no
for a checkbox, a number or date box. Rebuilding it found four shipped defects, all fixed: a
builder-written `visible` rule on a field inside a group showed its field on every
untouched form (the read into a null group threw, and a rule that throws fails open); so did
a bound on an empty number; a field inside a page was compared at its tree path,
`about.country`, which no field has; and a choice whose value looks like a number was
compared as a number. The editor now guards every read (`has()`, `!= null`, a length for a
list), and the draft and every edit to it live in `builder-core`, so the two builders cannot
disagree. **Rules written by an earlier builder keep their expression** until written again;
the logic documentation's table shows how to recognise an unguarded one
([0127](docs/decisions/0127-a-condition-nests-one-level.md)).

**Choices with pictures** (spec version 4). An option on a radio group or a set of checkboxes
can carry `image: { src, alt? }`, drawn inside the option's label so pressing the picture
chooses it and its text alternative joins the option's name. The answer is still the option's
value. A picture on a dropdown or a tag picker would draw nothing, so the validator refuses
it and the builder does not offer it — both builders' choice editors offer a picture address
and a description exactly where one can be shown. A picture comes from an `https://` address,
a path on the showing site, or the picture itself as a `data:image/` address; one from another
site tells that site who opened the form, and the schema says so. The playground's delivery
options have pictures, every theme draws them, and a picture changed between versions diffs as
compatible ([0126](docs/decisions/0126-an-option-may-carry-a-picture.md)).

**A list whose contents are wrong is no longer also an "unknown property".** An option value
one character too long also reported *Unknown property "options". Check the spelling* — ajv
calls a property unevaluated when the branch declaring it fails. The structural half now
treats a property whose contents failed as already judged, so the author sees the one real
problem. And the rule vocabulary moved from `types.ts` to `rules.ts`; the exports are
unchanged.

**Input masks** (spec version 4). A `text` field can carry `mask`: `9` takes a digit, `a` a
letter, `*` either, and any other character is written by the control — `(999) 999-9999`.
**The answer holds only what was typed**, so it stores `5551234567`, and restyling the mask
never orphans a stored answer. The engine refuses an answer that does not fill the mask with
the code `mask`, so a payload posted straight at the server is held to it too. Where a typed,
deleted or pasted character lands is one function in `@formancy/spec`, `editMasked`, which
both renderers call: the caret stays where you type, backspace after a bracket deletes the
digit before it, and a pasted `+41 79 123 45 67` is read as nine digits rather than as the
`41` the mask writes plus seven. The builder offers `mask` on text fields in English,
German and French, the playground's starter has a masked phone number, and `diffSchemas`
treats a mask added or changed as a tightening
([0125](docs/decisions/0125-a-mask-stores-what-was-typed.md)). To make room for the rule,
`validate.ts` gave its ajv half to `structural-errors.ts` and left the size allow-list.

**A theme preset can be brought back.** The theme editor's download was a file you could keep
and never carry on editing. That CSS patch is now the preset: **Import CSS** reads it back
and the editor opens where it was left. It is read by the browser and filtered by the same
rule the editor discovers tokens by, so it can set exactly what the editor offers — and what
it cannot apply is said rather than dropped: a token the theme does not declare, another
theme's tokens, or a declaration on `:root` that the theme's own root would override before
it reached a control. An import replaces the edits in progress. Nothing persists, as before:
the file is the preset ([0124](docs/decisions/0124-a-theme-preset-is-the-patch-read-back.md)).

**The builder reads right to left, and a bundler can no longer quietly undo it.** Verifying
the builders under `dir="rtl"` found four things. The drag surface measured the pointer from
the left, so a field aimed at the right of another in an Arabic or Hebrew form landed on its
left; `arrangeDrop` now takes the `direction` the browser computed, and both surfaces pass
it. The bar that marks a selected tree node, the active navigation item, the active
typeahead option (Paper) and all four drop indicators is an inset `box-shadow`, which CSS
cannot write logically, and stayed on the left; each now has a `:dir(rtl)` pair. The source
check that keeps the themes in reading order never read `workbench.css` — it kept only the
stylesheets that style a form — and its `background-position` case stopped removing `:dir()`
rules once a stylesheet had two; both fixed, and it now checks inset bars per rule. And with
every source check green, Chromium still drew the bar on the left: **Vite's default CSS
target had Lightning CSS rewrite every `:dir(rtl)` as `:is(:lang(ar), :lang(he), …)`**, which
follows a page's language rather than its direction. The site and playground now build for
`CSS_TARGET` (Chrome 120, Firefox 113, Safari 16.4), the browser gate fails on the rewrite in
what they serve, and **a host bundling the themes needs the same target** — the themes
README says how ([0123](docs/decisions/0123-the-builder-reads-right-to-left.md)).

**Why the validator refused an edit, in the author's language.** The refusal an author meets
most — *Another field already uses the key "email"* — came from the validator as one English
string, inside a builder that otherwise spoke German, and translating it would have meant
matching the English. Every validator error now carries a `code` and the `values` its
sentence names beside its unchanged English `message`: `{ path, message, code, values }`.
The English for every code is `SCHEMA_ERRORS` in `@formancy/spec`; German and French are
`SCHEMA_ERRORS_DE` and `SCHEMA_ERRORS_FR` in `@formancy/builder-core`, which a language
carries as `errors` (`createBuilderText({ …, errors })`), and a session's refusals are said
through `text.error`. The server's 422 for an invalid schema and the MCP tools return the
two new fields too — additive, nothing that read `message` reads anything different. The
compiler checks every validator call against the placeholders of its sentence, so a value
a sentence names cannot be forgotten and shown as `{key}`
([0122](docs/decisions/0122-a-validator-error-has-a-code.md)). The Angular getting-started
page still said a property's title stays English, a release after it stopped; it shows the
whole language now.

**§9.3's figure for `@formancy/spec` was 5.2 kB short.** It said 14.0 kB "for the whole
barrel", and the guard behind it agreed, because both measured `dist/index.mjs` alone —
while the barrel imports a chunk it shares with `/validate`. Found when the validator's
sentences moved into that chunk and the figure did not move. The guard now follows the
barrel's imports, and the figure is 21.6 kB, of which the sentences are about 2.4.

**Property labels and field type names in the author's language.** A German builder's
panel still said "Required", "Minimum length" and "Single-line text": those are the spec's
JSON Schema's words, which the reference documentation reads too, and they had stayed
English to keep one source. They still live in the schema, in English — and German and
French translations sit beside it, keyed by that English, in `SCHEMA_WORDS_DE` and
`SCHEMA_WORDS_FR`. A language carries them (`createBuilderText({ …, schema })`) and the
property panels, the palette, the locked-types note and the label a new field starts with
all read them; a German author's new field is labelled "Einzeiliger Text" now, not
"Single-line text". The set of texts is derived from the schema, so rewording a description
there fails `schema-words.test.ts` until both translations follow, rather than drifting
back to English unseen ([0121](docs/decisions/0121-the-specs-words-are-translated-beside-it.md)).

**The builder speaks French.** `BUILDER_MESSAGES_FR` ships complete beside German, held to
the same rules by `messages.test.ts` — every message English has, the same placeholders,
nothing empty — and the playground's Language switch now gives a French builder as well as
French form text. Written in the register French software uses, the polite imperative,
with French spacing before `:` `;` `?` and inside « ». French counts 0 and 1 alike —
"0 champ" — which `Intl.PluralRules` knows and a test pins, because a test for `=== 1`
would have said "0 champs" ([0114](docs/decisions/0114-the-builder-speaks-the-authors-language.md)).

**Every surface of both builders speaks the author's language.** The translations, prompt
and scenario panes and the drop surface over the rendered form were the last; each read
the catalogue now, and the three decisions both builders had still written by hand are
`builder-core`'s: what a drop on the form does and says (`arrangeDropAndSay` — a wrap now
names both items rather than "them"), what the prompt pane's live region says
(`proposalStatus` — "1 change, none of which affect" is "1 change, which does not affect"),
and the scenario panel's (`scenarioStatus` — "1 of 3 do not hold" is "1 of 3 does not
hold"). The playground's Language switch changes the builder as well as the form: choose
Deutsch and both builders are German
([0120](docs/decisions/0120-a-sessions-language-is-fixed-for-its-lifetime.md)). A session's
language is fixed for its lifetime, as an engine's locale is, so the switch opens the same
text again — and drops the undo history, which is the cost.

What stays English, deliberately: a property's title and description, which are the spec's
JSON Schema's words; a validator's or parser's message, which is its package's; and the
problems the model is told, which the prompt pane shows as they were told. The pseudo-
language check now knows a document's word with the punctuation a renderer set beside it
in one text node — Angular's `: Gone`, which React renders as two.

**"Every refusal a session issues" was not every refusal.** The change that moved the
builder's words into a catalogue said so, and four were still English in `session.ts` —
removing the default language, extracting a property that is not text, and two about
layout settings — while a rename a rule could not follow set an English clause into a
German refusal. They are in the catalogue now, and
`apps/docs/src/builder-sentences.test.ts` reads every string in `builder-core` through
the TypeScript compiler and names any that reads as a sentence, so the next one fails the
build wherever it is written
([0119](docs/decisions/0119-a-sentence-in-builder-core-comes-from-the-catalogue.md)).

**An uploaded file that is not a translation file said "file.messages is not iterable".**
`importCatalogue` threw on it, and both builders showed the exception's text to a
translator as the reason. It refuses in words now — and both translation panes had been
dropping every outcome `importCatalogue` returned, so a refusal would have been a
silent no-op after an upload. They show it; a file that is not JSON says so in the
builder's words rather than the parser's. The translation commands moved from
`session.ts` to `translation.ts`, and the orphan list stopped walking the document a
second way.

**The logic panel speaks the author's language in both builders.** What a rule does, the
comparisons, the join, the numbered labels and every button come from the catalogue;
the rule kinds and operators through `ruleKindLabel`, `ruleKindHint` and
`operatorLabel`, which read the same ids `RULE_KIND_CHOICES` and `OPERATORS` take their
English from, and the numbering — "Field", or "Field 2" once there are two — through
`comparisonLabel`, which both panels had written by hand
([0114](docs/decisions/0114-the-builder-speaks-the-authors-language.md)).

**A rule's remove button said "Remove the visible rule on canton"**: `visible` is the
format's id for the kind, not a word in any language a builder speaks. It names the rule
by what it does now — "Remove the rule “Show this field when” on canton" — in both
builders. A host or test that looked for the old name finds the new one. The check and
calculation boxes show their examples in the session's language, and the Angular panel
shows them at all.

**The property editors speak the author's language, and the two options editors are one
shape.** The panels are generated from the spec's JSON Schema, so most of what they show
is the schema's own words; what is the builder's is in the choices and columns editors and
in what the layout panel calls a node. Those now come from the catalogue, handed to each
editor by its panel rather than found ambiently, because the language belongs to one
session and two builders on a page can speak two
([0118](docs/decisions/0118-an-editor-is-handed-its-language.md)). Used on their own,
`OptionsEditor` and `ColumnsEditor` take a `text` and default to English, so nothing
changes for a caller that passes none.

**The Angular options editor named each choice's box "Label"** — the same name as the
panel's own Label for the field, so a screen reader asked for "Label" could not tell
which. It is "Choice label", as in React, with the label before the value, the React
editor's words for an empty list, and the same parts: the workbench theme, written
against the React editor, left the Angular one unstyled. "Add a choice" and the layout
panel's heading are decided once in `builder-core` (`nextChoice`,
`layoutPropertyHeading`); the new choice's label is written into the document in the
author's language.

**The arrangement pane offers the same things in both builders, and says them in the
author's language.** Reading the two panes side by side to move their words into the
catalogue found that they did not offer the same things for one document
([0117](docs/decisions/0117-the-arrangement-pane-offers-the-same-in-both-builders.md)):

- **The Angular pane could not place a field.** It listed the fields the arrangement
  leaves out under "Not in this arrangement" and offered three containers when asked to
  add something — the mistake the heading pointed at was one it gave no way to fix. It
  had no code in its palette, nothing to say about a form with no arrangement, and
  dialogs that only Cancel could close. It has all four now.
- **The React pane announced a drop as "Moved."** without saying what; it names it now.
- The wrap dialog had two names; both builders ask "What should go beside Email in a
  row?".

What the palette offers, what a new node is, what may be wrapped with what, and every
sentence a command produces now come from `builder-core` (`arrangement.ts`), and both
panes render them. Adding is its own component in both builders, which takes the React pane
off the size allow-list.

**German put a node in the wrong case.** "Abschnitt mit eine Zeile": after *mit* German
takes the dative, and the first catalogue used one form for a node in a list and a node on
its own. The list forms are dative now ("einer Zeile") and a node about to be added has its
own ("eine Zeile"). English "a tabs" is "a set of tabs". The German catalogue moved to its
own file, `messages-de.ts`.

**The structure tree speaks the author's language, in both builders — and saying it once
found three things both builders said wrong.** Every command on the tree is announced in
a live region, and for somebody building by keyboard with a screen reader that sentence is
the only evidence of what happened. Both builders worked the sentences out by hand from
the same copied logic, and moving them into `@formancy/builder-core` (`spoken.ts`) to
translate them once showed the copies had been wrong together
([0116](docs/decisions/0116-what-a-builder-says-is-decided-once.md)):

- **A drag named the wrong field.** Dragging Customer onto City announced "Moved City." —
  the drop handler's own argument, the row under the pointer.
- **Unwrapping a group in a form with pages called it a page**: "Removed the page Billing
  address. Its 2 questions are on Details now."
- "Added Page 1, holding the 1 fields that **were** at the top level" — the count was
  pluralised by hand and the verb was not. Likewise "Signature need a later spec
  version", and the locked types are now joined "A and B" rather than "A, B".

Everything the tree shows — its name, the empty state, both dialogs, the locked-types
note, the legend, every announcement — now comes from the session's language. The legend's
key names are translated (`Entf`, `Strg`) and its letters are not, because they are
bindings. `label` on `FormancyBuilder` in both packages defaults to the session's words
instead of an English literal. The Angular builder reads its words through a pure pipe,
`'tree.empty' | builderText: text()`, memoised on its arguments.

`builder-core` also publishes `pseudoLanguage()` and `untranslated()`: every message
marked, and whatever on screen is outside the marks and not the document's own words,
named. Each builder's tree is walked through every state it can show and held to that —
one judgement for both, so they cannot disagree about what counts as English left behind.
The other panes still word their own text and move next.

**`@formancy/builder-angular` logged two lines to the console on every ↓ keypress**
in its structure tree — `PROBE before …` and `PROBE after …`, a debugging probe left
in the key handler since the package was introduced, and so in 0.3.0.
An application embedding the builder had its console filled with somebody else's
diagnostics, and nothing could notice: the tests assert on the DOM and the browser gate
collects page errors, not log lines. The probe is gone, and
`apps/docs/src/console.test.ts` now refuses any reference to `console` in a published
package somebody imports — a library's console is its host's
([0115](docs/decisions/0115-a-library-writes-nothing-to-its-hosts-console.md)).

Looking at the one package allowed to write found a wrong statement in the regulatory
set: hazard C3 said the server emitted "no output of any kind". It has no request log,
which is what the integration test asserts — but its three background workers print a
failed pass's error to standard error, unredacted, and a Drizzle query error carries
the query's parameters. C3 and the SOUP declaration now say so.

**The builder can speak the author's language — the core of it, in this change.** Both
builders were English and written inline, and so was `@formancy/builder-core`: every
refusal a session issues, the move palette's "Section with A and B, between C and D", the
label a new field starts with. A German team building a German form read all of it in
English, and the React and Angular builders each held their own copy of the words, which
is two implementations of one decision with nothing to notice when they part
([0114](docs/decisions/0114-the-builder-speaks-the-authors-language.md)).

`builder-core` now has one catalogue, English and a complete German, and
`createBuilderText({ locale, messages })` returns the function a builder calls for every
word. `createBuilderSession(document, { text })` refuses in that language and exposes it
as `session.text`; `describeTarget`, `describeLayoutTarget`, `flattenLayout`,
`describeLayoutNode` and `newFieldOfType` take it and default to English, so a caller that
never asks for a language sees no change. Both builders already pass `session.text`
wherever they call those, so a German session's refusals, move targets, layout names and
starter labels reach the screen in German. **The builders' own buttons and headings are
still English** — they move next, and until then a German builder is half German.

- **Whole sentences per noun, not a noun in a template**, because "Empty {kind}" has no
  correct German: "Leerer Abschnitt", "Leere Zeile".
- **`Intl` decides plurals and lists.** The old joiner was `', '` plus a final `" and "`
  — English grammar in code, with the one word nobody could translate.
- **A locale the runtime has no data for is English**, not the machine's: measured, `xx`
  resolved to `gsw-CH` on a Swiss machine, and one document's layout tree joined "A und
  B" there and "A and B" in CI.
- **A missing placeholder stays visible** — "No field at {path}." rather than a sentence
  that hides that a value never came.
- `RULE_KIND_CHOICES` and `OPERATORS` read their English from the catalogue instead of
  holding a second copy; a rule kind with no message does not compile.

`builder-core` is the first isomorphic package to use ECMA-402, and the SOUP declaration's
required environment says so. Navigation moved from `session.ts` to `navigate.ts` on the
way, and the file's size ceiling went down with it.

**Right to left was true by accident, and now something fails when it stops being
true.** Every shipped theme had zero physical directional properties and twenty to
twenty-nine logical ones — not because anybody decided it, but because the person
writing them reached for `padding-inline-start` out of habit. A fact that holds by
habit holds until somebody types `padding-left` because that is what their fingers do,
and then an Arabic or Hebrew form has its labels, its error marks and its repeater
controls on the wrong side of the control they belong to. This product ships no layout
of its own, so a theme's stylesheet is the whole of the answer.

`apps/docs/src/themes.test.ts` refuses a stylesheet that names a side — nine properties
by name — with a guard on the guard, because an assertion of absence is satisfied by a
theme that positions nothing.

**And looking for the guard found the defect it had been told to ignore.** The first
version of the rule excluded `background-position`, on the grounds that it takes a side
as a *value* and the pattern would have to understand the difference. All four themes
that draw an icon did exactly this:

```css
background-position: right 0.75rem center;
padding-inline-end: 2.5rem;
```

The padding moves with the reading order and the icon does not, so the two part company
and the icon lands **on top of** the text. CSS has no logical `background-position`, so
the side is named twice now — `:dir(rtl)` on the control rather than an `[dir='rtl']`
ancestor, because direction is inherited and a form inside a right-to-left page with no
attribute of its own would be missed. The guard checks each side named outside a
`:dir()` rule has its opposite inside one.

**It is held by a source check and by nothing else, and that is said rather than
implied.** Those rules live inside `@supports (-webkit-touch-callout: none)` — iOS
WebKit alone, because mobile Safari draws no icon while Chromium and Firefox do — so
the browser gate runs an engine that never applies them.

The browser gate holds a different and narrower claim: the rendered form responds to
`dir`, none of its own layout stays pinned, and nothing overflows once mirrored. Its
wording says so, because the first version of it claimed to hold the themes and did
not — pinning a side in all four left it green, while pinning one in the application's
own stylesheet reddened it and named the three elements that stopped flipping. The four
asymmetries it measures come from the renderer and the user-agent stylesheet
([0113](docs/decisions/0113-a-theme-is-written-in-reading-order.md), and
`SAFETY-ANALYSIS.md` D4d).

**The MCP server now says what each tool will do, answers in structure, and ships the
order of operations.** Four things, three of which were wrong rather than merely absent.

**Every tool carries annotations.** They are the only thing a client has to decide
whether a call needs a person's agreement, and without them a tool defaults to
`readOnlyHint: false`, `destructiveHint: true`, `openWorldHint: true` — so this server's
local checks, which need no server and no credentials and change nothing anywhere, were
every one of them advertised as potentially destructive calls into an open world. A host
that auto-approves read-only tools and asks about the rest could not tell `validate_form`
from `publish_form`, so it either asked about everything or asked about nothing. Now:
`describe_spec`, `validate_form`, `diff_forms` and `check_scenarios` declare themselves
read-only and closed-world; `publish_form` declares that it writes, that it is **not**
destructive — a published version is immutable, so a publish adds rather than overwrites
— and that it is **not** idempotent, since publishing twice makes two versions.

**Every answer carries its structure beside the prose.** It used to be a sentence with
JSON glued to the end, so a client wanting the data had to find the blank line and parse
what came after. One envelope for all nine tools rather than a schema each — whether it
worked, a sentence to read, the part to act on — because nine schemas would be nine
places for `data` to drift from what the tool returns. Refusals are structured too: a
refusal is the answer a client most needs to act on, and one arriving as prose alone
makes that a reading-comprehension problem.

**The server reported version `0.1.0` while the package was on 0.3.0.** A wrong
statement in the one field a client uses to tell two installations apart, and exactly the
hand-written number this repository keeps finding stale. It comes from the manifest now.

**And three prompts, which is MCP's own answer to a skill pack.** `build_a_form`,
`change_a_form` and `embed_a_form`, named for what somebody is doing rather than for the
tools they use, and each giving the **order** — which is most of the value. Building
calls `describe_spec` first, because a model that writes the document first has already
invented `type: "email"`; its scenarios come last and are written from the description
rather than from the rules just written, or they agree with whatever those rules happen
to say. Changing goes `get_form` → edit → `propose_form_edit` → show the person →
publish *with the hash*, never straight to publish. Embedding answers for one framework
and not both, because a prompt that lists the alternative makes the model choose again
having just been told. They ship with the server, so they arrive with the connection
rather than being documentation somebody has to find and paste.

Twelve mutations, each watched to redden its own case. One of them caught a case passing
for the wrong reason: the test for "publish with the hash" asked whether `basedOn`
appeared anywhere in the prompt, and removing the instruction left the word in an earlier
sentence. It now looks for the two in one line
([0112](docs/decisions/0112-the-mcp-server-says-what-its-tools-do.md)).

**And a panel that says which example stopped holding.** The decision above published the runner and
said plainly what it did not do; this is that half. Both builders carry a scenario panel
now — `ScenarioPane` in React, `FormancyScenarioPane` in Angular — which reruns the
examples after every edit and **names** what broke rather than counting it. "3 of 5
fail" is a number somebody reads once; "Stopped holding: Switzerland asks for a canton"
is a sentence that gets acted on.

**The scenarios are the host's**, arriving as a prop and leaving through a callback,
exactly as the model and the uploader do. Not in the form document: that would put test
data in every published, immutable version, add a section every renderer has to ignore,
and break the reader contract for spec 1 to 3. Not on the server either, because the
check is worth most *before* a server exists — an agent checking a form it has just
written has none. A host keeping them in a `.scenarios.json` beside the form gets a CI
gate out of the same file, which is the shape the starter templates have always had.

Three rules decide what a regression is, each one a way a panel stops being read: a form
that **arrives** with failing scenarios has not regressed, a **new** scenario that fails
is not a regression, and **repairs are reported too**, because a panel that only ever
delivers bad news is one people learn to ignore. They live in `@formancy/builder-core`,
so the two builders cannot tell two people different things about one edit.

**A ninth MCP tool, `check_scenarios`.** Local, no server. An agent writes a rule from a
sentence, and an example is the one thing that catches it writing the opposite rule. It
**refuses an empty set** rather than answering that all nought scenarios hold — true,
and the single most misleading sentence it could give an agent about to publish.

**The playground shows it**, with five scenarios beside the starter, each pinning a rule
that compiles whichever way round it is written. A test drives it through the whole
application: the five hold, a field is deleted in the builder's own tree, and the panel
names the example that stopped holding.

Two things the work turned up and the records keep. **The panes needed an
`initialValue`** — a document with required fields is invalid before a scenario has set
anything, so every scenario against the real starter reported the same six `required`
errors and none was about the rule it was for; pointing the pane at a three-field form
would never have shown that. And **deleting the field a rule reads is refused**, which
reads like a limitation and is the opposite: the builder will not leave a condition
pointing at nothing, so the edit that breaks a scenario in the test is one the builder
is perfectly happy with — the honest case, since the dangerous edits are the ones
nothing else objects to.

Eleven mutations, each watched to redden its own case. A twelfth reddened nothing and
found a branch that could not change an answer, which was deleted rather than tested.
The playground's Monaco mock became writable in the process: it was read-only, so it
silently did nothing the moment a case tried to write, and the first version of the
scenario case passed against an unedited form
([0111](docs/decisions/0111-a-scenario-panel-names-what-stopped-holding.md)).

**A form can be checked against examples now, by anybody.** A condition type-checks and
is still the wrong business rule: `visible: leaveType == 'other'` and
`visible: leaveType != 'other'` are both valid CEL, both compile, both satisfy every
gate here — and one of them asks a question nobody should be asked. The difference is
not in the document; it is between the document and what somebody meant, and no amount
of checking the document can see it.

An example with its answer written down can. This repository has had those since the
starter templates shipped — `*.scenarios.json` beside each form — and **the runner
lived inside one test file**, as an interface and twenty lines of `expect`. So the
product's own answer to "your condition type-checks and is still wrong" was a private
helper: not available to a form author, not to a consumer's CI, not to an agent about to
publish.

`runScenarios` is in `@formancy/core` now. It **reports rather than asserts**, because
the caller is sometimes a test and sometimes a panel, and a panel cannot be built out of
`expect` — a failure says *"otherReason: expected to be hidden, and it is visible"*
rather than that something failed. It runs the real engine in the mode asked for, which
matters: `server` is what the publish gate and the submission endpoint run, and a
scenario that passes in one mode and fails in the other is the client/server drift this
product exists to prevent. A scenario can pin validity, error codes, visibility, values
and **absence** — four rather than two, because validity alone cannot tell a cleared
branch from one that was never filled, which is the whole of `clearOnHide`. A scenario
naming a path the form does not have **fails**, rather than quietly checking nothing,
which is how a renamed field leaves its scenarios behind.

The eighteen starter templates stopped having their own runner and go through this one,
which is both the migration and the proof: about ninety scenarios that passed before
pass after.

**`@formancy/core` is now over its byte budget — 18.7 kB against a stated 18 — and that
is reported rather than quietly raised.** A browser rendering a form never runs a
scenario, so the obvious fix was a second entry point; it was tried and reverted,
because `tsdown` code-splits a two-entry build and `dist/index.mjs` then measures 2.8 kB
of re-exports. A measurement that improves because the build changed shape is worse than
a number over budget. The fix is to measure an entry point's dependency closure rather
than one file, which is a change to the guard and not to the code.

Six mutations, each watched to redden its own case. A seventh reddened nothing and found
a defensive copy guarding against something the value store already prevents — it writes
immutably — so the copy was deleted rather than tested. And the bundle guard had to be
rewritten: it carried one regular expression per package including whether that row's
figure was in bold, so a number going over budget and gaining a `**` made it report "no
figure for @formancy/core in §9.3" — true about its own pattern, false about the
document. It reads the table row now
([0110](docs/decisions/0110-a-form-is-checked-against-examples.md)).

**What is not here**: saving a scenario in a builder, rerunning it after an edit and
showing which ones stopped holding. That is the half somebody touches, and this is the
part both builders and an MCP tool have to agree about, in the one place they can share
it.

**A model's edit is now shown before it lands, in both builders and through MCP.**
`authorForm` checks an answer as hard as anything here checks anything — parsed,
validated against the spec's own JSON Schema, compiled by the real engine, every
expression type-checked, and the model told what was wrong and asked again. Then the
React pane applied it.

**Valid is not the same as wanted.** A document passes every one of those checks with
the condition inverted that somebody asked to loosen, a field renamed whose answers are
already in a database, or an option withdrawn that submissions already carry. Undo was
the answer, and undo is the wrong shape: it puts a document back *after* the change has
been read, previewed, and — in a shared session — published by somebody else in another
tab.

So: propose, show what it does, decide. The change list is `diffSchemas`, the same
function the publish check, draft migration and the consumer CI gate read — one thing
decides what changed rather than a review screen holding a second opinion. It is also
why this follows the diff work in the same release: until that landed, the review screen
for "the model rewrote your options and three rules" would have been an empty list.

**`PromptPane` changed behaviour, and it is published.** An integrator who mounted it
gets a review step they did not ask for. The `ask` prop, the attempts and the refusal
reporting are unchanged; what is new is that nothing reaches the document until somebody
presses the button, and that a proposal written against a form which has since changed
is **refused** rather than applied over the change — a model answers with the whole
document, so applying it would silently discard whatever was edited in between. Refused
rather than merged: there is no three-way merge here and inventing one would be guessing
at which edit wins.

**Angular has a prompt pane at last.** It had none. `FormancyPromptPane` is the same
feature in Angular's idiom — signals, zoneless, `OnPush` — over the same three functions
in `@formancy/builder-core`, so the two builders cannot disagree about what counts as a
change, when a proposal has gone stale, or whether an edit costs the answers already
collected. The layering guard in `apps/docs` now pairs the two panes instead of excusing
React's as one-sided.

**A new MCP tool, and a safer publish.** `propose_form_edit` fetches the published form,
diffs the edit against it, and answers with the change list and a `basedOn` hash —
publishing nothing. `publish_form` takes that hash and refuses when the server has moved
on. This is the mistake an agent makes that nobody sees until the form is wrong: a
document is the *whole* form, so publishing an edit based on an older version discards
whatever somebody published in between, and the publish succeeds so nothing reports it.
`basedOn` is optional, because a form being created for the first time has nothing to be
based on — so the unsafe path still exists and the tool's description is what points at
the safe one.

**And the playground shows it.** Neither pane was mounted by any application, so the
React one was a feature in a package and nowhere a visitor could reach — the
documented-and-inert failure this repository has shipped once. The playground now
supplies a stand-in model exactly as it supplies a stand-in camera: the person plays the
model through a prompt, and everything after the answer is real. A test drives the whole
thing through the application — the model answers, the structure tree does not change,
the person presses apply, the tree changes.

Sixteen mutations, each watched to redden its own cases: five on the core rules, six
across the two panes, five on the MCP tools. One guard had to be rewritten rather than
updated — the layering test encoded "the prompt pane is React-only" twice, so a fact
that changed left a guard insisting the old prose stay; it now derives both directions
([0109](docs/decisions/0109-an-ai-edit-is-reviewed-before-it-lands.md)).

**Two different forms used to diff to "nothing changed".** `diffSchemas` compared a
field's identity, its type and its `required` flag — and nothing else. An option
withdrawn from a radio, a `maxLength` halved, a `pattern` added, a `visible` rule
added or rewritten, a message catalogue rewritten, a locale added, a layout
rearranged, a field relabelled, the form's own title or id changed: every one of them
produced an **empty list**.

That is worse than a wrong severity. Four readers trust this function — draft
migration, the builder's *what changed before you publish* view, export column
unioning and the consumer CI compatibility gate — and an empty answer tells all four
that nothing happened. A draft rebinds silently against a form that now rejects it; a
publish review shows an empty list and somebody approves it. The option case loses
data outright: a submission holding `"post"` against a radio that no longer offers it
carries a value outside the document's own vocabulary, and the function whose job is
to say so said nothing.

**Every area now has a comparator, and the severity answers only the second question.**
*What changed* is the length of the list; *what it costs the data* is the severity. So
`compatible` carries real weight now — a rewritten translation, a relabelled option
and a rearranged layout are changes, are reported, and cost the stored answers
nothing. The new kinds are `field.optionRemoved` (lossy — the stored value is no
longer one the document defines), `field.optionAdded`, `field.optionRelabelled`,
`field.constraintTightened` (lossy), `field.constraintRelaxed`, `field.relabelled`,
`rule.added`, `rule.removed`, `rule.changed` (all lossy — `visible` with `clearOnHide`
decides whether an answer is kept at all), `text.changed`, `layout.changed`,
`document.relabelled` and `document.identityChanged`.

**And two backstops, which are the decision rather than the tidying-up.** A field
property with no comparator is `field.changed`; a top-level section with no comparator
is `document.changed`. Both `lossy`, because a change nobody examined must not be
called harmless — `clearOnHide` is the example that settles it, since it decides
whether a hidden field's answer survives and nothing compares it by name. They are
also the part that survives the format growing: a section added to `FormSchema` and
forgotten is reported rather than ignored. A test asserts that **no** edit in the
suite's table reaches either backstop, without which one catch-all would satisfy
"never silent" while classifying nothing.

**A declared rename now carries its rules along.** `renamedFrom` promises a rename
costs the data nothing, and the builder rewrites the expressions that referenced the
old path in the same edit — so the first version of the rule comparator reported the
rewritten expression as a rule that "says something else now", and the promise held
for the fields while breaking on their logic. Caught by `builder-core`'s own test, not
by this package's. The before-side is now read as though the renames had happened, by
textual substitution on path boundaries: `@formancy/spec` is below
`@formancy/expressions` in the layering and carries no CEL parser, and what makes that
safe is the direction — a substitution that is wrong produces an expression that does
not match, so the rule is reported as changed. Only an exact match is read as "this
followed a renamed field".

**What an integrator will notice.** Nothing is newly refused: only `breaking` makes a
draft read-only, and nothing new is breaking. What changes is that a draft resumed
against a version where only a rule, an option or a bound moved now rebinds **with a
migration report** where it used to rebind in silence — because the diff used to report
no change at all for those. Same data, same rebinding, and somebody is now told. The
same applies to `staleVersionPolicy: acceptCompatible`, which sees those versions as
lossy rather than as identical.

**Thirteen mutations, each watched to redden its own cases.** A fourteenth reddened
nothing and found dead code: a branch for a constraint arriving where there was none,
already answered by the check beneath it. Deleted rather than tested, which is what a
mutation that changes nothing means. One case had to be rewritten after a mutation
left it green — a changed `pattern` must count as stricter, and written with a new
pattern that sorts *before* the old one the generic comparison reached the same answer
by accident.

`@formancy/spec`'s barrel grew 4.3 kB brotli, from 9.7 to 14.0, recorded in arc42 §9.3
with the reason and with what the `exports` map does and does not do about it.
`diff.ts` split into `diff-fields.ts`, `diff-rules.ts` and the orchestration when the
size budget refused the additions at 694 lines
([0108](docs/decisions/0108-the-diff-reports-everything-that-changed.md), and
`SAFETY-ANALYSIS.md` E3, which described this failure as a residual and now describes
it as one that happened).

**A form shown in German asked its questions under English headings.** Reported from the
templates gallery: the HR onboarding template chosen in German rendered German field
labels under **Employee** and **Work setup**. Nothing was wrong with the document — the
section carries `label: { "$t": "section.1" }` and the German catalogue carries
`"section.1": "Mitarbeitende Person"`. Both renderers handed `resolveText` the
document's `defaultLocale` instead of the engine's, at every call site belonging to the
*arrangement* rather than to a field: section headings, group labels, a tab strip's
name, a code block's label. Three such sites in `@formancy/angular`, one in
`@formancy/react`. Field labels come through the engine and were right.

Measured across the starter collection: **every template in it** has at least one translated section heading, so every one of them rendered its headings in English in both German and French.

That is what let it survive. A form entirely in one language announces itself and a
reader who cannot read it stops; a form translated everywhere **except** its headings
looks finished, so the reader proceeds — and a heading is what scopes the questions
under it. `engine.locale()` already existed for this class of mistake, with a docblock
saying so; these call sites were never moved over.

**The suite could not have found it, and now can.** `MountOptions.locale` existed on the
driver interface, documented as something a driver "may ignore" — and both drivers
ignored it, never passing it to the engine. So no fixture could run in another language
and none did: the one i18n fixture is named *"renders in the default locale"*, with an
unused German catalogue sitting in it. Mounted in the default locale, a form in which
nothing is translated looks exactly like one in which everything is. A fixture may now
name its `locale`, both drivers honour it and resolve accessible names in it, and
`translated-mounted-locale.json` runs a conditional form in German under every driver.
`validateFixture` refuses a `locale` the document has no catalogue for, because the
fallback would make such a case pass against the source language.

**The first attempt at that gate asserted nothing, and the reason is worth keeping.**
Every lookup in the suite is by accessible name and the driver resolves that name
itself, so a driver that drops the locale mounts an English form *and* looks up English
names — it agrees with itself and passes. Reverting each driver's forwarding reddened
nothing. The fixture is a gate on the *renderer*, which is the shape a third-party
renderer would have; each driver now has a case of its own that mounts in German and
reads the German string **off the document** rather than through the driver. Five
mutations in all, each watched to redden exactly its own case, plus the two renderer
tests observed failing before the fix
([0107](docs/decisions/0107-layout-text-is-read-in-the-engines-locale.md), and
`SAFETY-ANALYSIS.md` D9).

**The site is one product again, because its second page was not.** `/templates/`
shipped with a design language of its own: a `#f6f8f3` ground and `color-scheme: light`
inside a dark site, `Inter` as its first font family — **loaded nowhere in this
repository**, so it was rendering in whatever face the visitor's machine happened to
have — `Georgia` where the site loads Fraunces, a violet of its own where the site's
violet and teal *mean* the browser and the server, pixels where the site is in rem, and
its own header, brand mark, navigation and footer. Reported as "the templates page does
not fit the style at all".

The fix is one shell rather than matching numbers. `apps/site/src/shell.css` holds the
tokens, the type scale and the backdrop; `apps/site/src/chrome.tsx` holds the bar, the
footer and the mark, and both pages render them. Copying the values across would have
made the two pages agree once; a component they both render makes them unable to
disagree, which is the question CLAUDE.md asks of any duplication. The navigation is one
list, so a third page joins every page's bar by existing, and the place it could be
forgotten no longer exists. `template-gallery.css` now contains **no colours at all** —
every one is a token ([0106](docs/decisions/0106-one-shell-for-every-page-of-the-site.md)).

A product whose whole argument is that your design system owns the markup cannot ship
two design systems of its own. That is why this is a changelog entry and not a tidy-up.

**And the hero opened on the wrong theme, in a dark studio.** `paper` — cream, serif,
editorial — was the first thing a visitor saw, inside a dark page, while the examples
section further down had defaulted to `dusk` all along: two halves of one claim about
theming, disagreeing about how to open. The gallery's preview was `paper` in a dark
dialog for the same reason. Both now open in the tone of the page around them, and the
switcher beside the hero is still what makes the point.

**The running submission stopped covering the form it reports on.** It is
`position: fixed` in the corner of a full-bleed page, and measured in Chromium at
1600px it sat 232×212 pixels on top of the live form and the JSON beside it — the one
place on the page somebody is actually clicking, hidden by the panel describing what
they clicked. The footer had been given clearance for exactly this; the examples band
now takes the same `calc(var(--gutter) + 15rem)`, on the band rather than on the page,
because a gutter on the page would move the hero sideways the moment the panel appeared.

**And the preview dialog had two submit buttons.** The renderer draws its own, and the
dialog had a second one underneath it doing the same thing — two controls, one action,
stacked, which was easy to miss while one of them was grey. There is now one, named
“Check answers”, reporting through `FormancyForm`'s `onSubmit`; the `<form>` around it
stays, because it is what keeps the radio groups to themselves and stops Enter
navigating out of the dialog.

**Both pages are now compared to each other in a browser, not to a literal.** The gate
loads `/` and `/templates/` from the composed build and asserts they agree on computed
ground, ink, body family, display family and bar, plus their navigation and their mark.
No constant says what the ground is, so changing the palette stays one change. Three
details are the whole value of it:

- **`font-family` as computed, which is the family each page *asks for*** — deliberately
  not what rendered. The gallery asked for `Inter` and got the system face, so comparing
  what rendered would have reported the two pages in agreement while one was wrong.
- **The sideways check is scroll*ability*, not `scrollWidth`.** The site sets
  `overflow-x: hidden` so the backdrop's auroras and the marquee's rails can exceed the
  screen on purpose, and with that set `scrollWidth` reports 348px of "overflow" on a
  page that cannot be scrolled sideways at all — a case that fails on the decoration and
  says nothing about the content. So instead: the page cannot be slid, and every control
  on it is inside the viewport. A control parked off the side is **asked whether focusing
  brings it back**, which is the skip-link pattern, rather than recognised by its class.
- **The theme cases assert relative luminance, never a theme's name**, and a second case
  switches to a light appearance and requires the measurement to change — without it the
  first passes on a page where nothing is themed and every surface reads as the same
  transparent black. Green while asserting nothing is how a guard here has failed twice.

**Thirteen mutations, each watched to redden the case it belongs to.** Seven against the
browser gate — the gallery's own ground, its `Inter` stack, its own navigation, the hero
on `paper`, an appearance switch that changes nothing, the examples band without its
clearance, and a card grid of three fixed columns — and six against the new
`chrome.test.tsx`. Each reintroduces the actual defect rather than breaking something
arbitrary. One of them found a trap in the test: the footer's version case first matched
`/packages \d+\.\d+\.\d+/`, which a typed `0.1.0` satisfies completely, so it now
compares against the version read from `package.json`.

`site.css` lost 489 lines and `app.tsx` lost 87 to the shell, which fired the size
budget's ratchet and took `app.tsx`'s ceiling down with it — the ratchet pointing at
something real rather than a number being tidied.

**And the browser gate hung in CI for twenty minutes, which is a flaw in the gate.**
`playwright install --with-deps chromium` ran `apt-get` for Chromium's system libraries,
and the hosted Ubuntu runner already ships them — so with the browser restored from cache
in five seconds, the step then sat on apt for 19m30s until the job's timeout cancelled it.
The same step had taken 66 seconds the run before. `--with-deps` is gone and the step
carries a five-minute timeout: a gate that depends on an apt mirror depends on somebody
else's uptime, which is the trade this repository refuses elsewhere, and a missing library
now fails loudly — Chromium refuses to launch and the script prints the command to run.

Worth recording for a second reason: `gh run watch` exited **0** for a run whose `browser`
job was CANCELLED. The repository's rule is to confirm a run's conclusion in a separate
query rather than trust the watcher, and this is the second time that rule has earned its
place.

**The coverage report read, which CLAUDE.md asks for and nothing had done.** 93.5% of
lines and 81.3% of branches across 221 files, measured per file out of the lcov rather
than from the terminal reporter — which interleaves across eighteen packages and makes the
one thing the policy asks for hard to do. Now **94.3% and 81.8%**, with no file at 0% and
none below 69%. The figure moved a little; what it bought is elsewhere.

**`builder-core/src/logic.ts` went from 46% of its lines to 100%.** The weakest file in
the repository, in the core *both* builders read. `referencedMessages` was **entirely
untested** — the function that decides the order a translator meets the questions in, with
a docblock arguing that the order is load-bearing because "a translator works down a list
and meets the questions in the order somebody filling the form does". Nothing would have
noticed that order changing. Four other exported functions were uncovered too, each with a
fallback that turns a wrong name into a plausible-looking rule.

**The catalogue round trip, in both translation panes.** At 61% and 70%, and the uncovered
block in each was the download and the upload — the plumbing a translator touches, and the
plumbing that can silently do nothing: a button that builds a blob and never clicks looks
exactly like a working download. Both panes name the file, choose the accepted types and
report a bad file *independently*, so this is where the pair can diverge without anybody
finding out. Now asserted in both, including that an unreadable file is reported rather
than swallowed — the handler catches inside a promise, which is the shape that swallows an
error the moment the `catch` is dropped.

**The link-preview card was at 0%, and it exists because one went stale.** Its own docblock
records that the previous card "outlived two rewrites of the headline before anybody
noticed it still read *One engine, in the browser and on the server*". The fix was to build
it from the same renderer as the page — and then nothing checked that the words still
matched, which is the half the story was about. **The card's headline is now derived from
both sources and compared**: a rewrite of one without the other fails. Proved by rewriting
the card's and watching it name both.

Also covered: the theme editor's colour picker and download (77% → 100% of lines), the
scale controls' `touch()` lines — an untouched field shows no error, so a control that
never touches is one whose own message never appears — and the temporal controls at 67%,
including the branch that writes `null` for input it cannot parse. That branch keeps the
stored answer always empty or canonical, which is what the engine's shape check assumes,
and `earliest`/`latest` compare strings: a half-typed datetime reaching the answer would
make the bound comparison succeed or fail against something that is not a datetime.

**Two guards came out of it that are not about coverage.** The Monaco theme the Schema view
asks for is now asserted to be the one that gets defined — two places claiming one string,
and if they disagree Monaco falls back silently, with no error and the wrong colours. And
`apps/docs/src/content.config.ts` is excluded from the measurement as a framework config
with the composition-root argument, with a test that the reason is true: no branches, no
functions, under twenty lines. An exclusion nobody checks is an escape hatch.

**One finding fixed:** `editor-pane.tsx` memoised Monaco's options and then did not use
them — the extraction left an inline literal, so the memo was dead and the editor
reconfigured on every keystroke. An unused local is not a failure, which is exactly why it
survived a green suite; the coverage report is what showed it.

And the type checker corrected four assumptions in one new fixture: a form's `title` is a
plain string and is **not** translatable, there is no `hint` property, a section's text is
`label`, and a layout is addressed by `name`. An `as never` would have hidden all four and
left a test asserting an order over properties that do not exist.

**Start with a form whose examples run.** The starter collection covers HR, sales,
customer service, events, operations and healthcare administration. Each plain JSON
form carries English, Swiss High German and French text, its layout and rules,
a fictional sample and executable scenarios. They use frozen spec 2 and no external
services. The dedicated `/templates/` page offers search, area filters, translated local
previews and direct JSON downloads. Its edit links open the selected document
and language in the playground. Both read the same files, so the document an
integrator copies is the one the previews demonstrate. Schema checks alone missed a
string-to-timestamp comparison in the birth-date rule; running its sample found it.
The gallery accepts only its three supported language values and encodes editor-link
parameters. An unexpected DOM value previously crashed translation lookup; a regression
test now verifies the gallery and both editor links retain the last valid language.

**The two previews now own separate native forms.** Loading a template and choosing a
radio option revealed that the Angular and React controls shared a browser radio group:
the ids differed, but the names and form owner did not. React reported a mixed-framework
radio group and a selection could uncheck the other preview. Native form boundaries
isolate them; preview submission is prevented so Enter cannot navigate away.


**The Schema view was broken, and the cascade did it again.** Reported as "the schema view
is broken", and what was broken was the theme editor bleeding into it: `hidden` hides an
element through `display: none` in the user-agent stylesheet, and **any** author `display`
beats it. `.pane.editor > .body.theme { display: flex }` matched at the same specificity as
`.pane .body[hidden]` and came later in the file, so the theme body was rendered in every
mode — measured in Chromium: `hidden: true`, `display: flex`, **349px tall** inside a pane
with 321px of room. Scoped with `:not([hidden])`. Third cascade defect in that one file in
a week, after the pane template shadowing a media query and `touch-action` living only in a
theme, so `pnpm test:browser` now asserts that exactly one editor body is on screen per
mode — and that check was proved by reverting the fix and watching it name the overlap.

**Spec version 4 is open, with two widgets and a property.** `widget: "rating"`,
`widget: "slider"` and `step`, all on `number`.

**Widgets rather than types, and the test is the answer shape.** A rating is a number
between two bounds and so is a slider, so both are a `number` field wearing different
paint: a version 3 reader given one renders a number input, collects the same answer, and
is wrong only about how it looked. An NPS question is `rating` with `min: 0` and
`max: 10` — giving that its own construct would have been giving one spelling of one scale
a place in a frozen format. `ranking` and `matrix` are **not** here for the same reason
these two are: each stores an answer no existing type holds, so each is a type, and four
constructs at once would have been four at the quality of two
([0104](./docs/decisions/0104-spec-4-opens-with-a-widget-not-a-type.md)).

**`step` is a field property, not widget configuration**, and that is the load-bearing
choice: a slider is presentation and the server never sees one, so a stepped scale
configured in the widget would be enforced on the client and not on the submission. It is
counted from `min` when there is one, so `min: 2, step: 5` is a scale of 2, 7, 12. And the
engine compares with a tolerance rather than a remainder, because
`0.30000000000000004 % 0.1` is `0.09999999999999998` — a slider at 0.3 with a step of 0.1
would otherwise report an invalid answer that the control itself produced.

**A rating is a radio group, not a row of buttons.** Eleven buttons are eleven tab stops a
screen reader announces as unrelated controls; a radio group is one stop whose arrow keys
move along the scale. It is named with `aria-labelledby`, because a `label[for]` names a
form *control* and a `role="radiogroup"` is not one — in React the group rendered with no
accessible name at all until that was found. A scale with no `min` and `max` falls back to
the plain number input rather than inventing 1–5 or 0–100, and a slider tells the engine
nothing until it is moved, so `required` still bites while the read-out shows where the
thumb is.

**The read-out is a `<span>`, not an `<output>`** — `<output>` carries an implicit
`role="status"`, so every step of a drag would be announced on top of the value the range
input announces itself. The playground's own "every control has an accessible name" guard
found that.

**Version 4 says it is open, everywhere that matters.** Every other version's section in
`MIGRATIONS.md` says FROZEN; this one says OPEN, and `SOUP-DECLARATION.md`,
`MDR-CONTEXT.md` and `SAFETY-ANALYSIS.md` now each state that a deployment pinning version
4 is pinning a format that may still gain constructs. One of those paragraphs still said a
fix "belongs to a version 3 discussion", which stopped being true when 3 froze.

**And the themes guard had been checking 44% of the theming contract.** `emittedParts()`
read only the top level of each renderer's `src`, and every control lives in `src/fields/`
— so the scan saw **36 of 82** parts, missing `label`, `error`, `field`, and every part of
the file field, the rich text editor, the signature, the tag picker and the typeahead. The
guard that holds this project's central product claim passed because it was looking in the
wrong place. Fixing it cost almost nothing — all 46 were already styled by hand in all four
themes — and a mutation run *cannot* catch this one, because a guard that checks fewer
things cannot fail: it is held forwards instead, by naming parts that exist only in a
subdirectory.

Three files were split and the budget was right each time: `types.ts` gave up the layout
vocabulary, `validate.ts` gave up the version gate, and the playground's `app.tsx` gave up
its editor pane. The React barrel grew 1.1 kB to 21.1 kB, re-measured in §9.3 — the fifth
data point in a pattern that file now records.

**A visual theme editor, and it reads the theme rather than the other way round.** The
playground's editor pane has a third mode beside Build and Schema: every design token the
applied theme declares, with a control each, a live form beside it, and a CSS patch to take
away.

**The controls are discovered, not written down**, and finding out why took one
measurement. The four shipped themes **do not share a token vocabulary** — `blueprint` has
`--fm-ink`, `--fm-paper`, `--fm-chrome`, `--fm-rule`; `dusk` has `--fm-ground`,
`--fm-raised`, `--fm-inset`, `--fm-edge`; `pop` has `--fm-yellow`, `--fm-pink`,
`--fm-lift`. Five names are common to all four. That is deliberate: they are different
design languages rather than palette swaps, because that is what falsifies the headless
claim. So a fixed set of controls would have been wrong for three of the four, and making
them fit would have meant flattening the property that makes them worth shipping. Reading
each theme's own declarations has a better side effect: **it works on a theme you wrote**,
with no registration step ([0103](./docs/decisions/0103-a-theme-editor-edits-what-a-theme-declares.md)).

A theme-level token is one declared on the theme's own selector and nothing narrower —
the shape of the selector, not a list of names to exclude. Measured: `blueprint` declares
fourteen `--fm-*` properties and two of them are `--fm-columns` and `--fm-datagrid-count`,
set on `[data-columns='3']` so a layout can read its own column count. A control for those
would be a control that breaks the grid. Fifty-eight such declarations are rejected across
the shipped themes.

An override is a **custom property set inline on the host**, never a resolved
declaration — the lesson from the pane template. The value a control opens at comes from
`getComputedStyle` rather than from the rule, because what a rule declares and what the
browser resolved are different questions and `dusk` declares one token twice. What comes
out is only what you changed: a patch that keeps inheriting, not a fork that pins every
value.

**Three mutations survived the first run, and each produced a change rather than an
assertion.** Clearing a field snapped it back to the theme's value, so clearing and
retyping appended — `#17222e` became `#17222e#ff0000`. The baseline was readable through
an override, so resetting after a theme switch would have returned to the edited value
rather than the theme's. And a filter before setting the style was **inert**: CSSOM
discards a whitespace-only custom property and trims a padded one by itself, measured in
jsdom and in Chromium, so that call is gone rather than left looking load-bearing.

**And CI now limits its token to reading, which the new job is how we found out.**
`ci.yml` had no `permissions` block at all, so every job took the repository's default —
and CodeQL had been reporting one `actions/missing-workflow-permissions` alert per job for
three jobs. Adding a fourth turned those into a *failing* check on the pull request that
added it, which is the gate doing its job rather than a nuisance. One `contents: read` at
the top fixes all four: nothing in this workflow writes to the repository, since the
coverage upload authenticates with its own token and the caches are the runner's.

`pnpm test:browser` carries the half jsdom cannot judge — that an override reaches a
rendered control's computed colour, and that resetting gives the theme back. `app.tsx`
went over its ceiling again and the editor pane left with its Monaco palette; the budget
was pointing at something real both times, and that file's ceiling is down from 582 to
547.

**A gate that can see CSS.** Two defects shipped in one week through every gate this
repository has — an inline style that outranked a media query, costing 187px of sideways
scroll at an 820px viewport, and a `touch-action` that lived only in the shipped themes,
so signing with a finger panned the page. Neither was a coverage gap. **jsdom applies no
CSS, resolves no media queries and performs no layout**: every box measures zero and every
cascade question has no answer, so no number of additional cases in that environment could
have found either.

`pnpm test:browser` loads the site `build:web` composes — over HTTP, in Chromium, not a
dev server and not a component — at a phone, a tablet in both orientations and a laptop.
It asserts that nothing scrolls sideways, how many columns the pane row *computes*, and
the computed `touch-action` of **every** signature surface on the page with the theme
present and removed. Both renderers, because the playground renders one schema twice and
the first version of the gate used `querySelector` and checked React alone. One positive
assertion among the refusals — a pointer drag must record a stroke — because a surface
that refused every gesture would satisfy all the others.

**The evidence is not that it passes.** Both defects were reverted, rebuilt and watched
to redden it, as was the touch fallback behind the second
([0102](./docs/decisions/0102-what-jsdom-cannot-see-is-checked-in-a-browser.md)).

**Deliberately not screenshots.** The renderers ship no styling, so a pixel baseline would
be testing demo CSS — and a baseline is a file somebody updates when it goes red, which
makes it the one kind of assertion that gets quieter the more often it fails. What the two
defects actually were is a computed property, a column count and an overflow in pixels.

Its own CI job, so the name in the pull request list says what is wrong. And three
statements in the regulatory set became wrong the moment it landed, corrected in the same
change: `SAFETY-ANALYSIS.md` and `SOUP-DECLARATION.md` both said no test here can ask
where a box is, and one of them also said no application renders the Angular bindings in a
browser — which the playground had already made false. What stays true is written down
beside it: one engine rather than Safari, no pixel baselines, and four viewports of one
demo schema rather than the conformance suite.

**Two stale claims, found by a reader rather than by nineteen guards.** Somebody compared
this repository against a competitor's feature list and hit both in the places a visitor
actually reads.

The README said *"The visual editor is built in React"* — true until the Angular builder
shipped, and then false in the one-line summary near the top, three paragraphs above the
section that says both builders exist and share a core. It gave away the single thing this
project has that the obvious commercial comparison does not: an Apache-2.0 **Angular**
builder. And the roadmap listed `toggle` in a table headed *Field types that are not here
yet*, unstruck, while the widget had been in the spec since version 2 with a control and a
test file in both renderers.

Both are the shape `claims.test.ts` exists for — a sentence that was true when written, is
false now, and changed nothing in any diff — and neither was covered: the existing cases
guard the roadmap's *what comes next* list and the playground's mounts, not a table of
names or a summary paragraph. Two new guards, both derived rather than matched:

- **No document says the editor is built in one framework while two packages build it.**
  The framework list comes from `packages/builder-*`, so a Vue builder would fail the
  sentence until it was updated. With a positive half beside it — the README must name both
  builder packages — because the first case is satisfied by a document that says nothing.
- **The roadmap lists nothing as missing that the document schema defines.** The vocabulary
  is walked out of the schema, so the next reserved name to ship cannot sit there quietly.

That table's every row is now struck through, so the heading no longer claims they are
missing. The guard on the guard pins one name per spelling the walker has to handle rather
than a count — a count was the first version and let a real mutation through, because
dropping the field types still left twelve widgets and layout kinds above a `> 10`
threshold.

**The signature control could not be signed with a finger.** Reported from an iPad: the
page scrolls while you sign. A touch drag on a drawing surface is ambiguous — signature
or pan — and `touch-action` is how an element says which; the browser resolves it in the
compositor *before* the first event reaches any handler, so nothing in JavaScript can take
it back.

**It was declared only in the four shipped themes**, which is why drawing worked
everywhere the demo was looked at and nowhere else. Measured in Chromium with the theme
attribute removed from the host: `auto` on the surface, inside a pane whose own `overflow`
is `auto`, so a finger pans the pane instead of signing. Anybody using a renderer with
their own design system — which is the consumer this project is built for — had a field
that could only be completed by typing.

Both renderers now declare it on the element, and that draws a line worth stating:
**a control owns what it needs in order to work, a theme owns how it looks**
([0101](./docs/decisions/0101-a-control-is-operable-without-a-theme.md)). The test is not
whether a property is CSS but whether removing every stylesheet leaves a control a person
can still operate. The surface's height, border, background and cursor are still the
theme's; the themes gave up their `touch-action` copy, because an inline style outranks
every author rule and a dead rule that looks load-bearing is worse than none.

Each control also cancels `touchstart` and `touchmove` on the surface itself, for a
browser that did not honour the property — **the device this was reported on cannot be
driven from here**, so the primary mechanism is verified and this covers the case that is
not. Only the surface cancels: both suites assert a touch on the text input beside it is
left alone, because cancelling on an ancestor would trap the page, which is a worse bug
than the one being fixed. Recorded as hazard **D4c** in `SAFETY-ANALYSIS.md`, with the
part that stays open — nothing enumerates which properties are operability rather than
appearance, so the next control to need one can repeat this.

**The playground was broken on an iPad, and on every screen narrower than 64rem.**
Folding a pane away composed the grid template in the component and set it with an
inline `style`, which outranks every rule in the stylesheet — including the
narrow-screen override asking for a single column, which had been correct until
something started shadowing it. Measured in Chromium at an 820px viewport: the row
demanded 992px, the page scrolled sideways by **187px**, and the one visible pane was
304px wide inside an 820px screen. At 390px the overflow would be 602px.

It shipped, it passed every gate, and it was reported by somebody using an iPad. No
test could have seen it — jsdom applies no CSS and resolves no media queries, so the
cascade this depended on does not exist in the suite. The template now arrives as
`--pane-template` and the declaration that reads it stays in the stylesheet, where the
media query can still beat it; a test asserts the row sets nothing inline but custom
properties, which is the structural version of the same fact
([0100](./docs/decisions/0100-a-pane-boundary-is-dragged.md)). Recorded against hazard
D4a in `SAFETY-ANALYSIS.md` as its third instance, and the first with a gate rather
than a proxy.

**And the boundary between two panes can be dragged.** Folding is blunt — a pane is
open or it is a strip — and neither is what you want while writing a schema, where the
editor should have two thirds of the row, or while filling the form in, where it should
have a quarter. Each adjacent pair of open panes now has a `separator` between them:
drag it, nudge it with the arrow keys, Home and End for the ends of its travel,
double-click to put it back. A folded pane gets no handle, because there is nothing to
resize and a handle that cannot move is a tab stop announcing a value nobody can change.

The keyboard path is not an afterthought: a drag with no keyboard equivalent fails WCAG
2.2 SC 2.5.7. The handle is 12px wide against SC 2.5.8's 24, which is met through the
spacing exception rather than by size — it runs the full height of the row with nothing
else within 24px — and it declares `touch-action: none`, or iOS claims the gesture for
scrolling and the feature works on a trackpad and is absent on the device it was asked
for.

**Two things measurement contradicted.** A comment claimed the pane on the far side of
the row never moves; in fractions that is true, and in pixels it is not — once one of
the pair reaches its `minmax` minimum the grid redistributes what is left, and dragging
the Editor/Form handle 160px right pulled Engine from 353px to 304px. And rounding a
fraction *after* clamping it moved the stop, so a floor of 0.3125 came out as 0.312,
half a thousandth below the value being enforced. Both were found in a browser, neither
by the suite.

**The coverage report says which package moved, and gates nothing.** There was no
`codecov.yml`, so Codecov applied its defaults — a `project` and a `patch` status against
an `auto` target, which is a *failing check* when the number drops. That is a threshold
nobody chose, in a repository that has argued twice in prose against having one, and the
prose was losing. The comment on #145 read ":x: Patch coverage is `87.87879%` … Please
review": a red cross on a reported number, five decimal places of precision for a line
count, and no indication which of nineteen packages the lines were in.

Every status is now informational, precision is one decimal rounded down, and there is one
component per package that measures coverage — so the comment names the package instead of
averaging it away ([0099](./docs/decisions/0099-coverage-is-reported-per-package-and-never-gated.md)).
The file is **generated** by `scripts/codecov-config.mjs` from the manifests, because a
component list typed by hand goes stale the way the publication checks did, and the symptom
is absence rather than error: the package is not reported wrongly, it is not reported.
`codecov.test.ts` fails when the committed file is not what the generator produces, and
names the command.

Checked against Codecov's own validator before committing, because an invalid
configuration is ignored silently and falls back to exactly the defaults this replaces —
which would have left the change inert and the record describing something that never
happened.

**`packages/themes` declared `"scripts"` twice, so three of its scripts were dead.** Found
by a mutation that did nothing: a case was being proved by giving themes a `test:coverage`
script and watching a guard fail, and it did not fail. JSON keeps the last of two
duplicate keys without complaint, so `build`, `test` and `typecheck` had been silently
ignored since a comment was moved out of that block — harmless only because all three were
`echo`. No tool reports this: pnpm and turbo read the parsed object and a formatter leaves
both keys alone. The blocks are merged, and `published-packages.test.ts` now reads the
top-level keys of every manifest as written and fails on a duplicate, with a case asserting
that what it reads matches what `JSON.parse` sees — because six guards here have had their
own regular expression as the defect.

**The contributor agreement is checked on every pull request, not only stated.**
[0069](./docs/decisions/0069-contributions-under-a-cla.md) decided a CLA a week ago and
wrote down the half it had not done: "a CLA nobody checks is a document in a repository."
That half is now here. [`CLA.md`](./CLA.md) is the agreement — adapted from the Apache
individual CLA, shortened, a copyright licence broad enough to sublicense, a patent licence
mirroring Apache-2.0 section 3, and **no assignment of copyright**.
`.github/cla/signatories.json` is the record, and signing is a commit under your own git
identity carrying the hash of the text you agreed to. `.github/workflows/cla.yml` reads the
commit authors of a pull request and names any it has no signature for.

No bot account, no token, no third-party service. The alternative — CLA Assistant — needs a
personal access token with write scope used by a third-party action under
`pull_request_target`, which runs with this repository's permissions against a fork's code;
for a project whose pitch includes a strict CSP and no third-party round-trips that was the
wrong trade, and a third-party action also cannot be mutated and watched to fail
([0098](./docs/decisions/0098-the-cla-is-checked-in-the-repository.md)).

Two refusals in the check are the point rather than details. It refuses a commit range it
cannot read, because `git log base..head` answering nothing is indistinguishable from an
empty range and both happen — a wrong base SHA, a shallow clone, a rebase that moved the
range — so reporting "nobody is missing" would turn each of those into a pass. And it
reports a signature recorded against text that has since changed as *stale* rather than as
absent, because the two ask the contributor for different things.

**And the section that said this was undecided said so for a week after it was decided.**
arc42 §11.5 still listed "CLA or DCO" under *Open decisions*, and it was found by somebody
asking what was open and reading that section instead of the decision records — so the
answer given was the stale one. A section called *Open decisions* is read as an answer,
which makes a settled question listed there worse than an absent one. `claims.test.ts` now
fails if a document calls that question open, derived from 0069's own status rather than
from how any sentence is worded; the paragraph recording the mistake says "CLA or DCO" in
order to say it is gone, which is exactly why the check reads the section's bullets and not
its prose.

**What the check cannot do is refuse a merge, and nothing here claims it can.** `main`
carries no branch protection rule, so no gate in this repository is mechanically required —
not this one and not CI. What stops a red check from being merged is a maintainer reading
it. New arc42 §11.6 records that, so a reader does not infer enforcement from the existence
of the gates.

**Each pane in the playground folds away by hand.** Three panes at once is right on a wide
screen and crowded on a laptop, and the existing answer — the switcher that shows one at a
time — only appears below 64rem. Between those two widths you got all three or you resized the
window.

A disclosure button in each pane's heading: the accessible name says which pane and
`aria-expanded` says the state, so a screen reader reads *"Engine pane, button, expanded"* and
the name does not change under somebody mid-sentence. Folded, the pane becomes a narrow strip
with its title turned on its side — the shape a collapsed panel has in every editor people
already use — and the grid gives its column back to the others.

**The body is hidden rather than unmounted**, which is the choice worth pinning: making it
conditional would tear down the Angular application the preview bootstrapped on every fold,
and lose focus and scroll position with it.

Two things the tests deliberately do not claim, because measuring said otherwise. They cannot
see the hide itself — jsdom applies no CSS, so swapping the hiding rule leaves them green, and
what they pin is that the body is still *there*. And the form's answers are not what
unmounting would cost: the engine is created above the pane, so even forcing a remount keeps
every value. The obvious comment to write there was the wrong one, and it said so for a while
before the mutation caught it.

Folding pushed `app.tsx` past its size ceiling, so two more things left for the seam that entry
already names: `engine-inspector.tsx` is the engine pane's contents, and `panes.tsx` holds which
panes there are, how wide each is and how to fold one — one subject, since the narrow screen
needs their names, the wide screen needs their widths, and folding needs both.

### What 0.4.0 knowingly does not have

`RELEASING.md` asks a release entry to say this, because the absence a reader discovers
for themselves is the one that costs them a day. Everything 0.3.0 listed is still true
unless it appears below; these are the ones this release adds or changes.

- **The renderers' own words are English.** Next, Back, Remove, the upload buttons, and now
  the ranking's *Move … up*, *Take … out of the order* and *Rank …* are written in each
  binding and have no catalogue. A German form asks its questions in German around English
  buttons; arc42 §11.2 carries it as debt.
- **The condition editor cannot compare one row of a matrix or ask what was ranked first.**
  It offers *is answered* for a matrix and *includes* for a ranking; anything finer is CEL,
  which the rules overview shows as CEL.
- **A ranking or a matrix may be answered in part unless the author says otherwise.** A
  ranking needs `minItems` set to its number of options to demand a complete order; an
  optional matrix accepts some rows answered. A required matrix needs every row.
- **A ranking has no drag.** Its buttons are the control; moving the last of eight options to
  the top is seven presses.
- **CSV exports a ranking and a matrix as JSON in one column each.** A column per position or
  per row is not built.
- **A block is a copy, and nothing stores one.** Changing a block changes no form that used
  it, and neither the admin nor the server has anywhere to keep blocks; a host keeps them.
- **The Angular builder's appearance is measured in the playground and the Angular starter
  only.** The admin is React, so nothing a deployment ships exercises the Angular builder.
- **The SurveyJS comparison on formancy.ai/angular-form-builder is dated, not checked.** It
  says what SurveyJS's own pages said on 9 October 2026, and re-reading them is a person's
  job.
- **The freeze check covers field types and widgets, not properties or rule kinds.** Those are
  gated construct by construct; a new one added without its gate would be caught only by a
  test somebody wrote for it.
- **No spec version is open.** The next construct that changes what a document may say costs
  a version 5, with its migration note and an upgrade for every pinned reader.

## 0.3.0 — 2026-10-04

**The first release since `0.2.0`, and it freezes spec version 3.** A document written
against version 3 will validate against every future release that speaks it.

It is a long entry because the version was prepared on 2026-09-29 and then kept moving:
the spec-3 freeze is the oldest thing in here and sits at the end, with everything that
followed above it. Nothing was published in between — npm went straight from `0.2.0` to
this — so there is no `0.3.0` anywhere that means something narrower.


**The Angular packages were going to publish without their licence, and the release could not
be cut.** Found by running `node scripts/verify-licenses.mjs`, which is what `RELEASING.md`
asks for before a tag: it exits 1 with *"@formancy/angular: no LICENSE where it packs from"*
for both Angular packages.

The cause is turbo cache semantics. `sync-licenses.mjs` writes LICENSE and NOTICE wherever a
package packs from, and for those two that is `dist` — which is also `turbo.json`'s cached
output for `build`. So the files were written *after* the build task finished, were never part
of its cached outputs, and **any later execution or restore of that task removed them**.
Measured: two files in `packages/angular/dist` after `pnpm build`, zero after
`turbo run check:pkg --force`, because `check:pkg` depends on its own `build`.

Not academic. The release workflow runs `check:pkg` at step 89 and the licence gate at step 93,
so the gate fired and the release stopped — every time. The gate was right and the timing was
useless: Apache-2.0 §4(a) requires the licence to travel with the work, §4(d) the NOTICE, and
`npm publish` ships a tarball with neither quite happily.

The licences are now copied **as part of the build**, so they are a build output — cached with
everything else and restored with it. Verified in the three cases that matter: a forced build, a
forced `check:pkg` that re-runs build, and a pure cache restore with `dist` deleted first. The
root script still handles the fourteen packages that pack from their own directory, which turbo
never touches.

**And the check is a pull-request gate now, not only a release one.** It ran at the last
possible moment, which is how a defect that blocks every release sat there unnoticed.

The two `finalize-dist.mjs` scripts became one `scripts/finalize-angular-dist.mjs`. They were
byte-identical apart from a package name — one decision in two places, where the next change
lands in one of them and nobody finds out, because each package only ever runs its own.

**No module imports its own package name any more, and a test says so.** Found by running the
gates with turbo's cache off: `turbo run typecheck --force` failed in `builder-core` with three
`implicitly has an 'any' type` errors about a type declared in the file next door.

The cause is a one-line import. `tree.ts` took `Location` from `@formancy/builder-core` — its
own package — which resolves through the barrel to that package's own `dist`. But
`turbo.json` has `typecheck` depend on `^build`, the builds of a package's **dependencies**,
not its own, because a package's own `dist` is output rather than input. So the file's
typecheck needed a build the task graph never promised. With a warm cache the dist is already
there and everything passes; forced, it raced its own build.

CI survived it by accident — `pnpm build` and `pnpm typecheck` are separate steps there. A
gate that holds for a reason nobody chose is one line from not holding, so the import is now
relative and `published-packages.test.ts` fails on any self-import, anywhere in the workspace.
It was exactly one, repo-wide.

*That guard's own first pattern was wrong,* and the mutation is what caught it: built in a
template literal, `\s` is an unrecognised escape and quietly becomes `s`, so it matched
`fromsomething` and nothing else. Putting the self-import back left it green. It is built from
a plain string now, and the note says why — the eighth time here the defect would have been a
guard's own regular expression, and the first caught before it shipped.

**And a confusing failure got a cause attached.** `bundles.test.ts` measures built output, so a
missing or half-written `dist` makes the figure wrong and the test blames §9.3 for drifting —
sending somebody to edit the document when what they needed was `pnpm build`. Seen twice: once
in CI before the build step existed, and once under a forced parallel rebuild where a package
`apps/docs` does not depend on was still writing its dist. It now says which.

**`pnpm test:e2e:install` packs the packages and installs them into a project that knows
nothing about this repository.** Fifteen tarballs, a plain npm project, `tsc` with
`skipLibCheck` **off**, run under Node, then built with Vite. It is a new CI job beside
`container`, and it takes about twenty seconds.

**Every other gate is blind to this by construction.** `build`, `typecheck`, `test:coverage`
and `check:pkg` all run inside the workspace, where a sibling resolves a package through a
symlink to its *source* directory — so an `exports` map that is wrong for a real consumer can
be right for every test here. Not hypothetical: `@formancy/builder-angular` had no `exports`
at all for four releases, and its own ninety-five tests could not see it because they import by
relative path, while `publint` read the manifest ng-packagr generates.

Broken three ways to prove it works:

- an entry point removed from `exports` — caught in **three** places, including inside two
  other packages' published declaration files, which only `skipLibCheck: false` reveals;
- an `exports` path pointing at a file the tarball does not contain — `ERR_MODULE_NOT_FOUND`
  at runtime, which no static check would have reached;
- a runtime assertion inverted — the Node step fails, so the assertions genuinely run.

Two packages are outside it, with reasons: consuming `@formancy/angular` or
`@formancy/builder-angular` needs the Angular build toolchain rather than an import, so a
project importing them is an Angular project — and `apps/playground` is that project, building
both from the workspace on every run. `@formancy/server` and `@formancy/mcp` are applications;
the `container` job starts the server image.

**What it still does not do is talk to npm.** A release that packed differently from
`pnpm pack` would slip through, and nothing revisits a version once it is published. That is a
much smaller gap than the one this closes, and the debt table and `LIFECYCLE.md` now say which
is which rather than describing the whole thing as unbuilt.

And the first CI run of it failed where the local run passed — which is precisely the trap
`CLAUDE.md` warns about. With `skipLibCheck` off and the program globbed as `*.ts`, tsc pulled
in the consumer's own `vite.config.ts` and type-checked **Vite's** Node-flavoured declarations,
failing on `Cannot find name 'Buffer'`. Adding `@types/node` would have made it pass and made
the program less like a browser consumer's; naming the two consumer files instead leaves
nothing for npm's resolution to vary. The consumer's build config was never what was on trial.

The fixture is real files under `scripts/install-fixture/` rather than strings in the runner.
It began as a template literal and three layers of escaping — a backtick inside a template
literal inside a script edited by a script — broke it twice before it ran once. A fixture that
can be opened and type-checked in place is also one somebody can extend without reading the
runner.

**Every published package is now checked as a package, to one standard.** Counting found
three that were not: the two Angular packages ran `publint ./dist` with **no `attw` at all**,
and `@formancy/themes` ran nothing. Twelve of fifteen ran `publint && attw`; three were on a
weaker check for no reason anybody had written down.

`attw` is the tool that answers *"do this package's types resolve for a consumer"*, which is
one question away from the defect that prompted the look — `@formancy/builder-angular` shipping
with no `exports` at all.

**The Angular pair's weaker check was an omission, not a constraint.** `attw --pack .` packs
the package directory, and `publishConfig.directory: dist` means what ships is `dist`, so the
plain invocation would have checked the wrong tree — which is presumably why it was dropped.
Pointed at `./dist` it works and passes on both. `@formancy/themes` keeps `publint` alone and
says why in its manifest: five stylesheets and no types, so there is nothing for `attw` to
resolve.

The ratchet is in `published-packages.test.ts` beside the consumer check: a published package
must have a `check:pkg`, it must run `publint`, and it must run `attw` wherever it ships types
— with the one exemption asserted to be genuinely typeless, so a package that grows types
cannot keep claiming it.

*Incidentally:* a `//`-prefixed comment belongs at a manifest's top level and **not inside
`scripts`**. Turbo requires every script value to be a string, and an array in there fails the
whole workspace with `package_json_parse_error` and no file name to go on.

**Every published library now has to be imported by something, by name.**
`@formancy/builder-angular` was unimportable for four releases — no `exports`, no `types` —
and nothing noticed, because its own ninety-five tests import `./builder` by relative path
and `check:pkg` lints the `dist` manifest, which ng-packagr writes correctly. The gap sat
between those two facts and only a consumer could fall into it.

So a published package with no workspace consumer importing it by name has never been
consumed the way a user consumes it, and that is now a test. `@formancy/server` and
`@formancy/mcp` are excused with reasons — nothing imports a server — and a package that
acquires a consumer has to come off that list rather than sit on it, the same ratchet the
size budget uses.

It is the cheap half of post-publish verification and does not replace the other: a workspace
sibling reads the *source* manifest, so this proves somebody imports the package, not that
the published tarball resolves. Installing the tarballs through a local Verdaccio is still
unbuilt and still the only thing that can see bundler and SSR breakage. The debt table says
both halves.

**And the guard's first version was wrong in the way this repository keeps writing down.** It
matched `from '<name>'` and reported `@formancy/themes` as consumed by nothing — a theme is
consumed for its *effect*, `import '@formancy/themes/blueprint.css'`, which has no `from` in
it, and a stylesheet reaching one writes `@import`. Seventh instance of the guard's own
regular expression being the defect; `CLAUDE.md` now counts it, and the case that caught it is
named in the test so the pattern cannot narrow again.

**A publish can now warn.** `POST /forms` returns `warnings` on its `201` when there is
something worth telling the publisher that is not grounds to refuse, and the admin shows it
under the version it created rather than as a failure. Today there is one kind: a rule whose
condition reads a data path the model does not define.

**The gap was smaller than the roadmap said, and measuring is what established that.** The
residual paragraph claimed such a document "can be published and nothing refuses it". Not so:

| What the rule reads | At publish |
| --- | --- |
| an unknown **root** — `gone == "8000"` | **refused**, `invalid_logic` |
| an unknown member of a group — `address.nope` | published, **warned** |
| an unknown member of a row — `item.nope` | published, **warned** |

An unknown root has always been fatal, because the engine compiles each rule against
declarations for the fields that exist. What gets through is everything deeper, since a member
of a `map` is `dyn`. That paragraph was written from reasoning rather than from a run, and it
was wrong in the direction that **under-claims the software's own safety** — a manufacturer
reading it would have built a check they did not need and missed the two they did. Both tables
that now state it are parsed and driven through a real publish by
`apps/docs/src/unknown-path-table.test.ts`.

The two that get through are also the ones that matter, because a grouped path is exactly where
a rename leaves a rule behind: inside a group the data path and the field's own key differ.

**Warning rather than refusing is the decision, not a half-measure.** Tightening what a reader
accepts would make documents valid today invalid tomorrow, and published spec versions are
frozen. A form published last year would stop opening in the builder, which is the worst
possible way to deliver this news.
[0097](docs/decisions/0097-a-publish-may-warn.md) has the alternatives, including why not a new
spec version and why not at render.

**If you want a gate, the `201` is the hook** — fail your deploy when `warnings` is non-empty.
Nothing in formancy does that for you, and `SAFETY-ANALYSIS.md` B1a says so as the main
residual rather than a footnote.

Two things fall out of it. The admin's two panes stopped wording success differently — they had
drifted to *"published as v4"* and *"Published version 4."*, the same fact in two voices, which
nobody using one tab could see; `publishProblem` already existed for that force on the
refusals, and warnings made it a component. And `@formancy/core` is now **17.8 kB brotli
against an 18 kB budget**, because the check lives in the lowest layer that can see both the
spec's model and the expression walker. No browser runs it. §9.3 says so, and says the next
thing added there should either be under 0.2 kB or arrive with a decision about splitting the
barrel.

**And the React suites were on a timeout nobody chose for them.** `packages/react`'s wizard
conformance case failed at **5,618ms** against vitest's 5-second default; it measures ~630ms
locally, so that is a factor of nine on a loaded runner. This is the same defect the Angular
suites hit — the fix then moved four suites off the default and left the React side on it. Now
every suite that mounts a real tree shares one `RENDER_TIMEOUT_MS`, declared once in
`vitest.coverage.ts` with the measurements beside it, because eight copies of a number drift
until nobody can say what it was chosen for. A timeout is there to catch a hang; speed is the
performance gate's job.

**Both Angular packages are now mounted, and the Angular builder shares the React builder's
session.** The playground's Build pane has a chooser — React or Angular — over the *same*
`BuilderSession`. Make an edit in the Angular tree, switch back, and undo it: the document, the
undo stack and both rendered forms are one set of things.

That is a stronger demonstration than the renderers'. The two renderers get an engine each,
because element ids are minted per engine and two over one schema collide
([0095](docs/decisions/0095-one-schema-two-renderers.md)). The two builders share one session,
because a session *is* the document — so an edit in either appears in the other, and neither
knows the other exists. It is
[0091](docs/decisions/0091-a-second-builder-is-a-binding.md)'s claim as something to do rather
than something to read.

**Mounting it turned up why that had been easy to leave: `@formancy/builder-angular` could not
be imported from anywhere in the workspace.** Its manifest carried no `exports` and no `types`,
and `publishConfig.linkDirectory: false` means a sibling resolves the package directory rather
than `dist` — so there was nothing for TypeScript or a bundler to find. `@formancy/angular` has
carried both fields all along.

Its own ninety-five tests never noticed, because they import `./builder` and friends by relative
path, and `check:pkg` runs `publint` against `dist`, whose manifest ng-packagr generates
correctly. The gap sat between those two facts and only a consumer could fall into it. There is
now a consumer, and a guard reads the manifest.

Two smaller decisions, both forced. The session and the current tab reach the Angular
application **through the injector** rather than as `input()`s: `bootstrapApplication` runs
change detection before it returns, so a template reading an `input.required` that nothing has
set yet throws during the bootstrap. And the chooser is a labelled select rather than a third
pair of pressed buttons — the tabs pick a part of one product, this picks which product.
[0096](docs/decisions/0096-two-builders-one-session.md) has the rest, including why the two
builders are not shown side by side the way the renderers are.

The builder pane moved to `builder-pane.tsx`, which is the seam `app.tsx`'s size ceiling already
named: 693 lines to 598.

**One schema now renders in React and Angular side by side, in the playground.** The project's
founding claim is a headless engine that is genuinely framework-neutral, and it was
demonstrated nowhere: both Angular packages were complete, published, and mounted by no
application, so parity was a result in two jsdom suites that had never seen each other.

The landing page and this repository's README have both been telling people they could
*"preview your form in React and Angular"* in the playground. That was not true. It is now,
and there is a guard deriving it from what the page actually mounts so it cannot quietly stop
being true again.

**`createFormEngine` takes an optional `formId`**, because putting them on one page needed
something the engine could not express. Element ids are minted as `f:{formId}:{path}:{part}`
from `schema.id`, which is what makes them deterministic and SSR-stable — so two engines built
from one schema mint **identical** ids. Measured.

And the consequence is worse than two elements sharing an id, which was also measured: with
both engines on one form id, every control in the second renderer **loses its accessible name
altogether**, because `<label for>` resolves to the first match in the document. Not
duplicated — unreachable. Each renderer is correct about the tree it rendered, so neither can
see it.

`formId` is a rendering concern and not a document one, which is why it is an option rather
than a second `schema.id`: the document is the same document, its hash is the same hash, and a
submission still binds to the version it was rendered against. It is also validated when the
engine is **built** rather than when a field is first rendered — which was true of `schema.id`
too, and is the wrong moment, because a page that renders nothing until somebody scrolls
reported the mistake then. [0095](docs/decisions/0095-one-schema-two-renderers.md) has the
argument, including why the renderers do not share one engine.

A host has the same page for an ordinary reason — two of the same form, one per applicant — so
both getting-started guides now document it.

**The cost, measured over the built bundle:** 231.4 kB brotli before, **280.9 kB after**. About
50 kB for Angular's framework and renderer, on a page that already carries React, Monaco and
the builder. Published rather than left to be found: this is a demonstration page, and nothing
a consumer installs got bigger.

**Building it found a defect nobody could have seen.** The playground's own capabilities — the
options source, the scanner, the uploader, the rich-text editor — were local to the React
component, so the Angular half was bootstrapped without them and rendered **one control
fewer**: `deliveryPoint` is a typeahead over an `optionsSource`, and with no source to resolve
it shows a message instead of a chooser. The pane was full of fields and looked right. It was
caught by comparing the two panes by **accessible name**, which is why that test is an equality
rather than a spot check. The capabilities moved to `demo-capabilities.ts`, because they are
the *deployment* and both renderers here are one deployment.

**And the accessibility audit had been checking half the page.** It rendered the app and
returned, and Angular bootstraps asynchronously, so axe reported a clean page with one form on
it. It now waits — and that wait is what makes the audit mean anything, since duplicate ids are
exactly what axe catches and exactly what two renderers of one schema produce. Confirmed by
colliding the ids and watching all four cases fail.

Two smaller things the work forced. The engine's size budget allows no growth at all, so the
check protocol types moved to `core/src/checks.ts` to pay for the new option — the first piece
of the seam that entry already named. And `OptionsSource`, `OptionsSources` and `Scanner` turn
out to be declared independently and byte-for-byte identically in `@formancy/react` and
`@formancy/angular`; the shared capabilities typecheck structurally against both, which is the
only reason one deployment can serve two renderers. Recorded as debt rather than moved, because
a published type is two packages' public surface.

**What is still demonstrated nowhere is the Angular builder.** What is on the page is
`@formancy/angular`, the renderer. The debt table and the roadmap say which half is left.

**The Angular builder arranges the form on the form itself**, which was the last thing the
React builder had that it did not. `FormancyArrangeSurface` wraps a rendered form and makes
it a drop target; it is off unless a caller turns it on, because a preview somebody is typing
into should not be picking up drags.

**Where a drop lands moved into `@formancy/builder-core` rather than being copied.** It was
80 lines inside the React surface: which part of an element is a side zone, how wide an
element has to be before its sides are worth aiming at, the cap that stops a very wide field
being all edge, that a node already inside a row has no side zones because left and right
already mean before and after, and which axis the indicator runs along. Every one of those is
a decision about what a pointer means, and a user asks it by pointing at one place — two
implementations would be two answers, and the difference would show up as "the drag works
differently in the Angular builder".

`arrangeDrop` takes a rectangle as plain numbers rather than a `DOMRect`, because
`builder-core` compiles with no DOM library. One thing stays per framework: whether the
hovered node already sits side by side with its siblings is a fact about what the *renderer
did* — a table child that spans is wrapped in a `layout-cell` — and predicting it in the
builder would mean reimplementing the renderer.

**And the measurement is less flattering than the slogan.** What decides anything is 67 lines
of shared code with no framework in it; what each builder needs on top is about 190 lines of
event plumbing, 181 in React and 198 in Angular. A second builder is a binding rather than a
second builder, as [0091](docs/decisions/0091-a-second-builder-is-a-binding.md) said, but a
binding for this feature is roughly the same amount of code again.
[0094](docs/decisions/0094-the-second-builder-reaches-parity.md) has the bill.

A side effect worth having: a side zone is now testable without a layout engine. jsdom gives
every element a zero rectangle, so the React suite could never see one — its drag tests aim at
`box.left ± 1` and rely on the sign. The nine geometry cases pass real numbers and assert the
boundaries, the cap and the minimum directly.

**Two documentation claims were wrong and are corrected.** The README said *"the Angular
package carries the structure tree today; the arrangement tree, the property panel, the
condition editor and the translations pane are React-only"* — every clause of that shipped
over four releases and the sentence changed in none of them. It is now derived: a guard reads
both builders' barrels, pairs every pane across the two, and requires anything one-sided to be
named with a reason. And arc42's debt table still said a data path inside a rule's condition
is never rewritten, which the previous change fixed and this one noticed.

A comment also claimed `SIDE_ZONE_MINIMUM` was what kept a zero-sized element from being
treated as all edge. It is not — with a width of zero the zone is zero and neither comparison
at the edges holds — and the correction is in the code, because believing the wrong guard
protects something is how the real one gets deleted as redundant.

**What is still missing is a demonstration.** No application mounts `@formancy/builder-angular`,
or `@formancy/angular` either: both exist only inside jsdom suites. The v0.1 goal was one
schema rendering in React *and* Angular in one screenshot, and that screenshot does not exist,
so Angular parity is a claim backed by tests rather than by anything a visitor can open.
Recorded in arc42's debt table and as the roadmap's next item rather than left implied.

**A rule follows the path it reads.** Renaming a field, or unwrapping a group, now rewrites
every rule that names it — the `target`, the `cel` condition, and the `editor` metadata the
logic panel reopens from.

The roadmap said both commands *refused* a document a rule mentioned. One did. **`renameField`
did not, and that was the defect:** it succeeded, left the condition reading a path no field
had, and published. The engine types an unknown leaf as `dyn`, so the rule still compiles;
`validateSchema` checks a rule's target and not the paths inside its condition, so the
document still publishes; and `postcode == "8000"` becomes `null == "8000"`, which is `false`
for the life of that immutable version. A conditionally visible field was simply never shown
again, with nothing to say so at authoring time, publish time or run time.

`rewritePath` in `@formancy/expressions` does the work by **splicing the source spans the CEL
parser reports**. Three things follow and none of them need arguing about: `postcode_uk` is a
different node, so it is untouched; `"postcode"` inside a string literal is not a path node,
so it stays the data it is; and the author's spacing and choice between `address.city` and
`address["city"]` survive, because everything outside the matched spans is left alone — which
matters when the published document is diffed in git.

**The splice is the mechanism; the verification is the guard.** The result is parsed again and
asked what it reads, compared against what the input read with the rename applied. That is
what catches capture — renaming `postcode` to `zip` inside `items.all(zip, zip.n > postcode)`
produces a perfectly correct splice whose text is valid CEL meaning something else. A rewrite
that cannot be made safely refuses the whole command and names the rule, because half a
rename is the state the author was being protected from.

A regular expression was tried, with correct escaping and word boundaries — the shape the old
code used. It fails **4 of the 14** cases: it rewrites a field name inside a string literal,
misses `address["city"]` when renaming `address.city`, rewrites a comprehension's own
iteration variable, and cannot detect capture. The first two are silent and produce documents
that validate. [0093](docs/decisions/0093-a-rule-follows-the-path-it-reads.md) has the rest,
including why the AST is spliced rather than reprinted.

**And the old pattern was over-refusing.** `note == "address"` reads `note` and nothing else,
and it blocked an unwrap while naming a rule that had nothing to do with it.

**Building the demo for this found a second defect, in how a condition is written rather than
in the rewrite.** A rule reading into a group — `address.country == "CH"` — **errors** on an
untouched form, because the group itself is null, and a `visible` rule that errors fails
*open*: the field it was meant to hide was on screen from the start. The obvious repair,
`address.country != null && …`, errors identically, since it has to read the path to compare
it. Only `has(address.country)` answers. Same family as `needsVisa != true`, one level deeper,
and found the same way — by running the demo rather than reading it. `concepts/logic.md` now
carries the table, `SAFETY-ANALYSIS.md` A5 carries the consequence for a manufacturer, and
`apps/docs/src/empty-answer-guards.test.ts` parses that table and evaluates every row, so a
verdict that stops being true fails and a row added without one fails too.

The wizard demo gained the condition that shows it: a notice visible only for a Swiss
address, read off `address.country` — the first rule in either demo that reads **inside** a
group, which is where a path rewrite gets interesting, and asserted in all three states
against a real engine.

Two files moved, and the size ratchet is why: `session.ts` passed its ceiling, so the "a path
moved, make the document follow" family left for `builder-core/src/repath.ts` — eight
functions, one subject — and `session.ts` ended up 80 lines *smaller* than before this change
rather than 70 larger. `references.ts` and the new `rewrite.ts` now share one walk in
`chains.ts`, because what counts as a field and what is a local bound by a comprehension has
to be one answer: those two answers are the dependency graph and the text of the rule.

**What this does not cover is a document the builder did not write.** A form composed by hand
or by a script can still publish a condition reading a path nothing provides, and
`validateSchema` will not refuse it — the `dyn` typing that lets an unfinished form be edited
is what makes that indistinguishable from a rule about a field somebody is about to add.
Recorded as `SAFETY-ANALYSIS.md` B1a's residual and as the roadmap's next item, with a test
asserting the gap is still there so closing it has to be deliberate.

**Publishing a form declares the version it was based on, so two people editing one form
cannot silently overwrite each other.** form.io calls it collision control; the mechanism
was already here and pointed the other way. A *submission* declares the version it was
rendered against and a stale one is refused with **409 `FORM_VERSION_CHANGED`** carrying
the current schema. A *publish* declared nothing, so the second of two editors won and
nothing said anybody else had the form open.

Because a published version is immutable, nothing was ever destroyed — the first editor's
document is still a version, still readable, and every submission bound to it still
resolves. What was lost is that **anybody noticed**: `forms.current_version_id` moved past
it, and the first editor's next page load showed a form they did not write. That the data
survives is what made this worth fixing rather than what made it safe to leave; nothing
surfaced to prompt the question.

`POST /forms` now reads the same `x-formancy-schema-hash` the submission route reads, and
answers the same 409 with the same body, so a client that already handles one stale version
handles both. **Sending it is optional, and that is the decision.** A script, the CLI and an
agent publish a document they *composed* rather than one they *opened*; requiring the header
would make every one of them fetch the current version first to satisfy a rule about
editors. What declares is the thing that opened a version — the builder, which now does —
and declaring is how a client asks to be told it has been overtaken. No merge is attempted:
the refusal carries the other schema so a person can see what changed and decide.
[0092](docs/decisions/0092-publishing-declares-what-it-opened.md) has the argument,
including why the hash rather than the version number and why not a lock.

**And a 500 that was hiding behind it got a name.** `UNIQUE (form_id, schema_hash)` is what
makes republishing the current document a no-op rather than a version factory, and it
refuses an *older* document just as firmly — so republishing version 3 to undo a bad
version 4 raised at the insert and the route answered **500**. It is now `409
already_published`, naming the version it already is, which is also the honest answer: a
published version cannot be published twice.

The order of the two checks is load-bearing and has a test that says so. An editor whose
document already hashes to what is published has nothing to merge — somebody else wrote
exactly what they were going to write — so the idempotent case is answered **before** the
stale-base check. Otherwise a repeated deploy of an unchanged schema becomes a conflict.

**Moving the file found a regulatory claim with nothing behind it.** Reading the coverage
report for the new `publishing.ts` showed one branch no test anywhere reached: the
publish-time refusal of a document naming an `optionsSource` the deployment has never
configured. `SAFETY-ANALYSIS.md` A7 asserts that constraint in prose — *"a form cannot be
frozen with a list nobody can resolve"* — and [0077](docs/decisions/0077-options-may-come-from-a-named-source.md)'s
*Verified by* named the schema-validation and submission-time cases, not this one. It now
has three cases, two of them boundaries, each observed failing. The claim was absent rather
than wrong, which is the better of the two, and it was found by moving the code rather than
by proofreading the sentence.

Three files moved, and the size ratchet is why: `use-cases.ts` (916 → 663) and `app.ts`
(988 → 928) were where everything went, and the budget refused the next thing added to each
rather than letting the number drift. `server-core/publishing.ts` holds `publishForm` and
the audit row written inside its transaction, `server/routes/publish.ts` is the matching
Fastify plugin, and `server/headers.ts` holds the one header name both routes read — two
spellings of one header is a bug nobody sees until a client sends the other one. Both
ceilings were lowered to the new numbers.

**The Angular suites stopped being timed against a budget nobody chose for them.** Rendering
a component tree in jsdom is real work: the first `render(FormancyForm, …)` in a file
compiles the form and everything the registry pulls in — seventeen field components — and
costs **372ms** locally, against 4–30ms for a test that renders a small host. On a shared CI
runner under parallel load that same case was observed at **5,396ms**, a factor of about
fourteen, and it turned `main` red the day a fifteenth package joined the parallel build.

Two changes, and the first is the one that matters. The compile happens **once, before any
test is timed**, so it is not charged to whichever case happens to be written first: 372ms
to 196ms for that test, with the rest being the render these cases are actually about.
Charging a one-off cost to the first test is how a suite acquires a case that looks slow and
is not.

And the two Angular packages moved to `testTimeout: 20_000`, which is where `apps/playground`
and `apps/site` — the other suites that render real trees — have been all along. A timeout
is here to catch a **hang**; speed is policed by the performance gate, not by this number.

*This flake was seen once before and re-run past rather than fixed, which is how it reached
`main`.*

**The demo chooser takes a line of its own.** It is not the same kind of control as the two
beside it: language and appearance change how the form *looks*, and this changes which
document is open — the same thing the schema editor and the builder do. Sharing a row said
they were three settings of one kind, and cost the chooser its label, since *"Everything —
one form, every field type"* does not survive a third of a phone.

**And the controls stopped being a grid at all.** A grid has to be told how many columns
there are, and every answer to that is a number that goes stale: `repeat(2, …)` was the
first, and `auto-fit` was the correction — which then made *three* columns at phone width,
so the two controls sharing the second line got a third of it each and "English" arrived as
"E". A row that wraps needs no count: a basis of 100% puts the chooser alone on its line and
whatever follows shares what is left, however many of them there are.

**The header could not shrink, and that was a reflow failure.** Measured at 320×844 while
fixing the above: the bar held 348px inside a 305px viewport and the page scrolled sideways.
The header is a **grid** item, where `min-width` defaults to `auto` — its content — exactly
as a flex item does, which is the trap its own comment already described one level down.
1.4.10 asks for no horizontal scroll at 320px and there is none now.

At 390×844 the header is 133px with the chooser's full label readable; at 1280 nothing moved.
`apps/docs/src/playground-header.test.ts` fails on a fixed column count and on the header
losing its `min-width`, both observed.

**The playground's header stopped counting its own controls.** Adding the demo picker made
it a third switcher in a grid written for exactly two — `repeat(2, minmax(0, 1fr))`, with a
comment above it saying *"the two switchers side by side"*. The third landed alone on a row
of its own with an empty cell beside it.

Measured in a browser at 390×844: the header went from one row of controls to two, **95px to
133px**, 16% of the screen before anything a visitor came to see. At 360px — a very common
phone — it was 175px, and at 320px, 213px.

`repeat(auto-fit, minmax(5rem, 1fr))` instead, with the label stacked above its select below
64rem so a narrow column is usable rather than sixty pixels of ellipsis. All three fit on one
row from **320px up**, and the floor costs nothing wider because `1fr` still expands them.
Desktop is untouched: above 64rem the controls are still a flex row with the label beside the
select.

That is [the rule about counts](CLAUDE.md) in a stylesheet rather than in prose — a number in
a template goes stale exactly the way a number in a sentence does, and neither announces it.
`apps/docs/src/playground-header.test.ts` fails when a fixed repeat count comes back, and
derives from the app that there are more than two controls, so the rule stays load-bearing
rather than tidy.

**The Angular builder edits a datagrid's columns.** `FormancyColumnsEditor`, the second
shape generation cannot produce — the schema says "array of objects" and the honest generic
answer is a textarea full of JSON. A column **names** a child that exists, so the answer is
a choice and never a text box; a width is a **share** and never a length, because a length
in a document is the format choosing the consumer's design system for them; and a column
list is an **ordering**, so removing one puts its answer back at the end rather than taking
it off the form — said out loud, because an author who removes a column expects the answer
to go with it.

**One comment claimed more than the code did.** Building the column property by property
rather than by spread is described as keeping "absent" and "empty" apart — and for `width`
the session catches it anyway, because it copies through JSON and `undefined` does not
survive that. Measured by writing the naive spread and watching the width case stay green.
Only `header` is genuinely held here, where `''` **is** a value JSON keeps, so that case now
exists and the comment says which half it holds.

**Both Angular builder trees can be dragged**, which is the second route to commands that
already worked without it — the order WCAG 2.2 SC 2.5.7 asks for, and the order both trees
were built in. Where a drop lands comes from `@formancy/builder-core`, so the React and
Angular trees answer that identically; only a drop the session will accept shows an
indicator, because one over an illegal target promises a move that will not happen and a
field that snaps back has told somebody nothing; and every drop is announced through the
same live region the keyboard uses, so a drag is not a silent command for somebody using
both.

The cases dispatch **MouseEvents** rather than a drag helper, for the reason the React ones
do: jsdom has no `DragEvent` and the fallback drops `clientY`, so both edges arrive as
`undefined`, every drop lands below the target, and half of what the code decides goes
untested. Observed: with the edge decision replaced by a constant, *"the upper half of a row
means before it"* fails and nothing else does.

**The Angular builder translates.** `FormancyTranslationsPane`: extract in one step, work
down a language, add one, download the catalogue and upload it back — and a **preview that
renders the form in the language being worked on**, built on its own engine so the document
is not edited in order to look at it.

`referencedMessages` moved into `@formancy/builder-core` with the rest, so both panes ask
the same question in the same order: a translator works down a list and meets the questions
in the order somebody filling the form does, which is the only order that makes the words
next to each other mean anything.

**One of its guards passed for the wrong reason and is recorded rather than replaced.** The
preview cases asserted the English text, which an untranslated language renders *whether or
not the engine is given a locale at all* — so removing the locale entirely left them green.
The case that distinguishes them writes a translation and asserts the preview shows it, and
that one fails without the locale.

**And `@formancy/angular` was not importable from inside the workspace.** Nothing had ever
imported it here — the renderer is consumed by applications, not by other packages — so its
source manifest named no entry point, and the first package to need it could not resolve it.
It does now, with the reason beside it; `finalize-dist.mjs` strips the field from what is
published, because relative to `dist` the path resolves to nothing and `publint` says so.

**A calculated field is something an author can make.** `computed` has been in the format
since version 1, both renderers honour it, and **neither builder's kind table listed it** —
so a calculation was a thing a developer could hand-write and an author could not reach.
The same documented-but-unreachable shape `check` and `skip` shipped in, and found the same
way: by deriving the list of kinds from the spec rather than reading the table.

It is written as CEL rather than through the comparison editor, and that is not a shortcut.
A calculation produces a **value**; the comparison editor composes booleans. Offering it
there would be offering a surface that cannot express what the rule is for. So a kind now
says what it is written WITH — a condition, a check's name, or an expression — where it used
to say only whether it carried a condition.

**And the Angular builder writes rules.** `FormancyLogicPanel`, over the same table: which
kinds exist, what each is called, what it is written with, how a rule is addressed and what
it compiles to are all `@formancy/builder-core`'s now. Two copies of that table drift the
first time the format grows a kind — which it had already done, twice.

That move also made four things testable without rendering anything: the value narrowing
that turns a typed `"5"` into `5` before CEL sees it, the data-path-versus-page-key rule for
addressing, what a draft needs before it can be added, and the table itself against
`RULE_KINDS`.

**One React control per file.** `packages/react/src/form.tsx` was 2,154 lines — the largest
file in the repository — holding the form, the list that walks it, and every control. It is
466 lines now, beside ten files of 21 to 328, split by the reason to change: a control
changes because of that control.

What stayed together is the part that is genuinely one subject. A form renders a list, a
list renders a slot, a slot may render a repeater, and a repeater renders a list —
**mutual recursion is not a seam**, and splitting it would have bought a cycle rather than
a boundary. The registry stayed with it because resolving a component is what the slot does.

**It cost 0.5 kB brotli, and a guard said so on the same commit.** `@formancy/react`'s
barrel went 19.5 → 20.0 kB, caught by `apps/docs/src/bundles.test.ts`, which measures rather
than trusting §9.3's number. Measured both ways: dropping the re-export hop changed nothing,
so it is module boundaries and not indirection that could be removed. §9.3 carries the new
figure with the reason — a refactor that improves how the code reads is allowed to cost
something, and the number says how much rather than the change being waved through.

243 React tests pass unchanged, which is the point: nothing about the behaviour moved.

**A standard for the code itself, and a gate under it.** `CLAUDE.md` gains *the code reads
as though a senior wrote both halves*: idiomatic for the framework it is written in rather
than a translation of another's habits, a pattern chosen for a force the comment names, and
the reminder that the cargo-cult version of that rule is worse than its absence — no
interface with one implementation, no layer that only forwards, no abstract base for two
concrete cases.

The part that bites is the size budget. **600 lines for a source file**, enforced by
`apps/docs/src/size.test.ts`, with the fifteen files already over it on a list — each capped
at the size it was measured at, each with a note saying where its seam is, because a number
with no plan is a permission slip. It is a **ratchet**: a listed file may not grow, and when
one shrinks past its ceiling the test fails too, so the entry comes down rather than sitting
there granting room nobody needs. A new file over the budget is not added to the list.

**And the first one is worked off.** `packages/angular/src/fields.ts` was 1,909 lines
holding seventeen components — the second largest file in the repository and the place
things went. It is now a registry of 55 lines beside ten files of 56 to 321, split by the
reason to change: a control changes because of that control. The mechanical cost is visible
and worth saying — about 70 lines of import blocks and headers across the ten — and the
first attempt at the split cut a component in half, because walking backwards over blank
lines to find where a class begins lands inside a template literal. It was redone with a
scanner that understands strings, templates and comments.

**The Angular builder edits properties, for both trees.** `FormancyPropertyPanel` and
`FormancyLayoutPropertyPanel`, generated from the spec's own JSON Schema exactly as the
React ones are — hand-write twenty-five panels and they rot within two releases. Plus
`FormancyOptionsEditor`, because a list of value/label pairs has no generic rendering that
is any good and the honest generic answer is a textarea full of JSON.

**A branch neither builder could ever render is gone.** Both property panels carried a
*"this node has nothing to configure"* case, and there is no such node: every layout kind
the format defines can `span`. `packages/builder-core/src/properties.test.ts` derives that
now, so a kind added without an editable property fails there — and the branch comes back
with a case rather than sitting unexercised again.

**And one guard was written where it could not bite.** The property control keeps a draft
of its text because the document refuses invalid states and a person typing passes through
them. Written against a field's `label`, the case passed with the draft removed — every
intermediate state of a label is accepted, so there is nothing to recover from. The case
lives on a layout node's `span` instead, which is `anyOf: [integer, const "all"]`: typing
the word offers "a", then "al", then "all", the first two are refused, and a box bound
straight to the document re-renders empty so the next keystroke lands in an empty box. The
field-panel case is renamed to what it actually holds.

**The Angular builder arranges as well as structures.** `FormancyLayoutPane` — rows,
columns and sections, by keyboard: `a` to add a container, `m` to move one, `u` to unwrap
it keeping what is inside, `w` to put two items side by side, `Delete` to take a field out
of the arrangement, undo and redo. Eleven cases beside the structure tree's eighteen, by
role and accessible name only, and each observed failing against its own mutation.

Two things it says out loud, because both are the kind of thing a pane like this exists to
prevent. Taking a field out of an arrangement announces that **the form still collects
it** — anything else reads as having deleted the question. And a field no arrangement
places is listed under a heading rather than silently omitted: it is collected by the form
and invisible to everyone filling it in, which is the mistake this pane can catch.

What the two panes OFFER is still decided once. Destinations, their descriptions, and what
may be wrapped with what come from `@formancy/builder-core`, so the React and Angular
arrangement trees cannot disagree about one document.

**There is a builder for Angular.** `@formancy/builder-angular` — Angular 22, zoneless,
`OnPush`, standalone — over the same `@formancy/builder-core` the React one uses. Asked
directly: *"why is there no builder for angular?"*, and the honest answer at the time was
that nothing in the documentation said, while the README's headline read *"the open-source
visual form builder for Angular and React"*.

**The structure tree first, and complete.** Every command the React tree has — add, move,
delete, add a page, unwrap a container, undo and redo — every refusal announced through one
polite live region, one tab stop with a roving `tabindex`, and every destination described
as a sentence rather than an index. `packages/builder-angular/src/builder.test.ts` holds it
to the same behaviours as `builder.test.tsx`, by role and accessible name only, the way the
renderers hold the signature control: the conformance fixtures speak filling in and clicking
on a rendered *form* and cannot say "press `m` and choose a destination", so the parity is
by hand and says so.

**Which destinations exist is decided once.** `builderView(session)` moved into
`builder-core` alongside the seven modules that moved before it, so both builders read the
same list — including the rule that a field is never offered the position it already
occupies. Two builders offering different destinations for one document would be two
products, and nobody using only one of them could see the difference.

**An Angular effect may not read the signal it writes**, and this cost an afternoon worth
recording. Keeping focus on a field across an edit is done in React during render with a
ref guard; written as an Angular effect that read the focused position and set it, Angular
treats it as a cycle and answers by **not scheduling any further change detection** — with
no error. It looks exactly like frozen bindings: the key handler runs, the signal changes,
the DOM keeps the first render's value. Found by probing the signal and the DOM in one test
and watching them disagree; five cases fail against that shape and pass against the
correction ([0091](docs/decisions/0091-a-second-builder-is-a-binding.md)).

The arrangement tree, the property panel, the condition editor, the translations pane and
the drag surfaces are still React-only, and the package's README says so rather than
leaving it to be discovered.

**The builder's core holds what is framework-free, which is more than it did.** Seven
modules moved out of `@formancy/builder-react` and into `@formancy/builder-core`: the
compiler that turns a structured condition into CEL, the two drop models, the two tree
flatteners, the palette, and the property list read out of the spec's own JSON Schema.
915 lines, none of which ever mentioned React.

They lived in the React package because it was the only builder there was. A second one
makes that expensive rather than untidy: an Angular builder would either import from
`@formancy/builder-react` — dragging React into an Angular application's dependency
closure — or copy them, which is two compilers turning a condition into CEL and two answers
to where a drop lands. This is [0008](docs/decisions/0008-layered-packages.md)'s rule one
layer up, and it is the step that makes a second builder a binding rather than a rewrite.

**Nothing changed for a consumer.** `@formancy/builder-react` re-exports all of them, so an
existing import keeps working; they are simply also reachable without React now.

The rule is held in `apps/docs/src/builder-layering.test.ts`, against the **source** rather
than the manifest — a transitive import compiles just as well as a declared one — and
against Angular as well as React, because a rule written only against the framework that
happened to be there first is a rule that permits the second.

**The documentation has a way out of itself.** Asked for, and measured in the built page
before anything changed: the header held one link, Starlight's own title, pointing at
`/docs/` — the page you are already on. These pages are a third of formancy.ai and had no
way back to the landing page, the playground or the repository, on exactly the pages where
somebody is still deciding whether to use any of it.

The title is now the mark and the name, linking to the site root — absolute in development,
where the site and the docs are two servers and a relative path would land back inside this
app. GitHub sits beside it. The mark is the file the favicon already uses rather than a
second copy, which `apps/docs/src/chrome.test.ts` holds by comparing the shapes in both.
The repository address is derived from what the manifests publish, so a repository that
moved cannot leave the documentation pointing at where it was.

**And the sidebar still called the spec reference "(v2)"**, two frozen versions later.

**The playground has a second demo, and it is the one with steps.** Asked for directly:
*"is there a demo for all that in the playground? always add a demo"*. Measured before it
existed — the playground held **no `page` and no `group` at all**, so it never drew a
stepper, never showed a step being walked past, and gave the builder's container commands
nothing to act on. Three releases of wizard work were demonstrated nowhere.

A second document rather than a change to the starter, which is one flat form on purpose:
every field type the spec defines **minus the two that nest**, so every control is on screen
at once with nothing to press Next through. Adding a page would have taken that away to
demonstrate a page. So the obligation sits on the pair, derived from the spec's own lists
rather than from a hand-kept list: between the two demos, every field type **and every rule
kind** the format defines is on screen. `disabled`, `check` and `skip` were in neither.

**Building it found three things that were wrong, and each was silent.**

- **`!needsVisa` never fires.** An untouched checkbox is null, CEL refuses `!null`, and a
  rule that errors fails closed — so the page was never skipped in any state, and the demo
  would have shipped showing the feature not working. `needsVisa != true` is the idiom the
  engine's own tests use. The demo's guards now build a real engine and ask it, because a
  document whose rules do not fire is exactly the documented-but-inert failure a demo
  exists to prevent.
- **A `check` with no `runsOn` never runs in the browser.** The engine falls back to
  `server` for a check and `both` for a validate rule, while the JSON Schema declared one
  default for both. Written the obvious way, the check made no request and marked nothing:
  an answer accepted that nothing had checked. The engine's behaviour stands and is the
  right one — only the server can always answer a check — and the schema now states the
  check's own default **as data** on the check branch
  ([0090](docs/decisions/0090-a-check-defaults-to-the-server.md)).
- **The spec reference never read the rule's conditional block.** So everything the schema
  says per kind — which kinds carry `cel`, which carry `check`, and now this default — was
  published nowhere. `generate-spec-reference.mjs` reads it now and throws on a branch
  gated on anything but `kind`, which is what the field blocks already did after an empty
  heading shipped once.

**And switching demo left the builder on the old document.** The session is opened when the
Build pane appears and deliberately not re-opened as the text changes — the builder writes
that text on every edit. A demo switch is the one case where throwing the undo stack away is
right, because it is a different document rather than an edit to this one. Without it the
form followed the picker and the structure tree did not, which is two panes showing two
documents on the page whose whole claim is that they cannot.

**The landing page uses a wide screen.** Reported as *"the start page is still really small
on wide screens"* and measured at 2560×1440 before anything changed: every band capped at a
flat **1760px** and centred, so 392px of empty margin down each side — while the sticky bar
was full-bleed on the gutter, putting its logo and its links **312px outside** the column
everything else lined up to. That mismatch is most of the effect. A page with margins reads
as a page; a narrow card under a wide header reads as small.

Two changes, and only the second is about width. The bar keeps its full-bleed background
and puts its contents on the same measure, so the logo starts where the headline does. And
the measure stops being a constant: `--shell: clamp(110rem, 88vw, 132rem)`, declared once
and used by both bands. Below 2000px the middle term is under the floor and **nothing
moves** — the layout was tuned there — while at 2560px the band goes 1760 → 2112, the
headline column 646 → 796, and the live demo 564 → 702. The upper bound is what keeps this
from trading one complaint for the opposite one: paragraphs keep their own `--measure`, so
only the demos and the card grids take the extra room, which is what the cap existed for.

Guarded in `apps/docs/src/hero-layout.test.ts`, which cannot measure a pixel — jsdom has no
layout — and instead fails when the measure goes back to a constant, loses its bound, is
written twice as a literal, or stops being shared by the bar. All five observed failing
first.

**A signature was destroyed by moving the pointer away from it.** Reported from the
playground and reproduced there before a line was changed: one stroke on screen after the
mouse button came up, and **none** once the mouse left the box. `pointerleave` shared the
handler that ends a stroke — which is what it is for, since a pen that goes past the edge
with the button down never sends `pointerup` to the surface — and once the pen had already
lifted there was nothing in progress, so the handler fell through to committing the strokes
from before the *last* one. With one stroke drawn that is nothing at all, and the answer
went back to null.

**Both renderers had it, in the same shape.** That is what two independent implementations
of one control cost, and why the parity case is held by hand in each: the conformance
fixtures speak filling in and clicking by accessible name, and there is no way to say
"draw" in that vocabulary.

Every case that existed moved the pointer and lifted it, which is the one sequence that
cannot show this — the thing a person does next is move their hand away. The new cases do
that, twice, and keep the two behaviours the fix had to leave alone: a pen leaving
mid-stroke still ends that stroke, and a tap that never moved still counts as not having
signed. Recorded as **B6** in the safety analysis, because an answer being destroyed after
it was given is a different failure from a control that will not take one.

**Three things the roadmap said were missing are built, and it kept saying it.** Measured
rather than proofread: the drag gesture that makes a row out of two fields shipped on
26 September — aim at a field's side on the rendered form and the side decides the order —
and the draft endpoint and token shipped in 0062, with `POST /f/:path/drafts` handing back
the only key to a draft it signs itself, `PUT` and `GET` requiring that key, and a migration
notice in both renderers. One of the three was *written into the roadmap by the same
release that shipped what it called absent*.

Two of the three are now derived in `apps/docs/src/claims.test.ts` from the source of
`@formancy/server-core` and the routes `app.ts` registers, rather than from any wording
about them: the day publishing gains a stale-base refusal, the item asking for it fails.
The third — the row gesture — is fixed by removing the claim instead of guarding it: a
sentence naming what is absent goes stale silently, so the roadmap's list is now the one
place an absence is named, and the argument above it stopped ending in one.

**And what actually remains is first on that list: collision control on form editing.** The
409 pattern exists pointed the other way — a submission declares the version it rendered
and a stale one is refused with `FORM_VERSION_CHANGED` carrying the current schema —
while `publishForm` takes a path and a schema and declares nothing, so the second of two
editors overwrites the first in silence.

**A page can be taken away without taking its questions.** `addPage` shipped in 0.3.0 with
no way back: `removeField` removes a container WITH its children, so an author who made a
wizard by mistake had to delete every question and type them again. `unwrapField` is the
model tree's equivalent of `unwrapLayoutNode`, which the arrangement tree has had since
layouts existed — `u` on the structure tree, one undoable step.

**A page's questions join the neighbouring page rather than the top level**, and that is
not a detail. Hazard D8 in the safety analysis: the engine gives a top-level field that is
not inside a page to step ONE wherever it sits, so two questions authored on step two and
left beside step three are asked on step one — collected correctly, in the wrong place. So
they merge into the page before, or the page after when there is none before, which keeps
the document in the order somebody typed it either way; only the LAST page leaves the form
unpaged. The move is announced by name, because the tree looks like a flat list of questions
whichever step they are on. The obvious implementation — splice the children in where the
container stood — was built first, passed its tests, and produced exactly the shape D8 says
the builder cannot ([0089](docs/decisions/0089-a-page-is-unwrapped-into-its-neighbour.md)).

**It refuses three things**, each for a different reason. A leaf, because unwrapping is not
another word for deleting. A repeater, because its children describe one ROW and lifting
them out would keep the first row and lose every row after it — silently, since the document
that comes out is valid. And a group a rule addresses or reads inside: a group carries the
answer, so unwrapping renames every path beneath it, layouts follow because a placement is
structured data, and a rule's condition is CEL source that this will not rewrite by pattern.
The rule is named instead.

**And a page carrying a `skip` rule could not be deleted at all.** Measured while writing
the above, through `removeField`: a `skip` names a page KEY, so removing the page left a
rule aimed at nothing and the validator refused the whole edit — *"visa is not a page"*.
Conditional page routing shipped in 0.3.0, which means every page anybody routed around has
been undeletable from the builder since that release. The rule is only ever about the page,
so it now goes with it — in both commands.

**The builder writes both of spec 3's rule kinds.** They shipped as things a developer
writes by hand and 0.3.0 said so plainly — this is the other half, because a rule kind
nobody can reach from the builder is the wizard's shape all over again. A page's panel
offers “Skip this page when” with the condition editor; a field's offers “Ask the
deployment about the answer”, which takes a **check's name** rather than a condition,
since a check has no expression and offering one would be offering something the rule
throws away. A page is offered nothing else, because every other kind on a page is refused
by the validator.

**And it found that no rule could ever be written on a field inside a page.** The panel
composed a rule's target by joining the key path, so a field the tree calls
`about.needsVisa` was addressed as `about.needsVisa` — while the model calls it
`needsVisa`, because pages are transparent for data. Every rule written there was refused
with *"No field has the data path"*, in the builder, for as long as pages have existed.
`dataPathOf` was in `builder-core` doing exactly this job for renames and layout pruning,
and is exported now.


**The release that freezes spec version 3.** A document written against version 3 will
validate against every future release that speaks it. What version 3 added — `signature`,
the `tagpicker` widget, the `check` and `skip` rule kinds, and `optionsSource` on a
list-valued field — and what freezing it costs are in
[`MIGRATIONS.md`](./MIGRATIONS.md).

The direction that costs something is the other one, and it is worth saying before the
list rather than after it: **a reader pinned to `0.2.0` refuses a version 3 document**
rather than ignoring the part it cannot read. That is the whole point of the version line.
Upgrade the readers before the documents.


**A form can be translated in the product now.** `label: { $t: "name" }` has been valid
since version 1 and the engine has always resolved it — and nothing in the builder could
produce one, so translated content was a feature a developer could hand-write and an author
could not reach. The admin has a **translations** tab.

The command that matters is **extraction**: it turns the words somebody already typed into
a message reference and seeds the default locale with them, so the form reads exactly as it
did a moment before. A catalogue editor would have been the obvious surface and the one
that helps least — it presumes the document already refers to messages, and nothing could
make it. One press does every labelled field, because field by field is a chore people
abandon halfway.

**A message nothing refers to any more is listed, never collected.** Rename or delete a
field and its translations stay, with what they said. The tidy instinct is to sweep them;
the cost of keeping one is bytes and the cost of discarding one is somebody's work
([0084](./docs/decisions/0084-a-translation-is-authored-not-imported.md)).

An untranslated message is **marked** rather than shown as its fallback, because "it looked
fine in the preview" is how a language ships half-finished. The default locale cannot be
removed, and the refusal says why.

**And the language being worked on is previewed**, beside the table. An engine resolves
text in one locale fixed for its lifetime, so showing a translation used to mean changing
the document's `defaultLocale` — an edit to the form in order to read it. The pane builds a
second engine instead. An untranslated message falls back there exactly as it will for a
visitor, because a preview showing message ids would teach a translator that the fallback
is broken when the fallback is the feature.

**A catalogue goes out and comes back as a file**, for a team with a vendor and a
translation memory who work outside the product entirely. It carries the **source beside
every target**, because a list of ids and blanks tells a translator nothing —
`country.option.CH` is the schema's name for a thing rather than the thing — and a
memory matches on source text. Untranslated messages travel with an empty target rather
than being left out, since a file that omits them is a file saying the language is
finished.

Coming back, three things are refused or reported rather than done quietly: an **empty
target never erases** a translation already there, because a partial file from a vendor is
normal; an id **the form no longer has** is reported and not written, since resurrecting
one as an orphan makes the count of what is left wrong forever; and a target whose
**source has changed** since the export is written *and* named, because it was translated
from older wording and a reviewer has to see which.

Not XLIFF, deliberately: that is a format with a specification, a namespace and versions,
and shipping half of one would be worse than shipping none. This shape converts to it in a
script somebody can write in an afternoon.

**The one press reaches every text the format has**: a field's label, an option's label, a
grid column's heading and a layout node's label. `Text` appears in exactly those four
places, and the ids it mints need not be stable — a reference lives *inside* the thing it
names, so reordering options or moving a section carries it along.

*An earlier draft of this entry said the button leaves "options, placeholders and help
text" for later. The format has no `placeholder` and no help text at all, so two of those
three named nothing: the sentence was written from a memory of other form builders rather
than from this one's schema, in a changelog whose subject is this one's schema. Recorded
rather than quietly corrected, because it is the failure this repository's documentation
rules exist for, and it got past me three times in one afternoon — into the roadmap, the
changelog and a decision record.*

**`kind: "skip"` — a page a form walks past.** The last thing the roadmap deferred, and it
went into version 3 rather than becoming the only thing in a version 4: a rule kind costs a
version whenever it lands.

Its target is a page's **key**, not a data path, and that is measured rather than chosen: a
`visible` rule aimed at a page is refused with *"No field has the data path"*, because
pages are transparent for data and a page therefore has no path at all.

**The fields on a skipped page are hidden**, which is the half that matters — a required
answer on a page somebody never saw is a form that cannot be submitted and will not say
why, with the error on a page they cannot reach. A skipped page is walked past **in both
directions**, because skipping it forward and stepping into it backward is the shape
nobody can reason about.

Page indices stay absolute, so `pageOf` and `goTo` still mean what they meant;
`engine.pages()` marks an entry `skipped` rather than returning a shorter list. Both
renderers gained `canGoNext`/`canGoBack`, because `page < pageCount - 1` stopped being the
question: the last live page is not always the last page
([0087](./docs/decisions/0087-a-page-can-be-walked-past.md)).

And the wizard carries a revision now. Walking past a page changes which steps exist while
leaving the position alone — so a binding whose store snapshot was the page number saw the
same number, did not re-render, and went on naming a step the form had stopped taking.
Found by a test that asserted the stepper after an answer changed.

**`kind: "check"` — a validator the deployment answers, and the last construct version 3
was waiting for.** An asynchronous validator could never be `async: true` on a `validate`
rule: a CEL expression is pure and synchronous by construction, and every structural
property the engine has rests on that — the dependency graph is walked out of the AST,
cycles are refused at save time, evaluation is bounded by a clock. So it is a different
kind of rule, which is what [0042](./docs/decisions/0042-freeze-the-spec.md) said when the
spec was frozen the first time.

It names a check and never an address, exactly as `optionsSource` does: a URL in a document
is a deployment detail frozen into a published version, and a way to make a server inside a
private network fetch something for you. The document says which check; the deployment says
how to answer it.

**Every call carries a generation, and a verdict from an old one is dropped** — the bug
every implementation of this ships with. Somebody types an address, the check goes out,
they correct it, and the first answer lands second and marks the corrected address taken.
Debouncing narrows that window; only a token closes it. `engine.settle()` resolves when
nothing is in flight, so a host can await it before submitting rather than sending a form
whose verdict was not in, and `checking` on the snapshot becomes `aria-busy` in the
composed props — never `disabled`, which would blur whoever is typing
([0086](./docs/decisions/0086-a-check-is-named-and-answered-elsewhere.md)).

**And it found that the server has never replayed as the server.** Wiring checks meant
passing `mode`, and nothing ever had: `createFormEngine` defaults to `client`, so every
server-side replay since `runsOn` shipped ran the **client's** rules. A `runsOn: "server"`
rule — a uniqueness check, the reason the property exists — was skipped in the one place it
was meant to run, and a `runsOn: "client"` rule ran in the one place it was meant not to.
Both halves backwards, in the product. The engine had unit tests for the behaviour and the
server had tests for submissions; the seam between them was tested by neither, which is
what the two new cases now do.

**`widget: "tagpicker"` — several answers, narrowed by typing.** The half of the combobox
row that was still missing: one answer from a list the document holds is `typeahead` on a
`select`, and this is the many-answer one. A **widget and not a field type**, because the
answer is unchanged — an array of offered option values in the options' own order, which is
what a `selectboxes` stores without it. What changes is that a list too long to tick
through becomes usable. Every chip carries its own remove button named after the answer it
removes, because "Remove" three times over tells a screen reader user which nothing.

Building it found two things that were quietly wrong, both older than the feature:

- **The version gate asked whether a field had a widget, not which one.** `widget` arrived
  in version 2, so the check answered correctly for every version 2 widget and said nothing
  about any later one — a version 2 reader given a `tagpicker` would have rendered tick
  boxes, collected the same answers and looked entirely correct. That is the silent failure
  the version line exists to prevent, and it would have shipped inside the feature that
  introduced it.
- **A sourced list answer was never checked.** `sourcedAnswers` collected values with
  `typeof held !== 'string'`, and an array is not a string, so every value in a
  `selectboxes` with an `optionsSource` would have been stored with nothing having looked
  at it — hazard A7 wearing a different shape of answer. `optionsSource` widens to
  list-valued fields in version 3, and the walk widened with it, because shipping one
  without the other is a hole waiting for whoever did the second
  ([0085](./docs/decisions/0085-a-tag-picker-is-a-widget-and-a-widget-has-a-version.md)).

The control is a labelled combobox with a list of chips rather than a fieldset: a
`selectboxes` without the widget is a group of controls and a legend names it correctly,
while a tag picker is one control plus a record of what has been chosen. The first version
built it as a fieldset, which named the group and left the box somebody types into with no
accessible name — caught by the case that asks for the combobox by name.

**`signature`, and the spec version 3 that carries it.** The last of the three components
form.io and FormEngine both charge for, and the only one still unbuilt. A signature is
**points, or a name** — `{ "drawn": [[[12, 40], …]] }` or `{ "typed": "Mara Lindqvist" }`,
never both and never a picture. Points scale, diff and survive a re-render; a PNG does none
of that and puts a megabyte of base64 in a submission nobody can read. Whole numbers inside
a `box` the field declares, because a submission is bound to a canonical hash and that hash
must not depend on how a browser rounded a pointer event. `maxPoints` bounds it: it is the
one answer whose value is an unbounded nested array.

**Typing your name is the second route, not a fallback with an apology.** It is how most
people sign most things and the only route a keyboard has, so a field offering drawing
alone would be a WCAG 2.1.1 failure with a legal signature attached to it.

**Stroke timing is refused rather than omitted.** Velocity is what makes a signature
biometric, and biometric data is a category (GDPR Article 9) nothing here is equipped to
hold. Said plainly alongside it: this software cannot verify a signature. There is no
identity proof, no certificate and no timestamp authority, so a qualified electronic
signature under eIDAS needs a qualified provider
([0083](./docs/decisions/0083-a-signature-is-points-or-a-name.md)).

**Spec version 3 is open**, and `MIGRATIONS.md` says what it added and what upgrading
costs — nothing inside the document, and one thing outside it: every reader of your forms
has to speak version 3, because a reader pinned to 2 refuses a version 3 document rather
than dropping the answer it cannot render. Opening it required generalising the version
gate, which read `if (specVersion !== '1') return []` — right while there were two versions
and silently wrong the moment there was a third, since a `richtext` in a version 1 document
would then have been waved through by a function that had stopped looking.

**And the builder now steps one version at a time.** Its upgrade button was the literal
"Move it to version 2" over an `upgradeSpec()` with no argument, which would have moved a
version 1 document straight to 3 — costing it every reader pinned to 2, for a type that
only needs 2.

**A part-filled form can be saved and resumed, and now somebody can watch it happen.**
The parts were all built and none of them was demonstrated — three public routes, a token
that addresses a draft, a notice both renderers ship for a resume that lost answers — which
is this repository's own named failure: prose saying a feature exists and a build where
nobody can see it working are two different claims. The admin's **fill in** tab opens the
published form against the server and does the three things the documentation asks of a
host: it saves two seconds after the typing stops rather than per keystroke, it keeps the
token the server minted and sends it in a header rather than a URL, and it shows the resume
notice and refuses to save a draft that came back read-only. The public routes are called
the way a respondent's browser calls them, without a session
([0082](./docs/decisions/0082-the-draft-flow-is-demonstrated-in-the-admin.md)).

Not demonstrated there, and said rather than implied: the **anonymous** submission path.
The admin is signed in, so its submissions skip the proof-of-work challenge.

**A wizard is something an author can make now.** It was the one thing a developer could
write by hand and the builder could not produce: the format has `page`, the engine walks
the pages and refuses to advance past a problem, both renderers draw the stepper, and
there was no route to one. `p` in the structure tree adds a page, beside `a`, `m` and
`Delete`, and it is in the legend the tree renders.

**The first page takes the fields already at the top level**, which was decided by
measuring the engine rather than by taste. A top-level field that is not inside a page is
given to page one *wherever it sits*: in `bare1, page one, bare2, page two` the engine
reports pages 0, 0, 0, 1, so `bare2` is drawn between the two pages and renders on the
first. No builder tree can show that honestly. So "add a page" to an unpaged form means
"make this form a wizard", the form somebody already built becomes page one, and it is one
undoable step and announced — a command that rearranges every field in the document is not
one to perform quietly. `validTargets` stops offering the bare top level once a form has
pages, which is what keeps the shape from coming back on the next insertion
([0081](./docs/decisions/0081-a-page-absorbs-the-form-it-joins.md), and D8 in
`SAFETY-ANALYSIS.md`, whose residual is that the **format** still permits the shape —
refusing it there is a spec change and version 2 is frozen).

A test had to be corrected rather than the code: `commands.test.ts` asserted that a leaf
may land in any container, including the top level of a paged form. True of the validator,
false of the engine.

### What 0.3.0 knowingly does not have

`RELEASING.md` asks a release entry to say this, because the absence a reader discovers
for themselves is the one that costs them a day. Everything 0.2.0 listed is still true
unless it appears below; these are the ones this release adds or changes.

- **The builder cannot write a `check` or a `skip` rule.** Both are authored by hand or by
  an agent. The condition editor compiles conditions to CEL already, so each is a target
  picker and a kind — and until it learns them, conditional page routing is a thing a
  developer can write and an author cannot make, which is the shape the wizard was in one
  release ago.
- **A check has no declared dependency.** It re-runs when its own target changes, not when
  something else it read changes, so a check that reads a second field is stale until its
  own is edited. Deriving dependencies is what the CEL AST is for, and a check has no AST.
- **Nothing debounces a check.** It runs on every committed value, which for a text field
  is every keystroke a renderer commits. The timer belongs to whoever pays for the call,
  and nothing here warns that the obvious implementation is expensive.
- **A signature cannot be verified by this software**, and nothing claims otherwise: no
  identity proof, no certificate, no timestamp authority. A qualified electronic signature
  under eIDAS needs a qualified provider; this is a mark on a form.
- **Catalogue exchange is JSON, not XLIFF.** A vendor asking for XLIFF gets a file that
  converts to it in a script. Half an XLIFF implementation would fail inside somebody
  else's tool, where nothing here could explain it.
- **A form can still be authored with every page skipped**, and nothing refuses that
  document — whether every page is skipped depends on the answers and is not knowable at
  publish.
- **The `fill in` tab does not demonstrate the anonymous path.** The admin is signed in, so
  its submissions skip the proof-of-work challenge. The draft routes take no identity at
  all, so those are exactly the public ones.
- **Appearance is still reviewed rather than verified**, and this release leaned on that
  harder than the last: a signature surface, a chip list and a stepper that hides a step
  are all things jsdom cannot measure. The numbers quoted for them were taken in a browser
  by hand.

## 0.2.0 — 2026-09-28

**The beta, and the release that freezes spec version 2.** A document written against
version 2 will validate against every future release that speaks it; what version 2 added
and what freezing it costs are in [`MIGRATIONS.md`](./MIGRATIONS.md). The short of the
cost: an async validator and a `signature` field type are now spec 3 features.

`0.2.0` is also the first release that **reads** version 2. `0.1.0` predates spec
versioning and pins documents to `{ "const": "1" }`, so it refuses a version 2 document
rather than ignoring the property — which is the loud failure rather than the silent one,
and still a failure.

*This entry is written for somebody integrating formancy, and it is a summary. The
argument behind each decision is in [`docs/decisions/`](./docs/decisions/), each record
naming the test that fails if the decision is violated; the blow-by-blow development
record is the git history.*

### Breaking, and behaviour that changed under you

- **Drafts need a token, and there is no compatibility window.** `PUT` and
  `GET /f/:path/drafts/:draftId` were unauthenticated and the id came from the caller, so
  anybody who guessed an id could read or overwrite a part-filled form — and an overwrite
  is then submitted under the victim's name, with nothing in the submission or the audit
  log saying the content was not theirs. `POST /f/:path/drafts` now starts a draft and
  returns an id the caller did not choose plus an HMAC over it, required in
  `X-Formancy-Draft-Token` on both other routes and compared in constant time. A wrong
  token is answered exactly like a draft that is not there, so the reply cannot enumerate
  ids. A window in which the old routes kept working would be a window with the hole open
  ([0062](./docs/decisions/0062-a-draft-carries-its-own-key.md), C5 in
  [`SAFETY-ANALYSIS.md`](./docs/regulatory/SAFETY-ANALYSIS.md), and
  [`MIGRATIONS.md`](./MIGRATIONS.md)).
- **An answer is checked against the options offered.** A `select` offering CH and DE
  accepted `XX`; a `radio` offering `red` accepted `plaid`. The controls could not produce
  it, but a payload posted at the endpoint is not a control. `modelViolations` refuses it
  with the code `option`, on the value and never the label, and only when the document
  carries the options. Stored submissions are never revalidated, so nothing already
  collected changes — but **a resumed draft holding an option the author has since deleted
  now reports `option` where it used to say nothing**
  ([0076](./docs/decisions/0076-an-answer-is-one-of-the-options.md)).
- **A chooser stores a string.** A `select` or `radio` answer that is an object, an array
  or a number is refused with `type`. `{"canton": {"$gt": ""}}` used to be stored with
  nothing having looked at it.
- **A `date` answer's shape is checked.** Version 1 fixed `date` as a date-only ISO 8601
  string and nothing enforced it, so a deployment posting `19/09/2026` was accepted until
  now and will start failing with `shape`. The freeze promises a version 1 *document*
  keeps validating, not that a malformed *answer* keeps being accepted.
- **A spec 2 document is refused by a spec 1 reader**, by name, with the fix in the
  message. Going backwards is refused rather than performed: dropping what version 2 added
  is data loss wearing the word "conversion".

### The format — version 2, and what it added

Five field types: **`selectboxes`** (several answers from one list, stored in the options'
own order; nothing ticked is `[]` and never null), **`file`** (the submission stores what
each file is and where it went, never its bytes), **`richtext`** (a small closed grammar
rather than HTML — no path from an answer to `innerHTML`, no sanitiser to keep correct
forever, and a `javascript:` link renders as the text somebody typed,
[0052](./docs/decisions/0052-richtext-is-not-html.md)), and **`time`** and **`datetime`**.
One canonical form per temporal type, `earliest`/`latest` bounds rather than `min`/`max`,
and no per-field `timezone` property: a `datetime` is an instant, a `time` is a wall clock.

Three layout kinds: **`tabs`** (presentation, not pages — a field in a closed tab is still
validated and still submitted), **`table`** (a grid whose columns line up across rows; not
a `<table>`, because arranging fields in columns is not tabular data), and **`qrcode`** (a
second view of an answer a field node already places — not a field type, because it
collects nothing).

Four widgets, through a new `widget` property that says how a field should *look* without
changing what it *stores*: `toggle` on a checkbox, `datagrid` on a repeater, `typeahead`
on a select, `scanner` on a text field. A renderer that ignores a widget is still correct,
because the field renders as its type.

And: **`optionsSource`**, so a `select` can take its answers from the deployment rather
than from the document — nothing in formancy fetches anything, the host supplies the
resolver ([0077](./docs/decisions/0077-options-may-come-from-a-named-source.md));
**`span`** on a child of a `table` layout; **`columns`** on a datagrid; and condition
groups, so one rule can combine several comparisons with `all` or `any`.

A grid's rows are flat: a `datagrid` column naming a `group` is refused when the document
is saved, because both renderers flatten a group into its leaves and one heading would
then name two controls ([0078](./docs/decisions/0078-a-grid-row-is-flat.md)).

### Packages

Four reach npm for the first time: **`@formancy/builder-react`** — the embeddable builder,
and the package a prospective adopter most wants to see — along with
**`@formancy/challenge`** (the proof-of-work scheme, isomorphic), **`@formancy/mcp`**
(formancy as seven tools for a coding agent) and **`@formancy/tiptap`** (the rich-text
editor a host supplies; ProseMirror is larger than the engine, so it is never a dependency
of a renderer).

`@formancy/themes` ships four appearances — Blueprint, Dusk, Paper and Pop — beside the
builder's own. Every part the renderers emit is styled by every one of them, and the test
that says so derives the list from the renderers rather than from a list somebody
maintains.

### The server

- **File uploads.** A file is *offered* before any bytes exist, *stored* when they arrive,
  and *claimed* inside the submission's own transaction — so a submission exists if and
  only if the files it names belong to it. `accept` and the size limit are enforced at the
  offer, before a byte is sent, because a browser's filter means nothing to somebody
  posting at the endpoint. Unclaimed files are collected after a day, bytes first and the
  row second. Files come back as authenticated attachments with `nosniff`, never inline
  ([0055](./docs/decisions/0055-files-are-claimed.md)).
- **An S3-compatible object store**, verified against a real Garage instance in a
  container. Local disk stays the default and is the only store needing no external
  service; configuring both is refused rather than resolved by precedence.
- **Webhook delivery** through a transactional outbox, with a per-destination circuit
  breaker and dead deliveries you can replay from the admin — a self-hoster has no ops
  team watching a dashboard, so a failing destination has to be visible in the product.
- **Audit logging**, written in the same transaction as the mutation it records, and
  covering submission reads as well as writes.
- **A proof-of-work challenge** for anonymous submissions, with no third party in the
  request path and no cookie: `FORMANCY_CHALLENGE_SECRET`, stateless. It hashes
  synchronously because `crypto.subtle` made the defender pay about 18× what an attacker
  pays ([0059](./docs/decisions/0059-proof-of-work-not-a-captcha.md)).
- **Rate limits at four scopes**, both draft routes included. One public route is
  deliberately unlimited and now says so in the documentation.
- **A resumed draft says what changed while you were away**, and a publish is one
  transaction rather than three storage calls that could half-succeed.
- **The server image is published and signed**, at
  `ghcr.io/sharkysan/formancy-server:v0.2.0`, with a compose file for it. There is
  deliberately **no `latest`**: the SOUP declaration tells a manufacturer to pin an exact
  version, and publishing a moving tag would contradict that in the most convenient place
  to do it.

### The builder and the admin

- **Every property the format has is configurable, and a guard says so.** The property
  panel is generated from the spec's own JSON Schema, so a new property arrives with its
  control rather than two releases later.
- **Keyboard before pointer.** `w` puts two arrangement items side by side, Escape closes
  every dialog in the arrangement pane, and focus follows the field rather than the row
  number. WCAG 2.2 SC 2.5.7 requires a keyboard path for every drag, so the command was
  built first and the gesture second.
- **Drag and drop on the form preview**, with a drop indicator that is actually drawn:
  dropping beside a field puts both in a row, as one undoable command.
- **Describe a form and get one.** `PromptPane` takes a description and returns a document
  the validator has already accepted.
- **Rows can be reordered while a form is being filled in** — `engine.moveRow`, with Move
  up and Move down in both renderers. Known limitation: focus is lost on a reorder.
- The admin has a **Webhooks tab**, looks like the rest of formancy.ai, and is tested. A
  new form starts at spec version 2.

### Accessibility

The conformance run audits every mount and every DOM-mutating change with axe, and found a
real bug on its first run. The engine owns ids and `aria-describedby` composition, so
correct wiring is a property of the architecture rather than of three implementations. A
`toggle` is deliberately **not** `role="switch"`: it is a checkbox that looks like a
switch. Stated plainly — automated checking catches roughly 57% of machine-detectable
issues, no manual screen-reader audit has been done, and there is no VPAT.

### Supply chain

Every tarball carries npm provenance binding it to the workflow run, the commit and the
repository. Each release attaches a CycloneDX SBOM signed keylessly with cosign, and the
workflow refuses to continue if the CEL evaluator is missing from it. The image is signed
by digest, never by tag. Every third-party action in the release workflow is pinned to a
commit hash. There is no signing key, so there is none to leak — see
[`RELEASING.md`](./RELEASING.md) for how to verify any of it.

### Fixed

Selected, where an integrator would notice:

- **A strict CSP needs no configuration now, including `style-src`.** Angular's component
  style was a `<style>` element that `style-src 'self'` blocks, which silently undid a
  two-column table layout in that renderer
  ([0079](./docs/decisions/0079-a-host-is-undone-without-a-stylesheet.md)).
- **A two-column `table` layout never produced two columns in Angular** — the host element
  was its parent's only grid item.
- **A rule reading a list field now hides what it was told to hide.**
- **An expression that compiles and then never works is refused at publish**, not at
  render, so a form already out there keeps opening for whoever is filling it in
  ([0054](./docs/decisions/0054-expressions-that-never-work.md)).
- **The rich-text editor was invisible.** A bare `contenteditable` has no border, no
  padding and no height, and no theme knew the part's name.
- **`FORMANCY_CHALLENGE_SECRET` did nothing under docker compose**, and the container was
  broken by a missing dependency with nothing noticing.
- **The server's membership check could not run.** `createApp` never set `optionsSources`,
  so the server half of `optionsSource` was unreachable while the hazard analysis stated
  the constraint unconditionally.
- **A file that uploaded is no longer thrown away because a later one failed.**
- **Date and time fields show a calendar or a clock on iPhone**, and fit their field.
- **A checkbox and a radio answer the pointer.** Neither had a hover or a press of its
  own, and the rule every control shares outranked `:checked` — so hovering a *chosen*
  radio repainted it as unchosen
  ([0080](./docs/decisions/0080-a-choice-control-dresses-its-own-states.md), and D7 in
  `SAFETY-ANALYSIS.md`).

### Documentation

The website deploys as one static site: landing page, playground and documentation under
one origin, with a sitemap, link previews and a social card rendered from source rather
than exported by hand. The landing page and the README now say what a manufacturer can do
with this — formancy is not a medical device and claims no conformity, and it ships the
characterisation needed under IEC 62304 to treat it as software of known provenance.

Several documentation claims were wrong, and are now guarded rather than merely corrected:
a bundle-size gate that does not exist, a spec version no released package spoke, "adding
a field type is a compatible change" in four documents at once, per-package test counts
transcribed into the SOUP declaration, and the regulatory set saying the spec is frozen at
version 1. `CLAUDE.md` gained the enforcement half of the rule that produced them.

### What 0.2.0 knowingly does not have

[`RELEASING.md`](./RELEASING.md) asks a release entry to say this, because the absence a
reader discovers for themselves is the one that costs them a day.

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
