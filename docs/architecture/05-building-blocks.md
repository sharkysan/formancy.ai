# 5. Building blocks

## Level 1 — the layer cake

Dependencies point downward only. The boundary between L2 and L3 is where
platform dependencies become permissible.

```
L5  themes                       CSS only. Nothing depends on these.
    ├─ blueprint.css             light, technical, invalid = leading bar
    └─ dusk.css                  dark, rounded, invalid = ring
─────────────────────────────────────────────────────────────────────
L4  unstyled component kits      semantic HTML, zero CSS, a11y-correct
    builder-react                the builder's own UI, on react
    tiptap                       optional editing surface, on spec only
─────────────────────────────────────────────────────────────────────
L3  react            angular     reactivity adapter · registry · focus
─────────────────────────────────────────────────────────────────────
L2  core                         the engine — no framework, no DOM, no Node
─────────────────────────────────────────────────────────────────────
L1  expressions                  CEL parse · check · compile · evaluate · policy
─────────────────────────────────────────────────────────────────────
L0  spec                         types · JSON Schema · diff · canonical hash

    builder-core                 sits beside L2: spec, and expressions for the
                                 one thing a document engine cannot do by hand
    conformance                  sits beside L2: depends on spec only
    challenge                    sits beside L0: isomorphic, mint/solve/verify
    server-core                  depends on core and spec; no HTTP types
    server                       Fastify routes, PostgreSQL, auth runtime
    mcp                          an agent's view of a running server
```

**`tiptap` is at L4 and nothing depends on it.** It is the only package a
renderer uses without importing: the renderers declare an interface and the HOST
passes an implementation in, the same arrangement the `file` field uses for its
uploader and the `scanner` widget for its camera
([0071](../decisions/0071-a-scanner-is-supplied-not-built.md)). That inversion
is what keeps ProseMirror — larger than the renderer that would have held it —
out of the default path for the forms that have no rich-text field, which is
most of them
([0061](../decisions/0061-tiptap-over-the-closed-grammar.md)). It depends on
`spec` and not on `core`, because converting between the stored grammar and an
editor document is a function of the format, not of a running form.

The rule that everything below L3 has no platform dependency is enforced by the
type system rather than by a lint rule: those packages have no `@types/node`,
so a Node import is a compile error ([0008](../decisions/0008-layered-packages.md)).

## Level 2 — inside each package

### `@formancy/spec` (L0)

The data contract, and nothing that evaluates it.

| Module | Responsibility |
|---|---|
| `types.ts` | The document's TypeScript shape |
| `formancy.schema.json` | JSON Schema 2020-12. Every property carries a title and description, enforced by a test |
| `validate.ts` | Structural validation via a precompiled ajv validator, then semantic rules ajv cannot express: duplicate keys, rename legality, nested repeaters, pages below top level, uncompilable patterns, logic targets, unresolvable message references |
| `canonical.ts` | Deterministic serialisation. **Throws** rather than dropping undefined, NaN or Infinity ([0010](../decisions/0010-canonical-hash.md)) |
| `hash.ts` | sha256 over the canonical form, via `@noble/hashes` because the builder hashes in a browser |
| `diff.ts` | `diffSchemas` over **data paths**, classifying compatible / lossy / breaking ([0015](../decisions/0015-diff-before-server.md)) |
| `paths.ts` | The single walk of the model that everything else agrees with |
| `presentation.ts` | Message-reference resolution and layout path checks ([0014](../decisions/0014-presentation-sections.md)) |
| `generated/document-validator.js` | The ahead-of-time ajv artefact, stamped with the schema hash so staleness is detectable ([0040](../decisions/0040-no-eval.md)) |

### `@formancy/expressions` (L1)

formancy's own facade over CEL. Nothing above this layer imports the CEL
library ([0017](../decisions/0017-expression-facade.md)).

`parse` · `check` · `compile` · `evaluate` are the surface. Around them sit the
things a thin pass-through would have nowhere to put: `limits.ts` (AST size and
depth), `budget.ts` (per-expression and per-submission wall-clock), `kinds.ts`
(the function allow-list per expression slot, so a `visible` expression cannot
perform a lookup), `capabilities.ts` (the injected clock and randomness),
`references.ts` (the static variable extraction the dependency graph needs),
`rewrite.ts` (replacing one data path with another in a condition) and
`decimal.ts` (scaled-integer money, so `price * 0.19` is a type error and
`price * dec("0.19")` is required).

