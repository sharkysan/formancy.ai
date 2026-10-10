# 11. Risks and technical debt

Written so that a reader can tell what is known-and-accepted from what is
merely not done yet.

## 11.1 The three riskiest pieces

### The builder

Larger than the spec, engine, React renderer and server thin slice combined. It
is imagined as "drag fields onto a canvas" and is actually: a nested-container
drop model, undo/redo over a document model, a property editor that **must be
generated from the spec's JSON Schema** because twenty-five hand-written panels
rot within two releases, a round-trippable logic authoring interface, live
preview, CSS isolation inside arbitrary host applications, and WCAG 2.2
SC 2.5.7, which legally requires a complete keyboard path for every drag
operation.

*Mitigation, already applied:* `@formancy/builder-core` exists and its commands
are keyboard-shaped — insert, move, remove, rename — because building the drag
affordance first is how the keyboard alternative ends up unfinished. The
document engine is done and tested before any canvas exists.

### Angular renderer parity

The reactivity impedance mismatch. Bind an external non-signal store naively
into zoneless `OnPush` Angular and you get either missed updates or a whole-form
re-render per keystroke, which destroys the performance claim outright.

*Mitigation, already applied:* Angular was built **second**, not last, which
forced the engine's subscription API to be framework-neutral rather than
React-shaped while there was still time to change it. Both renderers now pass
the same fixtures with no skips.

*Residual, and larger than the paragraph above suggests:* **parity is verified by markup
and never by rendering.** A two-column table layout produced one column in Angular from
the day it shipped — the recursing component's host element was the grid's only item —
and every gate this project runs was blind to it: jsdom has no layout, conformance queries
by role and accessible name, and axe had nothing to report. Fixed in
[0073](../decisions/0073-a-host-element-is-not-a-layout.md), found by a person looking at
a running page.

**This section once said no application in the repository rendered the Angular bindings,
and named an Angular app, rendered and measured, as the remedy.** Both exist now. The
playground mounts the Angular renderer and the Angular builder beside the React ones over the
same document ([0095](../decisions/0095-one-schema-two-renderers.md),
[0096](../decisions/0096-two-builders-one-session.md)); `apps/angular-starter` is an Angular
application, which `test:browser` loads where the site embeds it and measures in Chromium
([0133](../decisions/0133-the-angular-starter-is-the-builder-and-the-form.md),
[0136](../decisions/0136-the-angular-page-runs-the-starter.md),
[0142](../decisions/0142-the-angular-starter-is-dressed-in-materials-tokens.md)), and
`test:e2e:angular` installs the packed packages into a project of its own and runs a Material
form there — the renderer, not the builder. What is still React-only is
the admin, so the Angular builder's appearance is measured in the playground and the starter
and nowhere a deployment ships it.

*Residual:* Angular users will demand a position on Signal Forms. The position
is interop, not inheritance — Signal Forms' schema is authored statically in
TypeScript and formancy's is dynamic runtime JSON — via a Standard Schema v1
adapter, plus `ControlValueAccessor` support for existing `ReactiveFormsModule`
code. Neither is built.

### Versioning and draft migration

Looks like a `version` column; is actually a distributed-systems problem; is
the one class of mistake that cannot be refactored once users have production
data.

*Mitigation, already applied:* immutability enforced by a database trigger
([0025](../decisions/0025-immutability-in-the-database.md)), binding by both
foreign key and hash ([0026](../decisions/0026-bind-by-fk-and-hash.md)),
declared renames ([0011](../decisions/0011-declared-renames.md)), lazy
migration with an `__orphaned` bucket that never deletes
([0027](../decisions/0027-lazy-draft-migration.md)), and `diffSchemas` built
before there was any data to corrupt
([0015](../decisions/0015-diff-before-server.md)).

*Residual:* `diffSchemas` is load-bearing for data integrity and an adversarial
review already found one critical defect in it. It is the place where a future
defect would be most costly.

## 11.2 Known technical debt

