# Changelog

All notable changes to formancy. Every package moves on one version number; the
spec version inside a form document is a separate line, and a change to it is
called out explicitly. See [`MIGRATIONS.md`](./MIGRATIONS.md).

Loosely [Keep a Changelog](https://keepachangelog.com), with reasons attached —
a line that says only *what* changed is rarely the line you need six months
later.

## Unreleased

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
