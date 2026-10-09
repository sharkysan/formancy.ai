# 0139 — A matrix answers one question per row, and stores the rows answered

- **Status:** accepted
- **Date:** 2026-10-09
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/spec/src/matrix.test.ts` — a matrix is a type that is not a list,
  accepted in version 4, refused in version 3 with version 4 named, needs a row and two
  columns, refuses two rows or two columns sharing a value, carries no bounds and no options
  source, and is the only type with rows; a picture is refused on a matrix column, on a
  ranking's option, and on a row. `packages/core/src/matrix.test.ts` — it starts with no row
  answered, stores the column under each row, required means every row, an optional one may be
  answered in part, a row it lacks, a column it does not offer and anything but a map of strings
  are refused in client and server mode, and it reads as a map in a rule — `{}` untouched, so
  `has()` answers. The conformance fixture *a matrix answers one question per row, and a
  required one needs every row*, run by both renderers' drivers, Material included.
  `packages/react/src/matrix.test.tsx` and `packages/angular/src/matrix.test.ts` — a group per
  row named by the row, radios named by the column, and each row its own radio group.
  `packages/builder-core/src/properties.test.ts` — no list-of-object property is offered as a
  line of text, and a matrix's rows get the options editor without pictures;
  `conditions.test.ts` — the condition editor reads a matrix as answered when any row is;
  `palette.test.ts` — a new matrix inserts. Both builders' property-panel tests — the rows are
  edited under their own words. `apps/playground/src/starter.test.ts` and its scenarios — the
  starter carries a required one, and a row left blank is refused.

## Context

The second survey construct version 4 was opened for, after the ranking
([0138](0138-a-ranking-stores-the-order-chosen.md)). A matrix asks the same question of several
things — how was the taste, the delivery, the price — with the same answers for each. No type
stored that: a group of radio fields makes every row a field with a key of its own, so adding a
row adds a field, and the shared answers are written out once per row.

## Decision

**One field with `rows` and `options`.** The rows are value/label pairs, without pictures; the
options are the columns every row shares. A matrix needs a row and two columns, and neither two
rows nor two columns may share a value.

**The answer is an object from row value to column value, holding the rows answered** — `{}`
untouched. A row added later leaves every stored answer as it was. A rule reads it as a map:
`has(rating.taste) && rating.taste == "poor"`, the guard a rule into a group needs, and the
engine seeds `{}` so the guard answers on an untouched form rather than erroring.

**Required means every row.** A matrix asks one question per row, and a required one half
answered has not been answered. An optional one may be answered in part. The engine refuses a
row the matrix does not have (`row`), a column it does not offer (`option`) and anything but a
map of strings (`type`), on the server as well.

**A group per row.** The matrix is a fieldset named by its label; each row is a fieldset named
by its row, holding a radio per column named by its column, with a name of its own so choosing
in one row never clears another. That is a native radio group per row — arrow keys within it,
Tab between rows — and every answer is reached by role and name. Looking like a grid is the
theme's: the four form themes dress a matrix option as they dress a radio option.

**The builder edits the rows with the options editor**, chosen by what a property's items are
rather than by its name: taken by name, the rows arrived as a text box asking for JSON. The
editor says "Rows" and adds "New row"; the words are decided in `builder-core` and both
builders read them. The condition editor offers a matrix *is answered* and *is not answered*,
meaning any row; a comparison of one row is written in CEL.

**Pictures are refused where they would not be drawn.** Working out where a matrix column's
picture would go found that the ranking accepted option pictures it never drew. Both refuse
one now, as a dropdown does ([0126](0126-an-option-may-carry-a-picture.md)).

## Consequences

**No "not applicable" column unless the author writes one.** A radio cannot be unticked, so a
row answered by mistake stays answered; a matrix that must allow "does not apply" says so as a
column.

**CSV exports a matrix as its JSON object** in one column, as it exports any structured
answer. A column per row would read better in a spreadsheet and is not built.

**The condition editor cannot compare one row.** It would need a row chooser beside the field
chooser; until then a rule about one row is CEL, which the rules overview shows as CEL.

**A wide matrix is wide.** Rows wrap their options on a narrow screen rather than scroll, so a
matrix of seven columns at 320 pixels is a list per row. That is the reflow WCAG 1.4.10 asks
for; it is not a grid any more.

## Alternatives considered

**A `<table>` of radios.** The grid most survey tools draw. A table's semantics announce rows and
columns as data, and each radio would need a name built from two headers — "Taste, Poor" — where
a group per row gives it one.

**A group of radio fields.** What forms do today without the type: rows become fields, keys
multiply, the shared columns are copied per row, and adding a row is a structural change.

**A list of answers in row order.** A row inserted later shifts every stored answer by one.

**Required meaning one row.** It would accept a matrix of ten rows with one answered as complete,
which is not what "this question is required" says to an author.