| Debt | Why it exists | What it costs |
|---|---|---|
| **Uploaded files are scanned only where a deployment runs ClamAV** | Scanning is a port with one adapter, off unless `FORMANCY_CLAMD_HOST` is set ([0131](../decisions/0131-an-upload-is-scanned-before-it-is-kept.md)) | Without it a file is trusted the moment its bytes land, served only as an authenticated attachment. With it, detection is the signatures', and clamd answers clean for content past its limits unless `AlertExceedsMax` is set — documented, not enforced, since `clamd.conf` is not this product's. The adapter is tested against a protocol stand-in; a real clamd was run once, by hand, and is in no gate |
| **No code decoder ships with `widget: "scanner"`** | A locator pass, a perspective transform and Reed–Solomon decoding is a dependency in a 4 kB-brotli budget and a SOUP row for every consumer, including the Node engine ([0071](../decisions/0071-a-scanner-is-supplied-not-built.md)) | A deployment that wants a camera route supplies the scanner itself. Without one the renderers show **no** scan button, so the field is the ordinary text input rather than a broken promise — the answer is still collectable by typing, which is what keeps this debt rather than a defect |
| **Nothing enumerates which CSS properties are operability rather than appearance** | The line was drawn once a control had crossed it, not before ([0101](../decisions/0101-a-control-is-operable-without-a-theme.md)). `touch-action` on the signature surface lived only in the four shipped themes, so a touch drag scrolled the page for anybody bringing their own stylesheet | Each control is judged one at a time, so the next one to need such a property can repeat the mistake — a slider and an image cropper both would. Guarded per control and per theme, and not as a class |
| **No resumable or multipart upload** | Deferred | The deployment's byte ceiling is also the largest single file, and a dropped connection restarts the whole thing |
| **Bytes pass through the server on their way to the object store** | A presigned upload changes the flow end to end, both renderers included | The request body cap is also the largest single file, and the server is in the data path for every upload and download. The S3 store removed the one-replica ceiling; it did not remove this one |
| **A write that outlasts its lease can replace a claimed file's bytes** | One request receives a file's bytes at a time, for two minutes ([0153](../decisions/0153-a-file-is-received-by-one-request-at-a-time.md)). Closing it needs a key per attempt, and the key is already in every stored submission | A request whose scan and write together run past the lease writes after the request that took over, under the same key. Its settle is refused, so the row stays claimed by the right submission, but the store can hold the late request's bytes — scanned, and the size offered. The supplied adapters do not rule it out: the object store abandons a `PUT` after 30 seconds, but the clamd adapter's 30 seconds are of silence, not of the whole scan, so a scan ending just inside the lease followed by a write crossing it is enough — as are a deployment's own adapters, or a stalled disk under the directory store. Nothing tells it apart from any other `409` on that route — the request log ([C3](../regulatory/SAFETY-ANALYSIS.md)) records the status, not which refusal it was — and `server.integration.test.ts` asserts it so that closing it is deliberate |
| **An upload to the object store is bounded as a whole** | The store answers a PUT once it has every byte, so sending the body falls inside the wait for the headers. When a download's bound moved to the store's silence, this one did not: the body goes as one buffer in one request, with no chunks to restart a clock on | A PUT that takes longer than the store's timeout — thirty seconds — is abandoned however steadily it is going, and the upload fails. How large a file that is depends on the link between the server and the store, and has not been measured. `s3-file-store.test.ts` asserts the gap is still there, so closing it is deliberate |
| **Nothing bounds a download whose reader has stopped reading** | The S3 store's clock stops while a chunk is with the downloader, because a bound that ran while the downloader read was what cut off every download slower than thirty seconds ([0155](../decisions/0155-the-object-store-is-timed-on-its-silence.md)) | A downloader that stops reading holds its connection, and with the S3 store a connection to the store, and nothing in the server ends it: `app.ts` sets no `connectionTimeout`, and Fastify's default is none. The local store was already like this, holding an open file. A bound would belong on the server's socket, where it covers both stores |
| **An error in the log names what was thrown, not where** | A message or a stack can carry what the request carried, so the log writes an error's class and its code and never its words ([0168](../decisions/0168-the-log-is-built-from-a-list-of-fields.md)) | A fault in a route is a line naming its class on its route with a `500`; finding the line of code means reproducing it. A provider's and a scanner's own words go nowhere, so the log says that clamd could not be asked, not why. The route is written as a pattern, so the log cannot say which form either; the audit log, which records a subject, is where one is named. A request refused while the server closes is refused before routing, so its line has no route or method; one whose client left has no status |
| **A `500` tells its client what was thrown** | Fastify's default error reply, which the request log did not change | The error's message reaches whoever made the request — for a database error, the failing query and its parameters. `server.integration.test.ts` asserts a disk's `ENOSPC` reaching the client. The log stopped writing a message; the response still carries one |
| **A check re-runs only when its own target changes** | Dependencies are derived from a CEL AST and a `check` has no expression — it names a validator the deployment answers ([0086](../decisions/0086-a-check-is-named-and-answered-elsewhere.md)) | A check that reads a second field is stale until its own is edited. Nothing debounces one either: it runs on every committed value, and the timer belongs to whoever pays for the call |
| **A publish warns about a rule reading a path no field provides; it does not refuse** | Refusing would make documents valid today invalid tomorrow, and what a reader accepts is the frozen version contract ([0097](../decisions/0097-a-publish-may-warn.md)) | Such a document is published, and the rule evaluates to nothing for the life of that immutable version. An unknown **root** is refused — the engine compiles rules against the fields that exist — so what gets through is a member of a group or of a row, which is exactly what a rename inside a group leaves behind. A deployment needing a gate must treat the `201`'s warnings as one; nothing here does. And no pass revisits documents already published |
| **A form's examples are saved whole, and the last save wins** | The scenario panes hand back the whole list, so the server keeps one record per form and a save replaces it ([0166](../decisions/0166-a-deployment-keeps-a-forms-examples-and-runs-them-at-publish.md)). Publishing has a version check for two editors ([0092](../decisions/0092-publishing-declares-what-it-opened.md)); the examples have none | Two people changing one form's examples at once replace each other's list: a removal can come back, or a kept example go, and nothing says so — and the publish runs whichever list was saved last. One person's saves reach the server in the order they were made; two people's do not wait for each other |
| **The examples run at publish compare with the published version, and block the request** | A warning names what this publish changes, not what was already true (0166) | An example failing against both versions is not named at publish, though the admin's panel lists it failing; a form published before it had examples is published with nothing said about them. Both runs happen on the thread answering the publish: about 10 ms for the largest starter template's examples and about 300 ms for four hundred examples, measured on 2026-10-10 in this repository's sandbox and not re-measured since |
| **The playground is the only consumer of the Angular packages** | It is the demonstration; the admin is a product and does not need two builders | Angular parity rests on the playground plus each package's own suites. Nothing a *deployment* ships exercises them, so an integration problem of the kind that only appears in a real application would show up for a consumer first ([0096](../decisions/0096-two-builders-one-session.md) is where one already did: the package carried no `exports` and could not be imported at all) |
| **`OptionsSource`, `OptionsSources`, `Scanner`, `Uploader`, `UploadOptions` and `StoredFile` are declared twice** | Independently and identically in `@formancy/react` and `@formancy/angular`; moving a published type changes two packages' public surfaces. The upload types were left off this row until `UploadOptions` joined them ([0130](../decisions/0130-each-file-is-its-own-upload.md)) | Nothing makes them stay in step. The playground's shared capabilities are passed to both providers and typecheck structurally against each, which is the only reason one deployment can serve two renderers today |
| **The renderers' own words are English** | The form's words are the author's, through its catalogue; the renderers' — Next, Back, Remove, Cancel uploading, Try again — were written as literals in each binding, and have no catalogue | A form in German asks its questions in German around English buttons. A host can rename Submit by a prop and a repeater's buttons in the schema; the rest it cannot. Each new control adds to it — the file field's per-file uploads did ([0130](../decisions/0130-each-file-is-its-own-upload.md)), and the ranking's move and rank buttons did ([0138](../decisions/0138-a-ranking-stores-the-order-chosen.md)) |
| **A block is a copy, and nothing stores one** | A reference would make a form depend on something that can change after its version is published; storage, sharing and permissions are the deployment's ([0135](../decisions/0135-a-block-is-a-field-with-its-rules.md)) | Changing a block changes no form that used it. The playground holds blocks in memory for the visit; neither the admin nor the server has anywhere to keep one, so a deployment wanting a shared library builds it. Where a block may go is validated twice per container, and has not been measured on a large form |
| **A `recheck` verdict of `unknown` is accepted** | Refusing on undecidable would reject patterns that are fine | Every `pattern` is analysed at publish time and a vulnerable one refused — the check found a polynomial case in formancy's own email format the first time it ran — but an analysis that times out lets the pattern through ([0045](../decisions/0045-reject-backtracking-patterns.md)) |
| **While the counter cannot answer, the public plane is not limited** | Every limit counts in PostgreSQL, so every replica spends one budget ([0170](../decisions/0170-a-limit-is-counted-once-in-the-database-every-replica-shares.md)); a count that does not come back within a second is decided without, and refusing every respondent then would make a fault in the defence an outage of every form | For as long as the counter fails, submissions, drafts, challenges and file offers are admitted uncounted — and a flood that slows the database past the bound is exactly what makes that happen. Login and the model refuse with `503` instead, so nobody can log in (hazard D19). Only the limited requests wait, each a second at most: the counter counts on four connections of its own, because on storage's a dozen limited requests under a lock on its table stopped every route. The request log says so once, `ratelimit.unanswered`, by the error's code and never its words, which nothing reads unless the deployment does; a request admitted uncounted has an ordinary line. Each limited request costs a write, about half a millisecond on one machine (measured 2026-10-10), and each replica four connections more; an embedding that calls `createApp` without the store still counts per process. `rate-limit-store.test.ts` holds every registered limit to what it declares, and `shared-rate-limits.integration.test.ts` the rest on real PostgreSQL |
| **Behind a proxy nobody named, every respondent shares one budget** | Trusting no proxy is the only safe default: the server cannot tell a proxy's `X-Forwarded-For` from one a client wrote itself. Until 2026-10-09 there was no setting at all | Unset, the limits count the proxy, and the thirty-first submission in a minute is refused for everybody behind it, with a `429` line per refusal in the request log that names the route and not the address counted (hazard D14). Set too wide, anything at a trusted address chooses the address it is counted by — and the compose network's range, the obvious value, holds the gateway Docker hands published-port connections over from, so the guide names the proxy's pinned address instead ([0156](../decisions/0156-a-proxy-is-trusted-by-its-address.md)). Both are the operator's to get right: the server refuses only what is not addresses and ranges — a hop count, `true` and a name for a range among them |
| **Neither compose file runs an object store** | A fresh Garage node accepts no data until a layout is assigned, which is four commands after start rather than anything compose can declare | Both pass the settings through and point at nothing, so the default is still a local volume and a self-hoster wanting more than one replica runs the store themselves ([0064](../decisions/0064-an-object-store-behind-the-same-interface.md)). Switching also takes `FORMANCY_FILES_DIR=""` in `.env`, because compose can blank the volume's path but not drop it; through `0.4.0` both files hard-coded that path, and every deployment that followed the object-store block restart-looped. `compose.test.ts` now follows the block through both files and asks the server's own settings which store results |
| **Nothing re-checks a version once it is on the registry** | `test:e2e:install` packs the tarballs and installs them into a project outside the workspace, which is the part that can be done before release; talking to npm afterwards is a different job with different failure modes | A release that packed differently from `pnpm pack` would slip through, and a version already published is never revisited. The two Angular packages are also outside that gate — consuming one needs the Angular build toolchain rather than an import — so `apps/playground` building them from the workspace is what covers them |
| **Every published library has a workspace consumer, and is checked as a package to one standard** | `apps/docs/src/published-packages.test.ts`, after `@formancy/builder-angular` was unimportable for four releases with nothing noticing ([0096](../decisions/0096-two-builders-one-session.md)) — and after counting showed three published artefacts on a weaker package check than their twelve siblings | It proves somebody imports the package *by name* and that `publint` and `attw` run wherever they apply; it does not prove the published tarball resolves, since a workspace sibling reads the source manifest. `@formancy/server` and `@formancy/mcp` are excused from the consumer half — nothing imports a server — and `@formancy/themes` from `attw`, having no types; all three excuses carry reasons and are asserted still true |
| **No bundle-size gate** | A threshold chosen today would be chosen to pass, which is a guard written green | The budgets in [§9.3](09-quality-requirements.md) are measured by hand and dated. `@formancy/core` is 14.8 kB against 18 kB; `@formancy/react`'s whole barrel is 12.1 kB against a 4 kB budget written for a tree-shaken entry, and which number the budget meant cannot be settled without running a bundler over a realistic import |
| **No manual accessibility audit, no VPAT** | Requires assistive-technology testing that has not been done | The accessibility claim rests on automated checking, which covers roughly 57% |
| **`@marcbachmann/cel-js`: 118 known corpus failures** | The library implements most, not all, of CEL | Enumerated in `CEL-CONFORMANCE.md`; a form using an affected construct behaves incorrectly |
| **No requirements traceability matrix** | Requirements live as fixtures and budgets, not as a numbered list | A regulated consumer must construct traceability themselves |
| **Nothing opens the admin in a browser to record its requests** | The admin needs a server behind it, and the request gate opens formancy.ai's pages only ([0154](../decisions/0154-the-website-makes-no-request-to-any-other-site.md)). It stopped asking Google for its faces and jsDelivr for Monaco on 2026-10-10 | `apps/admin/src/no-other-host.test.tsx` reads the page the admin is served as and where its Monaco loader looks. A request its JavaScript makes while it runs, or a stylesheet that names another host, would not be seen |
| **The playground copies Monaco's build whole** | The loader asks for modules by name as the editor needs them, and a list of the ones it needs would be a copy of Monaco's module graph nothing checks ([0154](../decisions/0154-the-website-makes-no-request-to-any-other-site.md)) | The deployment carries the language workers for TypeScript, CSS and HTML for an editor that edits JSON — most of the copy's bytes, measured in the record, and never fetched |
| **The playground's content security policy covers pictures and connections only** | A `style-src` collides with the inline styles the renderers and Monaco set ([0154](../decisions/0154-the-website-makes-no-request-to-any-other-site.md)) | A pasted document cannot make the playground fetch a picture or open a connection elsewhere; nothing else a full policy would refuse is refused |
| **A pasted answer is not bound to the request it answers** | Through the relay a person carries each turn, and nothing in a chat's answer says which request it answers ([0160](../decisions/0160-a-person-carries-the-models-turn.md)) | An answer from another chat, an earlier turn or another form is checked and proposed like the right one. The review's diff against the form the run was asked about is the only defence (SAFETY-ANALYSIS D10) |
| **An answer that works leaves the focus on the page's body** | The relay pane exists only while a turn waits, and an answer that is accepted ends the turn; the prompt pane announces the review in its live region and moves no focus ([0160](../decisions/0160-a-person-carries-the-models-turn.md)) | A keyboard user who pasted an answer that worked hears the review announced and starts again from the top of the page to reach it. A turn that follows — a retry — takes the focus back to its Copy |
| **A run the host holds is the host's to end** | A pane drawing a run the host holds leaves it running when it goes, so the turn outlives the pane — the prompt pane's ([0163](../decisions/0163-a-models-run-belongs-to-the-host.md)), and the translations pane's and the drafting part's ([0164](../decisions/0164-a-translation-is-held-for-its-language-and-a-draft-for-its-form.md)) | A host that holds a run and stops drawing every pane over it, for good, has its model's request running for an answer nothing will show — what a pane going away used to stop (0157) — unless it calls `stop()` or `discard()`, and a host that opens another form must discard each run it holds, or their turns wait above it. Through a relay that costs nothing. A host that wants 0157's rule gives the pane no run |
| **Held drafts take the form's id for the form** | A drafting run outlives the session it was asked in, and the playground opens a new session over the same text every time *Build* is shown; the id is the form's stable identifier, and what stays ([0164](../decisions/0164-a-translation-is-held-for-its-language-and-a-draft-for-its-form.md)) | Two documents with one id are one form to the drafts: a form replaced wholesale under *Schema* with its id kept shows the last one's drafts, judged against the new one, and one that names fields both have can be kept into a form it was not drafted for. Only reading the draft shows that |
| **A model's translation is reviewed only as well as its reader reads the language** | A mistranslation that reads fluently passes every check; the review shows each message beside its source and the form as it would read, and nothing in software can judge the meaning ([0161](../decisions/0161-a-model-translates-only-what-is-missing.md)) | A question that asks something else in the reader's language is answered as read and stored as the source meant (SAFETY-ANALYSIS D15). The marks — *the same as the source*, and *translated from wording that has since changed* — are hints, and nothing checks that a target is written in the language its file names |
| **Where a message came from is not recorded** | A catalogue holds words, not who wrote them, and adding authorship would change the format every reader reads ([0161](../decisions/0161-a-model-translates-only-what-is-missing.md)) | Once applied, a model's translation is indistinguishable from a person's in the catalogue, the exported file, the diff and the next review. A per-message sign-off has to be kept outside formancy |
| **One relay, one turn, across every pane that asks it** | The playground asks one relay from its prompt pane, its scenario pane and its translations pane: the visitor has one chat to carry turns to, and a relay carries one turn at a time, refusing a second rather than queuing it ([0160](../decisions/0160-a-person-carries-the-models-turn.md), [0161](../decisions/0161-a-model-translates-only-what-is-missing.md), [0162](../decisions/0162-an-example-is-drafted-from-what-the-author-said.md)) | While one pane's turn waits, another's run is refused at once and says another request is waiting. In the playground every run is held by the page, so any of the three can wait while the visitor is anywhere and meet another's ([0163](../decisions/0163-a-models-run-belongs-to-the-host.md), [0164](../decisions/0164-a-translation-is-held-for-its-language-and-a-draft-for-its-form.md)). The refused button stays enabled while that refusal is certain: no pane knows its `ask` is a relay, and teaching it would make the relay a case in the run. A host wiring several panes to a model of its own that takes one request at a time gets the same sentence only if that model rejects with `ModelBusyError`; anything else it rejects with reads as a model that could not be reached |
| **Every waiting draft is run again on every edit, and that is not measured** | A draft's verdict is computed whenever it is drawn and never stored, so it cannot go on saying "holds" about a rule since turned round ([0162](../decisions/0162-an-example-is-drafted-from-what-the-author-said.md)) | Beside the list the scenario pane already runs, each waiting draft gets an engine of its own per edit. How long that takes for many drafts on a large form has not been measured, and §9.3 has no budget for it |
| **A draft not kept is lost with its form** | Drafts are about the form they were drafted for, and its list is the only place Keep adds them ([0162](../decisions/0162-an-example-is-drafted-from-what-the-author-said.md)); a host that holds the drafting keeps them across tabs, builders and sessions of the form, and the playground discards them when another demo is chosen ([0164](../decisions/0164-a-translation-is-held-for-its-language-and-a-draft-for-its-form.md)). A host that gives the part no run keeps 0162's rule: another session is another form | In the playground, a visitor who chooses another demo loses every draft not yet kept, with no warning; a host that holds nothing loses them with the part or the session. Keep is how a draft outlives either |