`references.ts` and `rewrite.ts` share one walk, in `chains.ts`, and that is the
point of having them here rather than in the builder: what counts as a field and
what is a local bound by a comprehension has to be **one** answer, because those
two answers are the dependency graph and the text of a rule
([0093](../decisions/0093-a-rule-follows-the-path-it-reads.md)). The rewrite
splices the source spans the parser reports rather than reprinting the AST, so an
author's spacing and notation survive a rename, and it verifies itself by asking
the result what it reads — which is what catches a replacement name that a
comprehension would capture.

### `@formancy/core` (L2)

| Module | Responsibility |
|---|---|
| `engine.ts` | `createFormEngine`. The model walk, logic compilation, snapshot construction and caching, validation, submit |
| `graph.ts` | The dependency DAG, topologically sorted, cycle-checked |
| `store.ts` | Path-addressed value storage with change tracking |
| `path.ts` / `value.ts` | Parsing, formatting and traversal of data paths |
| `props.ts` | Every ARIA attribute, composed centrally ([0021](../decisions/0021-engine-owns-aria.md)) |
| `ids.ts` | Deterministic, SSR-stable element ids |
| `model-validators.ts` | min, max, lengths, anchored patterns, and formats as explicit regular expressions because `URL` is unavailable |
| `interaction.ts` | Touched state, which decides when a message is shown |
| `wizard.ts` | Page navigation and per-page validation semantics |
| `strip.ts` | `clearOnHide` pruning, applied identically on client and server |

### `@formancy/react` and `@formancy/angular` (L3)

Deliberately small, and structurally parallel:

| Concern | React | Angular |
|---|---|---|
| Reactivity | `useSyncExternalStore` over the engine's snapshots | signals, zoneless, `OnPush` |
| Field binding | `use-field.ts` | `field.ts` |
| Repeater | `use-repeater.ts` | `repeater.ts` |
| Wizard | `use-wizard.ts` | `wizard.ts` |
| Component resolution | `context.tsx` | `registry.ts`, `provide.ts` |
| Default controls | `form.tsx` | `fields.ts` |
| Error summary | `error-summary.tsx` | `error-summary.ts` |
| Conformance driver | `conformance-driver.tsx` | `conformance-driver.ts` |

Neither contains a CSS file. Both resolve labels through the engine rather than
reading `def.label`, so they cannot disagree about what a field is called.

### `@formancy/builder-core`

`createBuilderSession` applies a command to a *copy* of the document, validates
the result, and commits only if it is legal. `validTargets` decides whether an
edit is permitted by **attempting it**, which is how the spec's missing
prohibition on nested pages was found. A rename declares `renamedFrom` against
the session baseline rather than the previous edit, so three renames in one
session produce one declaration rather than a chain
([0011](../decisions/0011-declared-renames.md)).

### `@formancy/conformance`

Published to npm so third-party renderers can self-certify
([0035](../decisions/0035-publish-the-suite.md)). `driver.ts` is the interface,
`runner.ts` executes a fixture against it, `validate.ts` refuses a fixture that
could not run honestly — including one whose field has no resolvable accessible
name — and `builtin-fixtures.ts` is generated from `fixtures/*.json` with the
case list pinned in a test, so a case that silently stopped being embedded is
caught.

`core` also publishes `runScenarios`, which is the only answer this product has to a
condition that type-checks and is still the wrong business rule: an example with its
answer written down, run against the real engine in the mode asked for. It reports
rather than asserts, because the caller is sometimes a test and sometimes a panel. It
lives here rather than in a builder because a package is where the reason to change
lives — this changes when the engine's verdict surface changes, not when a palette does
— and the cost of that is in [§9.3](09-quality-requirements.md), where the bundle is
now over its budget
([0110](../decisions/0110-a-form-is-checked-against-examples.md)).

### `@formancy/mcp`

Nine tools and three prompts over the packages above, and a deliberately thin
wiring layer: every tool is a call into `tools.ts` and a conversion of the answer,
because a use-case reachable only through a transport is a use-case nobody tests
properly. Five of the tools need no server at all, which is what lets an agent write
a whole form and be told what is wrong with it before anything is deployed.

