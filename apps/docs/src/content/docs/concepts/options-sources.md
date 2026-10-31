---
title: Lists from a source
description: How a select or a list of ticks gets its answers from the deployment by name, what a source may answer — every row, or one page that says it goes on — what is refused whole, and what each control says and when.
---

A `select` usually carries its answers. One that names an `optionsSource` gets them from the
deployment instead — an employee directory, a list of pickup points, anything too long to write
into a document and out of date the week after it is published:

```json
{
  "key": "deliveryPoint",
  "type": "select",
  "widget": "typeahead",
  "label": "Where to collect it",
  "optionsSource": "pickup-points"
}
```

**The document names the list, and never says where it lives.** `pickup-points` is a name the
deployment resolves: a lower-case letter, then lower-case letters, digits and hyphens, at most
64 characters. A URL in a form document would be a deployment detail in a portable format,
unfixable once a version is published, and a request somebody can author against a server
inside a private network
([0077](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0077-options-may-come-from-a-named-source.md)).
A field has `options` or `optionsSource`, never both, because a field with two answers to "what
may be chosen" has no rule for which one wins.

The plain select honours a source, and so does `widget: "typeahead"`, which is the control the
feature is for: a list too long to scroll is a list to search.

**A `selectboxes` may name one too**, for several answers from the deployment's list
([0215](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0215-a-list-of-ticks-draws-its-sources-rows.md)):

```json
{
  "key": "otherPoints",
  "type": "selectboxes",
  "widget": "tagpicker",
  "label": "Other points that would suit you",
  "optionsSource": "pickup-points"
}
```

- **Tick boxes ask once, with nothing typed, as a plain select does**, and draw a box per row.
- **A tag picker asks with what is typed, as a typeahead does**, and names each chip by the row it
  was chosen from.
- **What the form already holds is ticked, or shown as chips, named by the source.** The names
  are asked for in one request.
- **The answer is the rows' values, in the order they were ticked.** A source writes no order
  down, so two people choosing the same rows in a different order store different lists.
- **No sourced answer can be exclusive.** `exclusive` is an option's property, and a sourced
  field has no options.

## Supplying the sources

The host hands the renderer a map of sources by name. Nothing in formancy makes a request of its
own; `resolve` is a call to whatever already holds the list.

```tsx
import { OptionsSourcesProvider } from '@formancy/react'
import type { OptionsSources } from '@formancy/react'

const sources: OptionsSources = {
  'pickup-points': {
    maxRows: 6,
    resolve: ({ kind, query, values, limit, locale, signal }) => yourLookup(/* … */),
  },
}

<OptionsSourcesProvider value={sources}>
  <FormancyForm />
</OptionsSourcesProvider>
```

Angular takes the same map through `provideFormancyOptionsSources(sources)`.

A map rather than one function, because the control has to know before it draws whether it can
offer a chooser at all. A field whose source is not in the map says so where the chooser would
be — *This field's answers come from "pickup-points", which this application has not
provided.* — since a select that can offer nothing collects nothing.

Beside `resolve`, a source may set `debounceMs`, how long to wait after a keystroke before
asking; `minQueryLength`, below which nothing is asked; and `maxRows`, how many rows the control
shows at once. The control has a default for each, and a search's `limit` is the `maxRows` in
force.

## What a source is asked

| Field | What it is |
| --- | --- |
| `kind` | `search` when somebody wants matching rows; `labels` when the form already holds values and needs their names |
| `source` | The name the document gave |
| `path` | The field's data path, `deliveryPoint` or `people[1].deliveryPoint` |
| `query` | What was typed. A plain select asks with the empty one, and a `labels` request carries none |
| `values` | The stored values to name, on a `labels` request |
| `locale` | The language the form is read in. A label is a plain string, never a `{$t}` reference, so the source answers in this language |
| `limit` | How many rows the control will show |
| `signal` | Aborted when the answer stops being wanted — a newer keystroke, the field being disabled, or the control going away |

**The source narrows, and the control does not narrow again.** It was handed the query and is the
authority on what matches; a control that filtered its answer again would drop rows the source
matched on data the person cannot see. A search is superseded by aborting the one before, so a
source that honours `signal` stops work nobody is waiting for.