### There is no gate for what it looks like

Two CSS bugs shipped in one week and both were found by a person opening a page: the
typeahead popup opened over its own label because `top: auto` means something different
inside a grid ([0072](../decisions/0072-a-typeahead-is-a-combobox-over-the-same-answer.md)),
and Angular's table layout never had more than one column
([0073](../decisions/0073-a-host-element-is-not-a-layout.md)).

Neither was a careless mistake and neither was catchable here. **jsdom implements no
layout**, so no unit test in this repository can ask where a box is. What replaced each
assumption is a structural contract a test *can* hold — the popup is positioned against an
anchor that wraps the control; every element between a grid and its cells is
`display: contents` — and those are proxies, honestly labelled as proxies.

A real gate is a browser: Playwright over the reference theme at a fixed viewport, which
[§10](10-verification.md) already describes as the narrow use for pixel testing and which
is not configured. Until it is, the accurate statement is that appearance is reviewed and
not verified.

## 11.3 Accepted architectural risks

These are not debt. They are consequences of decisions that were made with the
downside understood.

**Two renderers to maintain, forever.** The cost of
[0004](../decisions/0004-headless-core.md). Paid down by the conformance suite,
which makes drift a test failure rather than a discovery.

**The server is locked to Node.** The cost of
[0006](../decisions/0006-one-engine-build.md). A future Go or Java
implementation must reimplement the engine against the spec — which is part of
why a portable expression language was chosen.