What the tools *say about themselves* is part of the product rather than metadata:
the annotations are the only thing a client has to decide whether a call needs a
person's agreement, the result envelope is one shape across all nine, and the prompts
carry the **order** of operations, which is most of what an agent gets wrong
([0112](../decisions/0112-the-mcp-server-says-what-its-tools-do.md)).

### `@formancy/builder-core` and `@formancy/builder-react`

`builder-core` is the document engine: commands, undo/redo, and one rule that
shapes the rest — a session may never hold a document the validator rejects, so
every command is applied to a copy, validated, and committed only if it passes.
Legality is decided by *trying* an edit rather than by a second implementation
of the validator's rules, which would drift from it.

It holds what a builder's interface needs and a framework does not decide: the
compiler that turns a structured condition into CEL, where a drop lands in each
of the two trees **and on the rendered form** (`arrange.ts`, which takes a
rectangle as plain numbers because this package compiles with no DOM), the
palette, the editable property list read out of the spec's own JSON Schema, and —
in `repath.ts` — what the rest of the document does when a path moves or goes. That last one is why this package depends on
`@formancy/expressions` at all: a field lives in the model, in the layouts that
arrange it, in the rules that read and target it, and in the metadata the logic
panel reopens from, and all four have to follow in the same edit. Three of them
are JSON; the condition is CEL, and rewriting it needs a parser
([0093](../decisions/0093-a-rule-follows-the-path-it-reads.md)). Those sat in `builder-react` while it was the only
builder, and none of them mentioned React — the same shape as `@formancy/core`
sitting under the renderers, one layer up. A binding is then the part that is
genuinely per framework, which is the components and nothing else.

It holds two addressing schemes that deliberately do not mix. A model field is
a key path (`['contact', 'email']`); a layout node is a position path
(`[0, 1]`), because an arrangement's nodes have no keys and every edit
renumbers their neighbours. `layout.ts` keeps the second one's navigation
apart from the first's for that reason
([0050](../decisions/0050-arrange-in-two-places.md)).

The two trees offer the same operations where the operation means the same thing, and
`unwrapField` beside `unwrapLayoutNode` is the case where it does not quite. Replacing a
container with its children is one splice in an arrangement, where a node has no meaning
beyond its position. In the model a container may carry the answer — a group's children are
addressed beneath it — or carry a step, and a question that leaves a page does not simply
move in the document: it changes which step it is asked on. So the model's command merges a
page into its neighbour and refuses a group a rule reads inside
([0089](../decisions/0089-a-page-is-unwrapped-into-its-neighbour.md)). A command that looks
like a transposition of a layout one is worth checking twice for exactly this.

It also holds what a **reviewed** edit means. `proposal.ts` is three things a
model's answer has to pass through before it is a change to a document:
`proposeEdit` holds the answer against the document it was written for and
carries the change list `diffSchemas` gives and whether any of it costs the
answers already collected; `applyProposal` refuses it when the form has moved
underneath it, when it changes nothing, or when the session itself says no. A
hash rather than a revision, because an undo-then-redo leaves a document
exactly as it was. Both panes and `@formancy/mcp`'s `propose_form_edit` read
those, so three surfaces cannot disagree about what counts as a change or when
a proposal has gone stale
([0109](../decisions/0109-an-ai-edit-is-reviewed-before-it-lands.md)).

`scenario-runs.ts` holds the other thing both builders must agree about: what counts
as a **regression**. A panel reporting that three of five scenarios fail is a number
somebody reads once; what was holding before this edit and is not now is the sentence
that gets acted on, and two builders deciding that separately would tell two people
different things about one edit
([0111](../decisions/0111-a-scenario-panel-names-what-stopped-holding.md)).

There are two builder interfaces over it now, and the split is the same one
the renderers have: what decides anything is in `builder-core`, and a builder
package is markup and a subscription. `@formancy/builder-angular` carries the
structure tree — zoneless, `OnPush`, one signal per session, `revision()` as the
whole subscription — the prompt pane and the scenario panel, both in the same
idiom; the rest of the panes remain React-only
([0091](../decisions/0091-a-second-builder-is-a-binding.md)).