A `labels` request names what a resumed draft or a saved record already holds, so the field is not
an empty box over a stored answer. It is asked at most once per value.

## What a source may answer

Either shape, from the same `resolve`.

**Every matching row**, as a list of `{ value, label }`. The control shows the first `maxRows`
and, when it cut the list, says how many of how many — true, because these are every row there
is.

**One page**, as `{ options, more, withheld? }`, for a source that cannot afford to count. A
database pages: it reads one row more than it shows to know whether there are more, and does not
count them, because a count reads every matching row on every keystroke — the scan paging exists
to avoid. So a page says what it knows and nothing it would have to count:

```ts
resolve: async ({ kind, query, values, limit, signal }) => {
  if (kind === 'labels') return yourRowsByValue(values, { signal })
  // One row more than the control shows says whether the list goes on. Nothing counts the rest.
  const rows = await yourSearch(query, { limit: limit + 1, signal })
  return { options: rows.slice(0, limit), more: rows.length > limit }
}
```

`more` says rows match beyond these, and the control says so without a number. `withheld` counts
rows the source matched and cannot hand over — a value longer than the 200 characters a select can
store, or a pickup point that has no code yet. A source never filters in silence: it leaves such a
row out of `options` and counts it, and the control says *One match cannot be chosen here.*,
so nobody reads "no such point" for one that exists — even when it shows no row at all. While `more` is true the count covers only this
page, a lower bound, and nothing says it.

The playground's *Where to collect it* answers this way, over its pickup points and one with no
code yet: open it and it says there are more, type `zür` and it says nothing, type `chur` and it
shows no row and says one match cannot be chosen.

## What is refused whole

What a source answers is unchecked input from a system nobody here has seen, so it is checked
once, in `acceptRemoteAnswer` in `@formancy/spec`, which both renderers read. It refuses the
**whole answer**, never part of it, when:

- a row has an empty value or one longer than 200 characters, a label that is not a non-empty
  string, or the same value as another row;
- a page has no `more`, or a `more` that is not `true` or `false` — `'true'` and `1` included;
- a page's `withheld` is not a whole number of 0 or more — `null` included;
- a page carries any other key: a `total`, a misspelt `moer`;
- the answer is neither a list nor a page.

A partial list silently lacks the row somebody came for, and they cannot tell that from a source
that does not have it; a key read as nothing would show a cut list as the whole one. So a refused
answer is a source that failed, and the field says so — in its own status line and never in its
error region, which carries the engine's verdict on the answer: a source being down is not a wrong
answer. A `labels` answer is read the same way, in either shape.

## What each control says, and when

Each sourced control has one status line, a polite live region, and says one thing at a time, in
this order: a failure; a query under the source's minimum; what the list leaves out; that a search
is in flight. Success says nothing — the list and the active option are the feedback.

| | Typeahead | Plain select |
| --- | --- | --- |
| The source failed, or its answer was refused | The options could not be loaded. Type to try again. | The options could not be loaded. They are asked for again each time you move to this field. |
| Under the source's minimum | Type at least 3 characters to search. | This field's answers are found by searching, which this list cannot do. |
| A page that goes on | Showing the first 6; there are more — keep typing to narrow. | Showing the first 50; there are more than this list can show. |
| Every row, cut by the control | Showing the first 50 of 120 — keep typing to narrow. | Showing the first 50 of 120. |
| Rows withheld, and nothing else left out | One match cannot be chosen here. | One match cannot be chosen here. |
| Searching, with nothing above standing | Searching… | Searching… |

**A typeahead says what its list leaves out, and *Searching…*, only while the list is open.**
Closed — after a choice, after Escape — it says only what typing fixes: a failure, or a query too
short. An open list with nothing in it and nothing else to say says *No options match*.

**A plain select says it while it is enabled.** It has no "list opened" anybody could listen for,
and nowhere to type, so its sentences ask nobody to type. Over a source with a minimum it never
asks, since its question is always the empty one.