**Expressions cannot reference runtime-computed paths.** The cost of
[0018](../decisions/0018-static-dependencies.md). Dynamic indirection is simply
not expressible, in exchange for cycles being impossible.

**Visibility rules fail open.** The cost of
[0022](../decisions/0022-fail-open-fail-closed.md). A form whose visibility
rules are quietly failing looks as though it works and shows more than it
should. This is the residual risk most worth a consumer's attention — and the
condition most likely to be failing is one somebody wrote defensively, because
`address.country != null && address.country == "CH"` errors on an empty form for
the same reason the unguarded version does: it has to read the path to compare
it. `has(...)` is the only guard that answers, which `concepts/logic.md` now
states as a table and a test evaluates row by row.

**A rule may name a data path no field provides, in a document the builder did
not write.** The cost of the `dyn` typing that makes an unfinished form editable
([0054](../decisions/0054-expressions-that-never-work.md) is the related
decision): a condition reading a field somebody is *about* to add is
indistinguishable from one reading a field somebody has just removed, so
`validateSchema` refuses neither. Inside the builder, rules follow a path when it
moves ([0093](../decisions/0093-a-rule-follows-the-path-it-reads.md)); outside
it, a generated or hand-edited document can be published with a condition that
evaluates to null forever. Held as a roadmap item and as a test asserting the gap
is still there, so closing it has to be deliberate.

