# 0077 — Options may come from a named source

- **Status:** accepted
- **Date:** 2026-09-27
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/spec/src/validate.test.ts` (7 cases: a select naming a
  source, both-list-and-source refused *in words an author can act on*, a name that is
  an address refused, only a `select`, the version-1 gate, and a listed select exactly
  as valid as before). `packages/spec/src/options-source.test.ts` (12 cases on what a
  source is allowed to return). `packages/react/src/options-source.test.tsx` and
  `packages/angular/src/options-source.test.ts` (13 and 11, deliberate near-copies).
  `packages/server-core/src/options-membership.test.ts` (13 cases, including that a
  source which throws fails the submission **closed**).
  `packages/server-core/src/use-cases.test.ts`, *'a document naming a list this deployment
  cannot resolve'* — the **publish-time** refusal, which this line did not name and no test
  reached: refused and naming the list, published once the deployment offers it, and
  published unchecked where the deployment configures no sources at all. Observed failing
  with the branch removed, and the third case observed failing with the branch made
  unconditional. `SAFETY-ANALYSIS.md` A7 asserts this constraint in prose and nothing had
  failed if it stopped being true.

## Context

A `select` carries its answers in the document. That is right for a canton list and
wrong for an employee directory: too many to write down, and out of date the week
after publication.

The request arrived as "connect an external data source". Taken literally that means a
URL in the form document, and a URL in a form document is three problems at once:

- **It is a deployment detail in a portable format.** The same form copied from
  staging to production points at the wrong system.
- **It cannot be corrected.** A published version is frozen forever
  ([0025](0025-immutability-in-the-database.md)), so a host that moves is a form that
  is broken for good.
- **It is attacker-influenceable.** A self-hosted instance sits inside a private
  network, and [`SAFETY-ANALYSIS.md`](../regulatory/SAFETY-ANALYSIS.md) already treats
  a URL somebody can author as the most under-appreciated risk in this product.

And one more thing was true before any of this was designed, measured against the
built engine: **nothing checked that a select's answer was one of its options at all.**
That was fixed first, separately ([0076](0076-an-answer-is-one-of-the-options.md)), so
that this record is about weakening a guarantee that exists rather than about a gap
nobody had noticed.

## Decision

**A NAME in the document. The deployment resolves it. Never a URL — not now and not
later.**

`optionsSource: "cantons"`, bounded to `^[a-z][a-z0-9-]*$` and 64 characters:
enumerable in a deployment's configuration, greppable across published versions, and
unmistakably not an address.

**Mutually exclusive with `options`**, because a field with both has two answers to
"what may be chosen" and no rule for which wins.

**`select` only.** Not `radio` — a source returning a thousand rows renders a thousand
radios — and not `selectboxes`, whose multi-answer picker is foreclosed separately and
stays so. Widening later is additive.

**Gated on the TYPE and not on the widget.** `optionsSource` decides which answers
*exist*, so the plain `<select>` honours it as well as the typeahead; a widget-gated
branch would also be invisible to the builder's generated panel, which would ship the
property inert.

**Nothing in formancy fetches anything.** In the browser the host supplies a **map** of
sources — the third instance of the inversion the uploader and the scanner already are
([0071](0071-a-scanner-is-supplied-not-built.md)), with one deliberate difference. A
map rather than one resolver, because the control must know **synchronously** whether a
name resolves: absence here is the *file field's* branch and not the scanner's. A text
field with no scanner still collects by typing; a select whose options come only from a
source collects nothing, so it says so where the chooser would be.

**On the server, an injected port and no HTTP client.** `members(values)` returns the
values it does *not* offer, so an adapter answers from a SQL `IN` clause without
materialising a list. `@formancy/server-core` still imports no `URL` and no `fetch`:
for a real source this is a database query, and shipping an HTTP adapter would add
outbound-request and confused-deputy surface to a regulatory set that claims neither.

**A source that cannot answer fails the submission closed**, with a 503 rather than a
422. Nothing about the submission is wrong; a list this deployment owns could not vouch
for it. A refusal is retryable and the draft still holds the answers, where an accepted
bogus value is undetectable afterwards.

## Consequences

**The guarantee, in one sentence that is true:**

> A `select` with `optionsSource` stores a string of 1 to 200 characters that the
> deployment's own source confirmed was a member at the instant the submission was
> accepted — or, where the deployment supplied no `members` function, that nothing
> checked at all.

Said out loud because it is **weaker than what a listed select gives**, and the weaker
guarantee is the thing being asked for. Two consequences no configuration can buy:

- **Membership *now*, never membership *then*.** A value legal when it was chosen can be
  refused minutes later, and `staleVersionPolicy` offers no re-offer path. A deployment
  chooses between an unchecked answer and an occasionally unfixable refusal.
- **The stored answer may stop being readable.** A document with `options` carries
  value→label forever in an immutable record; a source is under no such obligation.
  Recording the label would change what a `select` collects, which is a field type and
  not this ([0065](0065-a-widget-is-authored-not-registered.md)). `apps/admin` shows
  stored values rather than labels, so this bites the archive rather than the screen.

**`schemaHash` no longer determines what a valid answer is** for such a field, and a
stored submission cannot be re-judged later. `optionsSource` in the document is exactly
what declares that: it is greppable, enumerable per published version, and visible in
the builder and in the generated reference.

**What a source returns is unchecked input**, so `acceptRemoteOptions` refuses the
**whole list** on a bad row rather than filtering it. A partial list silently lacks the
row somebody came for, and they cannot tell that from a source that does not have it. A
duplicate value is refused for a second reason: two rows with one value are two DOM
elements wanting one id, and in Angular a duplicate `track` key throws.

**A version-1 reader refuses the whole document**, and that must stay a validation
error rather than a silent one. The schema is closed, so it answers `Unknown property
"optionsSource"` instead of rendering a select with no options — which would be the same
field quietly collecting nothing. `versionErrors` says so, because that is the only
place the author finds out. **Spec 2 has never been released, so no version moves.**

**Accessibility.** `aria-busy` and never `disabled`, because disabling the element
somebody just typed into blurs it and the browser resets focus to the document body.
One status region saying four things — searching, type more, showing the first N of M,
could not be loaded — and **never** the error region, which carries the engine's verdict:
a source being down is not a wrong answer. A `labels` request names what a draft already
holds, so a resumed form is not an empty box over a stored answer.

## Alternatives considered

**A URL in the document.** What was literally asked for, and rejected on all three
grounds in *Context*. Naming a source costs one line of deployment configuration and
removes an entire class of failure.

**One resolver function, like `Scanner`.** Rejected: absence would only be discoverable
by calling it and failing, and the control has to decide *before* rendering whether it
can offer a chooser at all.

**Letting the control re-filter what a source returned.** Rejected: a source is handed
the query and is the authority on narrowing; re-folding its rows would drop ones it
matched on data the person cannot see. A host wanting fetch-once-filter-locally composes
`narrowOptionsByLabel` in its own resolver, which is why that function is exported.

**Shipping an HTTP adapter for `members`.** Rejected: see above. It is named as a gap
rather than hidden — a deployment writes ten lines against its own database.

**Recording the chosen label alongside the value**, so the archive stays readable.
Rejected: it changes what a `select` collects, which is a different field type and a
different decision.
