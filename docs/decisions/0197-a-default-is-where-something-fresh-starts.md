# 0197 — A default is where something fresh starts, and the field checks it as an answer

- **Status:** accepted
- **Date:** 2026-10-27
- **Extends:** [0194](0194-spec-5-opens-with-a-fields-description.md), as the fourth construct of
  the version it opened; [0023](0023-model-properties-in-engine.md)'s rule for a repeater shown
  again, which this applies to a field
- **Deciders:** Daniel Bacher
- **Verified by:**
  - **`packages/spec/src/default.test.ts`.** A default of the field's own JSON type validates on
    every type that holds one answer or a list of ticks; another JSON type, an empty one, and
    one on a file, signature, ranking, matrix, static, rich text, group or repeater field are
    refused; a version 4 document carrying one is refused with `version.property`.
  - **`packages/core/src/default.test.ts`.** A new form starts with every default — beside its
    siblings in a page, inside its group, in the row a repeater's minimum seeds — and the rules'
    first pass sees them; nothing handed in is filled; a row added starts with them and holds a
    copy rather than the document's own list; a field hidden and cleared, from the start or
    later, has its default again when it is shown, and one that kept its answer keeps it;
    `withDefaults` fills a prefill's absent answers and leaves a cleared one cleared; and a
    default the field would refuse — not an option, out of bounds, the wrong shape — or one on
    a computed field keeps the engine from opening the document, naming the field. Every
    engine case failed before the change; the copy case failed again with the copy removed, and
    the re-show cases with `reopened` disabled.
  - **`packages/server-core/src/submitting.test.ts`**, *a default is never stored by the
    server*: a response without the answer is stored without it, and one handed in with no data
    at all is stored as `{}`. The second stored the default until the replay passed `{}` for a
    missing body.
  - **`packages/builder-core/src/retype.test.ts`**: a field's kind changed keeps a default the
    new field accepts and drops one it would refuse. Before, a number's default made the change
    to text refused outright.

## Context

The gap survey behind version 5 found a default value among the constructs an evaluator
expects: a delivery option most people pick, a country most respondents live in, a count that is
usually two. The format had none. A host could hand the engine an initial value, but that is the
host's code, not the form's — an author in the builder had no way to say it.

A default looks like one line and is three decisions. **When it applies**, because the engine
starts from more than one place: a new form, a resumed draft, a host's prefill, and on the server
the replay of every submission. **What it may be**, because it is an answer, submitted unless
somebody changes it, and every answer is checked. **What it is in the record**, because a stored
answer that was left at its default is indistinguishable from one chosen.

## Decision

**`default` on a field that holds one answer or a list of ticks** — text, long text, hidden,
number, tick box, date, time, date and time, select, radio and selectboxes — of that answer's
JSON type, which the schema states per type so the builder's panel offers the right editor.

**It is where something fresh starts, and nothing else:**

- a form opened with nothing handed in;
- a row added to a repeater, including those its minimum seeds;
- a field shown again after its hiding cleared it — the rule 0023 gave a repeater, which opens
  again with its minimum rather than the rows its hiding took. A field that keeps its answer
  when hidden keeps it.

A draft, a prefill and the server's replay start exactly as they were handed in. Filling any of
them would put back an answer somebody cleared, and on the server would store an answer nobody
sent. The server passes `{}` for a missing body for the same reason: an engine handed nothing
starts a new form. A host whose prefill should start as a new form would calls
`withDefaults(schema, prefill)`, the engine's own fill, so the two cannot disagree.

**The field checks it as an answer.** The engine refuses to open a document whose default its
field would refuse — not an option, out of bounds, not a date — with `modelViolations`, the
check every answer gets in the browser and on the server. One check rather than a second set of
rules for defaults, which would be a second opinion. The refusal reaches the publish gate,
`validate_form` and the builder through `engineRefusal`, as a rule that does not compile does. A
default on a computed field is refused too: the engine's value would overwrite it unseen (0181).

**It is an answer, not a text**, so it is stored as written and not translated.

## Consequences

**A form can start answered**, and the rules see it: a default that a rule reads shows or hides
what it would if somebody had chosen it.

**A default left alone is stored as the person's answer.** Nothing records that it was the
default; the format cannot tell a default left alone from the same answer chosen, and this does
not try. Where the difference matters — a clinical question, a consent — the field should have
no default, and `required` without one makes the person answer. A required field with a default
is answered before anybody reads it. `SAFETY-ANALYSIS.md` A10 states it.

**A field shown again shows its default again**, even to somebody who cleared it, changed the
answer that showed it and changed that back.

**Changing a field's kind in the builder keeps a default only if the new field accepts it**,
asked with `acceptsDefault`, the same check.

**The engine has one more reason to refuse a document**, and one more construct in an open
version, which a version 4 reader refuses.

## Alternatives considered

**Fill every absent answer, wherever the engine starts.** One rule instead of three — and a
resumed draft gets back every default somebody cleared, and the server's replay stores a
default for every question a response left out. Defaults only where something is fresh is the
rule that cannot invent an answer.

**Check a default in the document's validator**, as a path-addressed error the builder shows
beside the property. Better words, and a second implementation of every bound, pattern, format
and mask the engine already checks. Two opinions about the same answer is the failure this
project exists to prevent; the JSON type is the schema's, and the rest is the field's.

**A default per language.** A default is an answer, and an answer has one value whatever
language the question was read in; a form wanting a different starting answer per language
wants a prefill.

**Record which answers were left at their default.** Real information, and a change to what a
submission is, for every consumer of one. Not this construct; a later one if it is asked for.