**A host's bundler can turn the themes' reading order into a question about language.**
The cost of writing what CSS has no logical form for with `:dir(rtl)`
([0123](../decisions/0123-the-builder-reads-right-to-left.md)). A build targeting
browsers older than `:dir()` rewrites it as `:lang(ar), :lang(he), …`, and Vite's
default target did. This repository's own builds are pinned and checked; a host's are
not reachable from here, and the themes README naming the target is the mitigation.

**A deployment's model is narrowed to formancy's requests, not closed to everything
else.** The cost of pinning the briefing rather than the whole request
([0165](../decisions/0165-a-deployments-model-is-asked-through-its-server.md)). The user
part is the person's instruction, so somebody with an editor's session can still ask the
operator's model for something other than a form under formancy's briefing. The permission,
a limit per session, a body cap, an output limit and an audit row bound and record it; no
spending cap prevents it. And no test reaches a provider: the adapters are held against fake
transports in the shapes their SDKs parse, and xAI's compatibility with OpenAI's client is
xAI's claim. Two more are accepted rather than fixed. The body cap holds the requests about
the largest form the server publishes when its questions are about a sentence long; a
translation of one whose questions are long and have many answers is past it, and refused.
And a browser and a server of different versions disagree without saying so: the model is
briefed by the server's version and its answer checked by the browser's, and no digest of the
briefings is exchanged to notice.

