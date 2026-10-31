# 0177 — A source may say its list goes on, and a sourced control says only what the person can act on

- **Status:** accepted; its active option scrolled into view by
  [0227](0227-the-row-arrowed-to-is-scrolled-into-view.md)
- **Date:** 2026-10-16
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/spec/src/options-source.test.ts` (*acceptRemoteAnswer*,
  *capRemoteAnswer*): a list read as every row and refused exactly where `acceptRemoteOptions`
  refuses it; a page that goes on, one that withholds, and `withheld: undefined` read as none;
  the whole answer refused for a `more` that is missing, `'true'`, `1`, `0` or `null`, a
  `withheld` of `-1`, `1.5`, `NaN`, `Infinity`, `'2'`, `null` or `2 ** 53`, a `moer` or a
  `total`, and a row a list would refuse; `more` said with the count shown and never a total,
  even over `withheld`; one `complete` value however often it is answered; and a fast-check
  property that no more is shown than fits and `complete` comes only when nothing was cut,
  nothing more matches and nothing was withheld. Against stubs that behave as 0.5.0 did, seven
  of those cases failed; eight mutations of the module and one of the single `complete` value
  were each caught by the case meant for it, and `withheld: null`, which the first
  implementation's `??` read as none, by its own. `packages/core/src/options-status.test.ts`,
  through a `FormText` that records the id and its values, so a case holds the decision and not
  the wording: nothing while disabled, a failure first and in each control's words, below the
  minimum, a closed typeahead, a select while enabled, each kind of completeness in each
  control's words with `more` carrying no total, a sentence held while a search is in flight
  and *Searching…* only when none stands, and nothing once settled. Nine of its first ten
  cases failed against a stub that behaves as 0.5.0's renderers did, and eight mutations of
  `optionsStatus` were each caught; the eleventh, a page of no rows that goes on said with its
  number in every shipped language, failed on French written *Affichage du premier*, since
  French counts 0 as `one`. `packages/core/src/words.test.ts` now holds every form of a counted
  message to every placeholder but the count, which failed with a French `other` form that
  dropped `{total}`. `packages/react/src/options-source.test.tsx` and
  `packages/angular/src/options-source.test.ts`, deliberate near-copies with the same case
  names: a page that goes on said with its count and no total; what the list leaves out said
  only while the typeahead's list is open; a search that settles on the sentence already
  standing making no change to the region, counted by a `MutationObserver`; `withheld` said
  when nothing else is left out, and `more` over it; a page with an unknown key a failure; a
  sentence not held past a failure, a refused answer or a query under the minimum; a plain
  select that asks nothing more for a choice or a blur, says `cappedListed`, `moreListed` and
  `searchOnly`, and, failed, says `failedListed` and asks once more when the person moves to
  it and not when nothing failed; a field a rule disables asking only `labels`, never busy and
  saying nothing, a search in flight when it is disabled ending with no failure and no
  `aria-busy`, and a labels page naming what it holds; and axe over a page that goes on, a
  failed select and a disabled lookup. With 0.5.0's renderer in place, 18 React cases and 22 of
  25 Angular ones failed for the reason each exists: the page refused as a failure, the capped
  sentence at rest, two writes to the region for a search that settled on the same sentence,
  "keep typing" and "Type to try again" under a select, a search sent for a disabled field, a
  box still busy after it was disabled, and in Angular three searches for a choice and a blur
  where one was asked. Those that passed there are that a sentence is not held past a failure, a
  refusal or a query under the minimum, and in React a page with an unknown key, which 0.5.0
  refused as it refused every page; React's four were each caught by a mutation. In each
  renderer nineteen mutations of the implementation were each caught by the case meant for it —
  in Angular among them the generation moved after the disabled check, a failure keeping what
  the last answer left out, and a lenient reading of a labels page. Added to both after review,
  under one name: *a typeahead disabled while its list is open draws no list and says nothing*,
  which failed in Angular, where the list stayed drawn with `aria-expanded` true and a click on a
  row stored its value into the disabled field, and in React with its mask taken out; Angular's
  *a control disabled while its search is in flight* now types first, as React's always did, and
  failed there with the region's state `empty` under the disabled field; and React's *shows the
  stored value itself when its name is refused*, which failed with its labels answer read
  without `acceptRemoteAnswer`. `packages/core/src/options-status.test.ts` (*what is withheld is said as
  true over a list of none*) failed on each shipped language's sentence in turn, which called
  withheld rows "more" over a page that may show none.
  `apps/docs/src/options-sources-page.test.ts` holds the concept page's table to the message
  `optionsStatus` chooses for each row and control, and failed with the old withheld sentence,
  with one row's two cells swapped and with a row taken out.
  `packages/react/src/words.test.tsx` and `packages/angular/src/words.test.ts` say each new
  sentence on a German form, and
  `apps/docs/src/renderer-words.test.ts` (*is asked for by name*) failed naming the new ids
  until both did. `apps/playground/src/demo-capabilities.test.ts`: the playground's source,
  opened, says `more`; `zür` narrows it to silence; `chur` withholds one point; that point is
  never offered; a stored point is named; and an aborted search stops — three of the six failed
  on the source that answered every point as a list, as `capped` with a total of 10 and as
  `complete`, and six mutations of the source were each caught. `scripts/install-fixture/consume.ts`, in `test:e2e:install`: a paged source
  typed against the installed `@formancy/react`'s `OptionsSources`, read through the installed
  `acceptRemoteAnswer` and `capRemoteAnswer`, and said by the installed `optionsStatus` as
  `options.more` — it failed its type check with React's re-export of the page types taken out,
  and its run, saying nothing of a page that goes on, with `capRemoteAnswer` ignoring `more`.

## Context

A select whose answers come from a source ([0077](0077-options-may-come-from-a-named-source.md))
asks the deployment for its rows and shows at most `maxRows` of them. What it could say about
the rest was measured on 0.5.0 on 2026-10-12, by formancy.ai-data, which reads its lookups page
by page from a database ([#253](https://github.com/sharkysan/formancy.ai/issues/253)):

- **A paging source could not say "more".** `resolve` answered rows and nothing else, and
  `acceptRemoteOptions` refused anything else. `capRemoteOptions` counted the rows it was
  handed, so *Showing the first 50 of 120* was true only of a source that returned every row.
  A source backed by a database pages: it reads `limit + 1` rows to know there are more, and
  does not count them, because a count reads every matching row on every keystroke — the scan
  paging exists to avoid. Handed only rows, it answered one page and looked complete, or one
  row more and claimed a total of `limit + 1`.
- **A plain select said "keep typing to narrow"** past its cap, "type at least 2 characters"
  over a source with a minimum, and "Type to try again" when its source failed. Nobody can
  type into a `<select>`. And a select's query is always the empty one, so nothing it does
  changes what its search asks: in React a select whose source was down once stayed down for
  as long as the form was open. Angular's was asked again only by accident, measured by its
  case *asks nothing more when an answer is chosen or the field is left*: its search read a definition rebuilt on every change to the field's
  state, so it sent the same question again after a choice and when the person left the field,
  three searches where one was asked for.
- **The status was said where nobody could act on it.** A typeahead searches when it is drawn,
  and its sentence stayed under the field after a choice and while its list was closed. A
  field a rule had disabled searched too, and said it: a form opening a saved record read-only
  said "keep typing to narrow" under every long lookup.
- **And it was said again on every search.** Success announces nothing — the rule the status
  was written with. But over a database nearly every short query has more rows, so the region
  went through *Searching…* and back to the same sentence after every debounced search, and a
  screen reader heard it each time. 0.5.0's capped sentence already did.

The order the status was decided in was written twice: React's `statusFor` and Angular's
`status`. This change adds a control kind, an open list, a disabled field and a held sentence
to it.

## Decision

**A source may answer every matching row, as before, or one page:
`{ options, more, withheld? }`.** One method, which a plain JavaScript host implements with one
`return`. A list is read exactly as it always was, its true total included. `more` says rows
match beyond these, and how many is not known. `withheld` counts the rows this answer covers
that matched and are not in `options` because the source cannot hand them over — a value a
select could not store. A source never filters in silence: it withholds and counts. While
`more` is true the count covers only this page, a lower bound, and nothing says it.

**A page is refused whole for anything ambiguous**, by `acceptRemoteAnswer` in
`@formancy/spec`, as a list is for one bad row (0077). `more` is required and must be a boolean,
because a page that does not say whether it goes on is a guess, and the guess that shows nothing
is "complete". `withheld` is absent, `undefined` or a safe integer of 0 or more, and `null` is not
a count. Any other key refuses the answer: a misspelt `moer: true`, or a `total` read as nothing,
would show a cut list as the whole one. A refused answer is a source that failed, which the
field says. A `labels` answer goes through the same gate, so a source answers its names the way
it answers a search. `acceptRemoteOptions` and `capRemoteOptions` keep their signatures and
their meaning: they are published, and widening what the first returns would hand a JavaScript
caller an object where it had an array.

**What the control can truthfully say about the rest is decided by `capRemoteAnswer`**, one
thing, in this order: `more`, with the count shown and never a total; `capped`, when the
control cut rows a source handed over without saying there were more, so that their number is
the total; `withheld`; and `complete` only when nothing was cut, nothing more matches and
nothing was withheld. `complete` is one value, so a renderer storing one complete answer after
another stores the same thing and draws nothing again.

**What a sourced control says is decided once, by `optionsStatus` in `@formancy/core/words`**,
as what a builder says after a command is ([0116](0116-what-a-builder-says-is-decided-once.md)).
Beside the words it says, in the entry every renderer reads and the engine never does, so the
engine's barrel does not grow. One sentence at a time, the first that applies:

1. A field disabled by a rule says nothing.
2. A failure, in the control's words.
3. Below the source's minimum: how many to type, or, under a select, that the field's answers
   are found by searching.
4. A typeahead whose list is closed stops there: only what typing fixes is said under a list
   nobody is looking at.
5. What the list leaves out — more, capped or withheld, as `capRemoteAnswer` decided.
6. *Searching…*, only when nothing above stands.

**Completeness is said when it changes or when the list opens, by holding it.** While a newer
search is in flight, the rows on screen are still the last answer's, so the sentence about them
still describes them and stays. A search that settles on the same sentence then writes nothing
to the live region, and nothing is announced again; a different sentence is a change, and is
said; opening a typeahead makes it appear, which is said. `aria-busy` on the box is the busy
signal meanwhile. A renderer resets what the last answer left out only where its rows stop
being shown — a failure, a refusal, a query under the minimum, a disabled field — and never when
a search starts.

**Each control says only what its person can act on.** A typeahead says what its list leaves
out, and *Searching…*, only while the list is open. A plain select, which has no "list opened"
anybody could listen for, says it while it is enabled. A field a rule disables asks the source
for one thing, the name of what it holds: no page, no `aria-busy`, an empty region, and no
list. A typeahead whose list was open when the rule landed hides it while the field is disabled:
a box disabled under the person is not reliably blurred, so nothing else closes it, and its rows
would still store a click into a field nobody may change. The generation that marks a request as
the current one moves before the disabled check, so the abort of a search in flight when the
field is disabled lands in a handler that knows it is stale, and reports no failure.

**A plain select has words of its own**: `options.failedListed`, `options.cappedListed`,
`options.moreListed` and `options.searchOnly`. It never asks below its source's minimum. The new
counts are plural messages keyed by `count`, as the French catalogue counts everything;
`options.capped` keeps its id, its `{shown}` and `{total}` and its kind, so a host that reworded
it keeps its word for the typeahead.

**A select whose search failed asks again when the person moves to it**: on focus, and only
after a failure. Focus comes before every way of opening a native select, by pointer or by
keyboard, and it is the person's own act.

A typeahead still asks for a page when it is drawn. Asking on its first open instead is a
separate change: that open would wait for the debounce and for the source, which deserves
measuring on its own.

## Consequences

**What it buys.** A source backed by a database says what it knows and nothing it would have to
count, and a list that is not all there is never shown as though it were. A plain select stops
asking anybody to type, and a select whose source was down can recover without the form being
reloaded. A screen reader hears what a list leaves out once, when it changes or when the list is
opened, rather than after every search. A read-only record says nothing under its lookups and
reads no page for any of them, and a field disabled under an open list leaves no row to click. An
Angular sourced field asks its source when what it asks changes, not again for every choice and
blur.

**What it costs:**

- **A host that calls `resolve` itself gets a union**, and its code does not compile until it
  narrows the answer — with `Array.isArray`, or through `acceptRemoteAnswer`. A host that only
  implements `resolve` compiles unchanged.
- **A host that reworded `options.failed` or `options.capped`** sees the plain select say
  `options.failedListed` or `options.cappedListed` in the shipped words; its own word reaches
  only the typeahead now, and it adds the select's.
- **While a sentence about the list stands, nobody sees *Searching…*.** `aria-busy` on the box
  says a search is in flight, to a screen reader and to a theme that draws it; a sighted reader
  of the status line alone sees the sentence and then the new list.
- **The control believes the source.** A page that says `more: false` when more rows match is a
  silently partial list again, and nothing here can tell; a `withheld` count is as true as the
  source made it.
- **`withheld` is not said while `more` is, nor beside `capped`.** One sentence at a time, and a
  lower bound is never said; rows withheld from a list the control also cut go unsaid.
- **A select asks again only when the person moves to it, and only after a failure.** Somebody
  already on the field when its search fails is asked for the list again once they leave it and
  come back.
- **A disabled field names what it holds only through `labels`.** Over a host that implements
  only `kind: 'search'` and answers `labels` with nothing, a disabled field shows the stored value
  itself, where 0.5.0's search when it was drawn could name it from the first page. A value chosen
  while the field was enabled keeps its name, because the rows it came from are kept.
- **A list open when a rule disables its field is hidden, not closed.** Both renderers derive
  what is drawn from the person having opened it and the field being enabled, rather than writing
  "closed" in answer to the rule, which in each would be state set in response to state. Enabled
  again before anything closed it, the list the person had open shows again. And the engine does
  not refuse a value set on a disabled field: the control's own element is what keeps one, so a
  control that draws anything clickable outside that element has to stop it itself
  ([SAFETY-ANALYSIS](../regulatory/SAFETY-ANALYSIS.md) B6a).
- **Nothing observes the reset when a field is disabled.** A disabled field says nothing whatever
  its last answer left out, so forgetting that answer could only show between the field being
  enabled again and its next answer, and no case looks there. Its busy and failure resets are
  each held by a case in both renderers.
- **A typeahead still reads one page when it is drawn**, for every sourced field on every form
  opened, before anybody opens a list.
- **The active option is still not scrolled into view**
  ([0072](0072-a-typeahead-is-a-combobox-over-the-same-answer.md)): a keyboard user arrowing
  down a page of fifty does not see where they are past the first rows the theme's list shows.
- **Conformance does not reach any of this.** Its driver cannot supply a source or read a status
  region, and widening a published driver interface was not this change. The two renderers are
  held to one behaviour the way 0077 and 0072 already are: shared functions in `@formancy/spec`
  and `@formancy/core/words`, and near-copy test files with the same case names.
- **What it weighs, measured on 2026-10-16** as arc42 §9.3 measures, brotli: `@formancy/spec`
  grew 1.0 kB, and 0.3 kB with the comments the bundler keeps taken out of both builds;
  `@formancy/core/words` 1.4 kB, and 0.9 kB without them, for six sentences in three languages
  and `optionsStatus`; the React barrel 0.1 kB. The engine's `dist/index.mjs` was
  byte-identical.

## Alternatives considered

**`resolvePage` beside `resolve`.** Equivalent in what it can say, and two answers to one
question with a rule for which one the control believes when a host implements both.

**`{ options, total }`.** A count per keystroke is the scan a paging source exists to avoid.

**An offset in the request and a "Show more" row in the list.** An option that is not an answer
breaks 0072's "nothing the person types can be stored" and the listbox pattern, and a button
outside the box closes the list when the box loses focus to it.

**Emptying the region when a search settles on the sentence it already said.** It stops the
repetition by taking the sentence away from a sighted reader while the list is still cut: the
silently partial list again, for the people who read the screen.

**Asking a failed select again on a timer.** Load on a source that is down, from every sourced
select on every form open, and a live region speaking on a schedule nobody chose.

**A select asking its source below the minimum anyway.** The minimum is the source saying that
an empty question is too broad to answer, and a select has only the empty question.

**Widening `acceptRemoteOptions` to take a page.** It is published, and a JavaScript caller
would be handed an object where it had an array, on which `.map` throws.

**The order written in each renderer, as it was.** Two copies of one decision, with a control
kind, an open list, a disabled field and a held sentence added to each, would drift where
nobody looks — the drift [0091](0091-a-second-builder-is-a-binding.md) and 0116 exist to
prevent.

**Asking on a typeahead's first open rather than when it is drawn.** One page fewer per sourced
field per form opened, and the first open would wait for the debounce and the source. Separable,
and not taken here.
