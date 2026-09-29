# 0085 — A tag picker is a widget, and a widget has a version

- **Status:** accepted
- **Date:** 2026-09-29
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/spec/src/tagpicker.test.ts` — six cases, including the one this
  record is named for: *'is refused in a version 2 document, by name and with the version
  it needs'*, observed failing before the gate asked **which** widget. The control is held
  by `packages/react/src/tagpicker.test.tsx` and the signature block in
  `packages/angular/src/new-types.test.ts`, by role and accessible name in both; the
  server's half by *'a list answer from a source'* in
  `packages/server-core/src/options-membership.test.ts`.

## Context

The many-answer picker was the half of the combobox row the roadmap kept carrying. One
answer from a list the document holds is `widget: "typeahead"` on a `select`, built in both
renderers ([0072](0072-a-typeahead-is-a-combobox-over-the-same-answer.md)). Several answers
from a long list had nothing.

Everybody's first description of it is a field type — "a tag field". It is not one: the
answer is an array of offered option values in the options' own order, which is exactly
what a `selectboxes` stores without it. What changes is that a list too long to tick
through becomes usable.

Writing it exposed two things that were quietly wrong.

**The version gate asked whether a field had a widget, not which.** `widget` arrived in
version 2, so the check `field.widget !== undefined && declared < 2` answers correctly for
every widget version 2 has and says nothing about any later one. A version 2 reader given
`widget: "tagpicker"` would have rendered the default control — tick boxes — collected the
same answers, and looked **entirely correct**. That is the silent failure the version line
exists to prevent, and it would have shipped inside the feature that introduced it.

**A sourced list answer was never checked.** The tag picker's reason to exist is a long
list, often one the deployment resolves. `sourcedAnswers` collected values with
`typeof held !== 'string'`, and an array is not a string — so every value in a
`selectboxes` with an `optionsSource` would have been stored with nothing having looked at
it. That is hazard A7 wearing a different shape of answer.

## Decision

**`tagpicker` is a widget on `selectboxes`**, not a field type. A widget changes how a
field looks and never what it stores, and that line is the whole reason widgets are
affordable ([0066](0066-a-widget-may-be-configured.md)).

**A widget is gated by which widget it is.** `SPEC_2_WIDGETS` names the four version 2
has; anything else needs the version it arrived in. The same shape the field types already
use, for the same reason, and it had to be written the moment a third version existed.

**`optionsSource` widens to list-valued fields, and the widening is itself a version.** A
version 2 reader refuses the combination, so a document using it is not a version 2
document however version 2 the property looks on its own. `sourcedAnswers` walks a list
answer as several answers to one question — one entry per value, all carrying the field's
own path, because the field is wrong when any of its answers is and naming an index would
describe a payload rather than the question.

**The control is a labelled combobox with a list of chips, not a fieldset.** A
`selectboxes` without the widget is a group of controls and a legend names it correctly. A
tag picker is one control plus a record of what has been chosen — and the first version
built it as a fieldset, which named the group and left the box somebody types into with no
accessible name at all. The case that asks for the combobox by name caught it.

**Every chip carries its own remove button, named after the answer it removes.** "Remove"
three times over tells a screen reader user which nothing, and a chip a pointer can add
and only a pointer can take away is WCAG 2.1.1 — the failure this pattern ships with more
often than any other.

## Consequences

**The combobox half is the typeahead's, deliberately**: the same roles, the same keys, and
the same `narrowOptionsByLabel` from `@formancy/spec`, so a query cannot fold case one way
in React and another in Angular. What differs is that choosing does not fill the box — it
adds a chip and clears it, because the next answer is the common case.

**Backspace on an empty box takes the last chip back**, which is what every tag picker
does and what fingers expect. It is the one gesture here with no visible control, and it is
additive: the remove buttons do the same job for anyone who does not know it.

**There is no way to add an answer that is not offered.** A tag picker in other products
often creates new tags. Here an answer is one of the options
([0076](0076-an-answer-is-one-of-the-options.md)), on the server as well as in the browser,
and a field that minted values would have no list to check them against.

**Six new parts for a theme to dress**, and the popup needs an anchor of its own for the
reason the typeahead documented: an absolutely positioned child of a grid container takes
the container's origin as its static position, so a popup without one opens over its own
label.

## Alternatives considered

**A `tags` field type.** Everybody's first description, and it would have cost a type, a
value shape, a validator, a server path and a line in every list of types — to store what
`selectboxes` already stores. Rejected on the same rule that made `datagrid` a widget.

**Allow new answers to be typed in**, as a tag input usually does. Rejected because it
contradicts a rule that is enforced on the server: an answer is one of the options offered.
A field that could mint values would need a different membership story, and the honest way
to ask for free text is a text field.

**Gate the widget by listing the version in `WIDGETS_BY_FIELD_TYPE`.** Tempting, since the
map already exists. Rejected because that map answers "may this type have this widget",
which is a different question from "may this document" — and a map answering two questions
is a map that answers one of them wrongly after the next change.

**Leave `optionsSource` to `select` and ship the tag picker over document options only.**
Smaller, and it would have left the widget's main case unbuilt while the roadmap said the
feature was done. Rejected on that, and because the membership hole would have been there
waiting for whoever did widen it.