**A form's reply is per reading, and a response's token depends on the signing key.** The
cost of storing a response once under an id its form was handed out with
([0169](../decisions/0169-a-response-is-stored-once.md)). The reply says `no-store`; a cache in
front of the server that keeps it anyway hands one token to everybody behind it, and every
response after the first is refused as already sent, with no way round it from the page.
Changing `FORMANCY_AUTH_SECRET` — or leaving it unset, so that every start makes a new one —
refuses once the response of everybody filling in a form, and recovering is the host's: read the
form again and send the answers with the new token. Hazard D18 has both.

**TypeScript is pinned below `latest`.** The cost of supporting Angular as a
co-first target ([0039](../decisions/0039-pin-typescript.md)). It will look
arbitrary in six months, which is why it is written down.

**Apache-2.0 permits a competitor to operate formancy as a service.** The cost
of [0002](../decisions/0002-apache-2-0.md), accepted on purpose; the answer is
the open-core line, not a licence restriction.

## 11.4 The spec freeze, and what it locked in

The spec froze to `"1"` on 2026-09-20 ([0042](../decisions/0042-freeze-the-spec.md)).
All three of the semantics it was waiting on were settled first: hidden-field
answers ([0013](../decisions/0013-hidden-field-semantics.md)), repeater row
identity ([0041](../decisions/0041-repeater-row-identity.md)) and where a
validation check runs ([0043](../decisions/0043-runs-on.md)).