`builder-react` is the interface: a structure tree, an arrangement tree, a
property panel generated from the spec's own JSON Schema, a condition editor
that compiles to CEL, and three drag surfaces — none of which is the only way
to reach anything ([0046](../decisions/0046-keyboard-before-drag.md)). One of
those surfaces is the rendered form itself, which works because the renderers
emit two inert attributes and this package reads them from the outside. The
dependency runs one way only: `@formancy/react` knows nothing about the builder.

### The applications

`apps/playground` and `apps/admin` are the two tools; `apps/docs` is the
reference; `apps/site` is formancy.ai.

The playground carries **two** demo documents and the pair is the unit that is
held to covering the format. One is flat — every field type minus the two that
nest, so every control is visible at once — and a flat form cannot show a
stepper, a step being walked past, or a container for the builder's container
commands to act on. Splitting the obligation across two documents is what lets
each keep the shape that makes it useful, and `wizard.test.ts` derives the
obligation from the spec's own lists so neither carries an exclusion list that
can go stale. It also runs the second demo's rules against a real engine: a
demo whose logic does not fire is the documented-but-inert failure in the one
place a visitor would take it for the product.

The website is listed here rather than left out of the architecture because it
takes a real dependency on `@formancy/react` and renders a real document with a
real engine ([0053](../decisions/0053-the-page-is-the-product.md)). That is
deliberate: a marketing page for a rendering library that shows screenshots
proves nothing, and one that imports the library breaks when the library does.
Its effects are CSS scroll-driven animations with no scroll listener anywhere,
and `prefers-reduced-motion` removes them in the stylesheet rather than in
script.

It has **two pages**, and they are drawn in one shell: `src/shell.css` holds the
tokens, the type scale and the backdrop, and `src/chrome.tsx` holds the bar, the
footer and the mark that both render
([0106](../decisions/0106-one-shell-for-every-page-of-the-site.md)). The second
page — the templates gallery — shipped with its own palette, its own font stack
(naming a family nothing loads), its own navigation and its own footer, which is
two design systems inside a product whose argument is that a consumer's design
system owns the markup. The split is structural rather than a copied stylesheet:
the navigation is one list, so a third page joins every page's bar by existing,
and the browser gate compares the two pages' computed ground, families and bar
against **each other** rather than against a literal.

### `@formancy/server-core` and `@formancy/server`

`server-core` holds the use cases — publish, resolve, submit with replay, list,
export, save and resume drafts, authenticate, authorise — and contains **no
HTTP types at all**. Storage arrives through a ports interface, which also
gives the tests an in-memory implementation.

`server` holds Fastify routes in two planes, the PostgreSQL adapter, the schema
including the immutability trigger, and the auth runtime (argon2id via
`@node-rs/argon2`, sessions via `jose`).

Both sides are split **one use-case family per file**, and what forced it was
the size budget rather than taste: `use-cases.ts` and `app.ts` were where
everything went, and the ratchet in `apps/docs/src/size.test.ts` refused the
next thing added to each. Publishing came out first, because it is the family
with the most of its own vocabulary — `server-core/publishing.ts` holds
`publishForm` and the audit row it writes inside the same transaction,
`server/routes/publish.ts` is the matching Fastify plugin, and
`server/headers.ts` holds the one header name both the submission route and the
publish plugin read. Two spellings of one header is a bug nobody sees until a
client sends the other one.

The webhook outbox shows the split at its sharpest. `server-core/outbox.ts` has
`afterAttempt` — pure, four arguments, the entire retry policy — and
`drainOutbox`, one batch that returns. `server/deliver.ts` has the part that
cannot be isomorphic: `node:dns`, an undici agent pinned to the address that
was checked, and a `URL`. `server/outbox-worker.ts` is the clock and nothing
else, which is why it fits on one screen. The address *classification* sits
back in `server-core/address.ts`, because deciding whether `::ffff:10.0.0.5` is
private needs no runtime at all — only parsing it into a `URL` does, and that
is why `webhookUrlProblem` lives in `server` while `isPrivateAddress` does
not.

## Starter template collection and gallery

`templates/` holds plain form documents, a discovery catalogue, fictional answer
objects and executable scenario expectations. It is application content, not a
new layer or npm package. The site builds `/templates/` as its own HTML entry;
preview and JSON download use the same document, and its edit links pass a known
template id and locale to the playground. No respondent answers cross that link.
Both applications read the catalogue; neither bundles the sample answers as form
defaults. See [0105](../decisions/0105-templates-are-documents-with-examples.md).