**A tag picker says what a typeahead says, and tick boxes what a plain select says**, but for a
failure. A list of ticks that did not arrive may have no box to move to, so it says only *The
options could not be loaded.* and draws a **Try again** button.

**A field a rule disables says nothing**, and asks its source only for the name of what it holds:
no search, no busy box. A saved record opened read-only reads no page for any of its lookups. A
typeahead whose list was open when the rule landed hides it, so no row is left to click into a
field nobody may change; enabled again before anything closed it, the list shows again.

**What the list leaves out is held while the next search is in flight.** The rows on screen are
still the last answer's, so the sentence about them stays, and `aria-busy` on the box says a
search is on its way. A search that settles on the same sentence changes nothing in the region,
so a screen reader hears it once — when it first appears, when it changes, or when the list opens
— rather than after every keystroke. A failure, a refused answer and a query under the minimum
each empty the list, and a sentence is not held past any of them.

What a control says is decided once, by `optionsStatus` in `@formancy/core/words`, and both
renderers draw what it returns; the words are in the form's language, English, German or French,
or a host's own, given a message at a time under the `options.` ids of `FORM_WORDS`. A plain
select has ids of its own where its sentence differs from the typeahead's, so words a host gave
the typeahead's sentence do not reach it
([0177](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0177-a-source-may-say-its-list-goes-on.md)).

## A select whose source failed asks again

A typeahead, or a tag picker, asks again on the next keystroke. A select cannot be typed into and its question never
changes, so it asks again when the person moves to it — on focus, which comes before every way of
opening a native select, by pointer or by keyboard — and only after a failure, so a working select
is not asked again on every visit. Not on a timer: that would put load on a source that is down
from every sourced select on every open form, and a live region would speak on a schedule nobody
chose.

Tick boxes ask again from their **Try again** button. The button stays, with the focus on it, while
the source is asked again. Once the rows arrive the focus moves to the first box, rather than
falling to the page when the button goes; if it fails again, the focus stays on the button.

## On the server

The browser's list is a convenience; what may be **stored** is the server's question. A
deployment configures the same names in `ServerDeps.optionsSources`, and a source's
`members(values)` returns the submitted values it does **not** offer, so an adapter can answer from
a SQL `IN` clause without building a list. A value it does not offer is refused with the same
`option` code a document's own options produce, before anything is written. A source that throws
fails the submission closed, `503` and retryable. A source configured without `members` means
*this list exists and I cannot check it*, and then nothing checks. A document naming a source the
deployment does not configure is refused at publish, where the deployment configures any. One that
configures none checks nothing, at publish or at submission, and the server's image is one: its
`main.ts` passes `createApp` no sources, so a deployment that wants the check composes `createApp`
with `optionsSources` itself. Paging changes none of this: `more` and `withheld` are what the
browser is told, and `members` is asked about every value submitted. The whole flow, browser and
server, is drawn in the architecture's
[runtime view](https://github.com/sharkysan/formancy.ai/blob/main/docs/architecture/06-runtime-view.md).

## Styling it

| Part | What it is |
| --- | --- |
| `typeahead-status` | The typeahead's status line. `data-state="failed"` while its source has failed |
| `select-status` | The plain select's status line |
| `tagpicker-status` | A sourced tag picker's status line. `data-state="failed"` while its source has failed |
| `checkbox-status` | Sourced tick boxes' status line. `data-state="failed"` while its source has failed |
| `checkbox-retry` | Sourced tick boxes' **Try again** button, drawn while their source has failed |

## Not built

- **A typeahead, or a tag picker, asks for a page when it is drawn**, before anybody opens it, if its source has no
  minimum and the field is enabled — one read per such field per form opened. Over a source with a
  minimum it asks nothing until somebody types that much.
- **Tick boxes show the first page and nothing more.** They ask once, with nothing typed, so over
  a source with more rows than they show they draw the first ones and say how many. A field over
  such a list wants the tag picker, as a select over one wants the typeahead.
- **A "Show more" row, or an offset to ask for the next page.** An option that is not an answer
  would be something the person could choose and the field could not store.
- **Checking the source.** The control believes what it is told: a page that says `more: false`
  when more rows match is a list that looks complete, and nothing here can tell.
