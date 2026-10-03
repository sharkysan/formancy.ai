# Changelog

All notable changes to formancy. Every package moves on one version number; the
spec version inside a form document is a separate line, and a change to it is
called out explicitly. See [`MIGRATIONS.md`](./MIGRATIONS.md).

Loosely [Keep a Changelog](https://keepachangelog.com), with reasons attached —
a line that says only *what* changed is rarely the line you need six months
later.

## Unreleased

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

## 0.3.0 — 2026-09-29

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