That converts several open questions into locked-in bets. The ones worth
knowing about, because they are now expensive to revisit:

- **A page contributes nothing to a data path**
  ([0012](../decisions/0012-pages-scope-nothing.md)). Moving a field between
  pages never moves data, and that is now permanent.
- **`_id` is reserved** and no field may use it
  ([0041](../decisions/0041-repeater-row-identity.md)).
- **CEL is the expression language** ([0016](../decisions/0016-cel.md)), with
  its 118 known corpus gaps.

The packages are **not** frozen and are nowhere near 1.0. Conflating the two is
the likeliest misreading of the freeze.

## 11.5 Open decisions

Genuinely undecided, and recorded as such rather than quietly defaulted:

- **Trademark registration.** Cheap now, effectively impossible after adoption,
  and it is what preserves the commercial hosted option without relicensing.
  Apache-2.0 grants no trademark rights ([0002](../decisions/0002-apache-2-0.md)),
  which is what makes a word mark the thing that holds the hosted option open —
  and nothing in this repository can register one.
- **The container image's SBOM covers npm only.** `cosign attest` attaches the
  CycloneDX document generated from the workspace manifests, so it names every runtime
  npm dependency and nothing about the base image or its system packages. A
  manufacturer characterising the container needs both.

**The contributor agreement left this list, and the way it left is the lesson.**
It sat here as "**CLA or DCO**, genuinely undecided" for a week after
[0069](../decisions/0069-contributions-under-a-cla.md) decided it, and was found
by somebody asking what was still open and reading this section instead of the
decision records. A section called *Open decisions* is read as an answer, so a
settled question listed in it answers incorrectly — which this repository holds
to be worse than not answering at all. `apps/docs/src/claims.test.ts` now fails
if a document still calls that question open, derived from 0069's status rather
than from how any sentence is worded.

## 11.6 No check on this repository is mechanically required

`main` carries no branch protection rule. Every gate in
[§10.2](10-verification.md) runs on every pull request and reports, and what
stops a red one from being merged is a maintainer reading it — including the
contributor-agreement check that [0098](../decisions/0098-the-cla-is-checked-in-the-repository.md)
added, whose whole purpose is to stop something.

This is honest rather than fine. It is also the one piece of debt in this section
that no file in this tree can discharge, because branch protection is repository
configuration and lives in GitHub's settings; a test here cannot assert it and
should not pretend to. It is recorded so that a reader does not infer enforcement
from the existence of the gates, and so that the one remaining step is written
down somewhere rather than remembered.
