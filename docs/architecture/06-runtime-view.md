# 6. Runtime view

The flows worth drawing. The first two are the ones the whole design is arranged around.

## 6.1 A keystroke

```
person types
   │
   ▼
renderer  ──▶ engine.setValue(path, value)
                  │
                  ├─ store writes the value
                  ├─ dependents marked dirty on a bitset over node indices
                  └─ mutation joins the current microtask transaction
                              │
                        microtask boundary
                              │
                  ┌───────────┴────────────┐
                  │ evaluate dirty nodes    │  push-dirty / pull-compute:
                  │ in topological order    │  nothing recomputes until read
                  └───────────┬────────────┘
                              │
                  invalidate the snapshot of every field
                  whose observable state actually changed
                              │
                  one notification, carrying that set
                              │
                  ┌───────────┴────────────┐
                  ▼                         ▼
        React: useSyncExternalStore   Angular: signals, OnPush
        re-renders only fields whose  marks only those components
        snapshot identity changed     dirty
```

Two properties do the work. Mutations within a microtask are **coalesced**, so
a transaction touching twenty fields notifies once. And a snapshot's identity
changes only when that field's state changes
([0020](../decisions/0020-identity-stable-snapshots.md)), which is what lets
both frameworks avoid re-rendering the rest of the form — and lets React work
with no memoisation on the consumer's side.

Measured at ≈0.38 ms against a 1 ms budget on a large form.

## 6.2 A submission, and the server's replay

```
browser                              server
───────                              ──────
GET /f/contact-us             ───▶  the current version, and a token naming the id
                              ◀───   this response will be stored under (no-store)
  (a draft started or resumed hands out one naming the draft — send that one instead)
        │
engine validates (UX only)
        │
        ▼
POST /f/contact-us/submissions
  X-Formancy-Schema-Hash: abc…  ───▶  anonymous and the challenge on? solved and unspent?
  X-Formancy-Submission-Token          │      otherwise 400 challenge_*  (spends the challenge)
  { answers }                          ▼
                                  may this caller submit? (private until opened, origins)
                                       │      otherwise 403
                                       ▼
                                  the token: present (anonymous), signed for this form,
                                  its id not stored yet?
                                       ├─ missing      → 400 submission_token_required
                                       ├─ not ours     → 400 submission_token_invalid
                                       └─ stored       → 409 submission_token_spent, with the id
                                       │
                                  the declared hash the current version's?
                                       └─ otherwise → 409 FORM_VERSION_CHANGED
                                                       with the current schema
                                       │
                                       ▼
                                  rebuild the engine from THAT version
                                       │
                                  pin the clock for this submission
                                       │
                                       ▼
                                  replay in server mode:
                                   · recompute every computedValue,
                                     OVERWRITING what arrived
                                   · recompute visibility and requiredness
                                   · strip values under server-hidden subtrees
                                   · run every validator (see note below)
                                       │
                                  ┌────┴────┐
                                  ▼         ▼
                              invalid     valid
                                  │         │
                          errors in the     ├─ insert under the token's id — taken already?
                          identical shape   │  then nothing below, and 409 (two sends at once)
                          the client uses   ├─ store canonicalData, not the body,
                                            │  bound to form_version_id
                                            ├─ claim the files it names
                                            ├─ write the audit row
                                            └─ enqueue the webhook job
                                                 …all in ONE transaction
```

**A response is stored once** ([0169](../decisions/0169-a-response-is-stored-once.md)). The
token names the id, and that id is the submission's primary key, so a response sent again —
the retry a lost answer forces, a replay — is refused rather than stored, delivered and audited
a second time. Nothing refused on the way spends it: not the challenge, not the version, not
invalid answers. The lookup before the replay is what answers a second send *sent*; the insert
is what decides between two that arrive together, since both find nothing when they look. A
signed-in submitter may leave the token out and is stored under a fresh id.

Redrawn with the token, this diagram also lost three things it used to claim and the code
does not do: proceeding on an older version whose diff is compatible (a stale hash is
refused, always), storing the schema hash on the submission (the version row has it, joined
by the foreign key), and caching the compiled program by hash (the engine is built for each
replay).

The replay is a **check** rather than a second opinion only because the engine
is the same build ([0006](../decisions/0006-one-engine-build.md)) and the clock
is injected ([0019](../decisions/0019-injected-capabilities.md)). Without
either, the two evaluations could legitimately differ and the comparison would
mean nothing.

> **`runsOn` decides which validators run here.** `runsOn: 'both' | 'client' |
> 'server'`, defaulting to `both`, is what lets a uniqueness check be
> server-only and a debounced hint client-only. The replay filters out anything
> marked `client`, and the browser filters out anything marked `server` — the
> same rule, read from the same document, applied from the two ends
> ([0043](../decisions/0043-runs-on.md)).

The single transaction is the reason for choosing PostgreSQL
([0024](../decisions/0024-postgres-over-mongodb.md)): "the webhook fired but the
submission rolled back" is the worst support burden a self-hosted product can
have.

## 6.3 Delivering a webhook

```
every 5s, one pass at a time, in the server process
   │
   ▼
claimDueDeliveries(now, 20)      state = 'pending' AND next_attempt_at <= now
   │                             NO row lock — see the replica note below
   ▼
for each: the webhook still exists?
   ├─ no ──▶ state = 'dead'      nothing left to deliver to; retrying forever
   │                             against a deleted destination helps nobody
   ▼ yes
resolve the hostname OURSELVES
   │
   ├─ any address private? ──▶ refuse, without opening a socket
   │                           (unless FORMANCY_WEBHOOK_ALLOW_PRIVATE)
   ▼
POST through an undici agent whose lookup returns ONLY the checked address
   │     · Host header and SNI keep the original name, so TLS still validates
   │     · redirect: 'manual' — a redirect is a destination nothing checked
   │     · Stripe-scheme signature over `timestamp.body`
   │     · X-Formancy-Event-Id stable across attempts; attempt number sent,
   │       deliberately NOT signed, so a retry reuses the signature
   │     · response read to 64 kB and never interpreted
   ▼
afterAttempt(delivery, outcome, now, random)      pure; the only decision-maker
   │
   ├─ ok ──────────────▶ state = 'delivered'
   ├─ attempt < 8 ─────▶ state = 'pending', next_attempt_at = now + backoff
   │                     exponential with FULL jitter, so an outage's backlog
   │                     does not retry in one thundering instant
   └─ attempt == 8 ────▶ state = 'dead', lastError kept
```

A thrown send is caught and turned into a failed outcome rather than allowed to
escape, because escaping abandons every remaining delivery in the batch.

The pass is deliberately one batch that returns, not a loop that never does:
what to do is `@formancy/server-core` and testable without a clock or a
network, and when to do it is the host's
([0049](../decisions/0049-one-polling-worker.md)). The same decision records why
this is **not** a distributed queue — `claimDueDeliveries` takes no lock, so a
second replica delivers everything a second time.

## 6.4 Publishing a form

```
author saves
   │
   ▼
validateSchema           structural (ajv) then semantic:
   │                     duplicate keys · rename legality · nested repeaters
   │                     pages below top level · uncompilable patterns
   │                     logic targets · unresolvable message references
   ├─ invalid ──▶ errors written for a form author, not a compiler
   ▼
compile every expression, build the dependency graph
   ├─ cycle ──▶ refused, with the trace   ([0018](../decisions/0018-static-dependencies.md))
   ▼
re-check every expression with leaves typed as the MODEL says
   │                     the engine types them `dyn`, so an unfinished answer
   │                     is not an error — which also lets `seats * 4` compile
   │                     and then fail for every value, silently, forever
   ├─ no overload ──▶ refused, naming the fix
   │                     ([0054](../decisions/0054-expressions-that-never-work.md))
   ▼
canonicalise and hash                      ([0010](../decisions/0010-canonical-hash.md))
   │
   ├─ hash == the current version's ──▶ that version, unchanged. Not a new row:
   │                     republishing what is already published is a no-op, and
   │                     `UNIQUE (form_id, schema_hash)` is what makes it one
   │
   ├─ hash == an OLDER version's ──▶ already_published, with that version's number
   │                     a published version is immutable and cannot be
   │                     published twice; without this the insert raised 500
   ▼
the request declared the version it opened?  ← optional: a script composes a
   │                     document rather than opening one, and declares nothing
   ├─ declared, and something else is current ──▶ version_changed, carrying that
   │                     schema, so the editor shows the difference
   │                     ([0092](../decisions/0092-publishing-declares-what-it-opened.md))
   ▼
diffSchemas(current, new) ──▶ compatible | lossy | breaking, shown to the author
   │
   ▼
the form's kept examples, run against the current version and the new one,
   │                     in server mode, from the kept sample, compared by the
   │                     scenario panel's comparedToLastRun
   ├─ held, and no longer ──▶ a sentence in the 201's warnings, naming it,
   │                     both versions and what happened — never a refusal
   │                     ([0166](../decisions/0166-a-deployment-keeps-a-forms-examples-and-runs-them-at-publish.md))
   ▼
INSERT a new form_versions row          ← never an UPDATE; a trigger enforces it
UPDATE forms.current_version_id          ([0025](../decisions/0025-immutability-in-the-database.md))
CREATE per-form partial indexes for fields marked indexed
```

A form that could loop is never persisted. A published version is never
modified. **The two hash branches come before the declaration check**, and that
order is the point: an editor whose document already matches what is published
has nothing to merge — somebody else wrote exactly what they were going to
write — and a repeated deploy of an unchanged schema must not manufacture a
version. And the second expression check runs *here* rather than in the
engine: a form already published with that mistake keeps opening for whoever is
halfway through filling it in, with the one field that never fills in that it
has always had.

## 6.5 Resuming a draft after the form changed

```
resume(draftId)
   │
   ▼
diffSchemas(draftVersion, currentVersion)
   │
   ├─ compatible ──▶ rebind silently to the current version
   │
   ├─ lossy      ──▶ rebind, produce a migrationReport, and move data belonging
   │                 to removed fields into data.__orphaned — NEVER deleted
   │
   └─ breaking   ──▶ leave the draft read-only against its original version,
                     and offer an explicit "start over"
```

Migration is lazy, one draft at a time, on resume
([0027](../decisions/0027-lazy-draft-migration.md)). A batch migration over
everyone's saved answers at publish time would be the same operation performed
at the worst possible moment and without the option to decline.

A resume also hands back the token the draft's response is sent with — the same one every
time, naming the draft — so a draft is one response however late it is resumed and however
often, and is stored once (6.2).

**Submissions never migrate.** Only drafts do. That distinction is what makes a
two-year-old submission readable against the schema that produced it.

## 6.6 Uploading a file

```
browser                              server
───────                              ──────
POST /f/claim/files
  { field, name, size,       ───▶  maySubmit — the submission's gate, the same function
    contentType }                   the field's accept and maxFileSize, the operator's ceiling
                                       ├─ refused ──▶ 403 · 413 · 400, before a byte is sent
                                       ▼
                                  INSERT the row: offered, key minted from form and id
                      ◀───  201 { id, storageKey, uploadUrl }

PUT uploadUrl  (bytes)       ───▶  this form's file, and still offered?   404 · 409 already_uploaded
                                  the size the offer named?               400 size_mismatch
                                       │
                                  leaseFile   UPDATE SET receiving_until = now + 2 min
                                              WHERE offered AND (no lease OR it has run out)
                                       ├─ no row ──▶ 409 busy, before the bytes are scanned
                                       ▼
                                  the deployment's scanner, if it has one
                                       ├─ finding ─────────▶ release · 422 refused_by_scanner
                                       ├─ cannot be asked ─▶ release · 503 scanner_unavailable
                                       ▼
                                  the row still names this lease, and it has not run out?
                                       ├─ no ──▶ release · 409 busy
                                       ▼
                                  put the bytes under the minted key
                                       │
                                  settleFile  UPDATE SET stored, receiving_until = NULL
                                              WHERE offered AND receiving_until = this lease
                                       ├─ no row ──▶ 409 busy: the write outlasted it
                                       ▼
                      ◀───  204

POST /f/claim/submissions    ───▶  the replay in 6.2, then in its ONE transaction:
  { evidence: [{ id, … }] }         UPDATE SET claimed, submission_id
                                    WHERE id IN (…) AND stored
                                       └─ fewer rows than named ──▶ the whole submission rolls back

every 15 minutes, in the server process:
  offered or stored, created more than a day ago ──▶ the bytes removed, then the row
```

The order is the design, in four places. **The row before the bytes**, so an upload that dies
halfway leaves something the collector knows to look for; **the claim inside the submission's
transaction**, so a submission exists if and only if its files belong to it
([0055](../decisions/0055-files-are-claimed.md)). **The scan before the bytes are kept**, so a
file the scanner refuses is never in the store
([0131](../decisions/0131-an-upload-is-scanned-before-it-is-kept.md)). And **one request between
the lease and the settle**, because the scan is where the time goes: a request that wrote back
the row it read before scanning could, after a faster one's file had been claimed, put the row
back to `stored` with no submission — for the collector, a day later
([0153](../decisions/0153-a-file-is-received-by-one-request-at-a-time.md)).

Every guarded write is one conditional `UPDATE` whose row count is the answer, so two requests
racing each other are decided by the database rather than by whichever check ran first. Every
way out of the `PUT` that keeps nothing releases the lease before it replies, so a `PUT` of the
same file sent again, as the reply invites, is not refused as busy; a release that fails leaves
the reply as it was, and the lease runs out on its own. A write that outlasts its lease is the
one thing the lease does not stop: its settle is refused, but its bytes land under the same key
([§11.2](11-risks-and-debt.md)).

## 6.7 Writing a form from a sentence

```
pane ─ PromptRun (6.11)      authorForm, in builder-core                      host's AskModel
───────────────────────      ───────────────────────────                      ───────────────
Write it
  run.write: stop = createStop()
  busy, Stop shown    ───▶   for attempt 1 … limit
                               stopped already? ──▶ ended: stopped
                               ask({ kind, system, user, attempt, limit,
                                     followUp from attempt 2 }, turn)  ───▶  its request
                                 ├─ Stop pressed, or the pane goes with a run of its own
                                 │     ──▶ turn.onCancel ──────────────────▶  abort, if it listens
                                 │     ──▶ ended: stopped; a later answer settles nothing
                                 ├─ rejected with ModelBusyError ──▶ ended: busy, no reason
                                 ├─ rejected or threw ──▶ ended: unreachable, with its reason if any
                                 ▼
                               readAnswer
                                 ├─ {"declined": why} ──▶ ended: declined, with the reason
                                 ├─ {"declined": ""}  ──▶ the next turn asks for the reason
                                 ▼
                               validateSchema → the engine's compile → expressionProblems
                                 ├─ refused ──▶ the complaint goes into the next turn
                                 ▼
                               ok: the document
                             every attempt refused ──▶ ended: gave-up
                      ◀───   resolves, however it ended

  proposalStatus(result)           ──▶ the live region: one sentence for each ending
  proposeEdit(current, document, examples)
    one or more examples ──▶ runScenarios on current and on document
                         ──▶ comparedToLastRun ──▶ what would stop holding, and hold again
                         ──▶ proposalHeading names the first; the status names both (0159)
    none, or an empty list ──▶ examples is undefined: no verdict, rather than an empty one
  ──▶ the review ──▶ applyProposal (0109)
```

**The stop is the person's, and it does not wait for the host.** Each turn is raced against
it, so the run ends the moment Stop is pressed, or a pane holding its own run is unmounted
or destroyed — a run the host holds goes on without its pane (6.11). The host is told through `turn.onCancel` and may abort its request. A host that ignores it is
stopped all the same, and its answer, when it comes, resolves a promise nothing is waiting
on. **A host's error is an ending, not an exception.** `authorForm` resolves with
`ended: 'unreachable'` and the error's message, so the sentence the pane says is decided once,
in `proposalStatus`, and not by two panes each catching the rejection
([0157](../decisions/0157-a-models-turn-can-be-stopped.md)). A model that rejects with
`ModelBusyError` was not asked, and nothing is wrong with it: the run ends `busy`, with no
reason, and the pane says from its catalogue that another request is waiting
([0162](../decisions/0162-an-example-is-drafted-from-what-the-author-said.md)). Only the latest complaint goes
back to the model, in `user` for a host that keeps no conversation and alone as `followUp`
for one that does ([0056](../decisions/0056-agents-get-the-checks.md)).

**A decline is an ending too.** The briefing offers the model `{"declined": "<why>"}` for a
request the format cannot express, and an answer of exactly that shape ends the run on the
turn it came, before any check. Another turn would be paid for to hear the same answer, or
to talk the model out of it. The pane says the model declined and shows its reason, as text, in place of
the problem list ([0158](../decisions/0158-a-model-may-decline.md)). The same shape with no
reason in it is neither an ending nor a document. It is not checked as a form, whose schema
would call the key a misspelling and tell the model to write a document after all. The
next turn's complaint asks for the reason, and shows the decline as the briefing does.

## 6.8 Carrying a turn by hand

```
prompt pane              authorForm (6.7)          relay, in builder-core          relay pane            person
───────────              ────────────────          ──────────────────────          ──────────            ──────
Write it        ───▶     ask(prompt, turn)  ───▶   one waiting already?
                                                     └─ yes ──▶ rejects with ModelBusyError:
                                                                the run ends busy (0162)
                                                   waiting = { prompt, message, followUp }
                                                   onCancel ──▶ clears it
                                                   tells subscribers   ───▶   draws the turn, and
                                                                              relayLeaves(kind):
                                                                              what it carries;
                                                                              focus to Copy
                                                                              Copy ──▶ clipboard ──▶  a chat of
                                                                              (follow-up on a retry)   their own
                                                                                                         │
                                                   answer(text)        ◀───   Check this answer  ◀───  pastes back
                                                     ├─ no object, not anyway ──▶ 'no-object': the turn waits,
                                                     │                             "Use it anyway" offered
                                                     ├─ nothing waiting (stopped) ──▶ 'nothing-waiting'
                                                     ▼
                                                   clears the turn, resolves ask(text)
                         readAnswer → checks  ◀────┘
                         next turn, or the result ──▶ the review (0109)
Stop, or a pane goes  ─▶ turn.onCancel ──────────▶ the turn is cleared, and the pane draws nothing
  with its own run
```

**The relay is a host's model, and only that.** `authorForm` asks it as it asks any
`AskModel`, races it against the stop, and checks what comes back; the relay decides only
what a pane cannot be trusted to decide twice — one turn at a time, a paste with no object
in it held back, and a stop clearing the turn
([0160](../decisions/0160-a-person-carries-the-models-turn.md)). The playground asks it from
the prompt pane and the scenario pane's drafting part, and from the translations pane under
its own tab (6.9), so the turn one of them holds refuses another's: that run ends `busy`, and
its pane says another request is waiting
([0162](../decisions/0162-an-example-is-drafted-from-what-the-author-said.md)). The request leaves the page
on the clipboard, by the person's press, and the answer comes back the same way. The relay
and its pane call nothing. Each turn that arrives while the pane is drawn takes the focus to
Copy, described by the turn and what to do with it: from then on the run waits on the person,
and a failed answer took the pane, and the focus in it, away before the retry drew it again.
A turn found waiting when the pane is drawn again (6.11) takes none: the person was using
another control. What was pasted is bound to nothing but the run that is waiting: the review's
diff against the document the run was asked against is what shows a paste that answered
something else (SAFETY-ANALYSIS D10). What the pane says leaves is said for the turn's kind,
which the run set on its prompt: the whole form for an edit, and part of it without the rules
for a translation or examples
([0167](../decisions/0167-the-relay-says-what-each-request-carries.md)).

## 6.9 Asking a model for what a language is missing

```
review part (in the translations pane)   builder-core                                     model (6.7, or 6.8's relay)
──────────────────────────────────────   ────────────                                     ───────────────────────────
"Ask a model for the N missing messages"
  stop = createStop()             ───▶   translateCatalogue(ask, form, locale)
                                           translationPrompt(form, locale)
                                             rows = catalogueFile(form, locale), target ""
                                             + where each is used (the live-id walk)
                                             + the language's own translations, for register
                                             nothing missing ──▶ ok, no model asked
                                           askChecked                          ───────▶   { system, user }
                                             not JSON, not a catalogue file,
                                             another locale, a decline with
                                             no reason ──▶ asked again, that problem alone
                                             a decline ──▶ ended after its turn
                                             another pane's turn waiting ──▶ ended busy,
                                               in the prompt pane's sentence (0162)
                                             ok ──▶ ids not asked: dropped
                                                    ids asked, empty or blank: still missing
                                                    asked: each id with the source sent
  proposeTranslation(session, answer[, earlier])
                                           keep what is still missing in the form now,
                                             each with the source sent, not the model's echo
                                           scratch session ← importCatalogue(kept)
                                             the import's rules: stale named, empty erases nothing
                                           rows { id, source, was, now, flags: stale | unchanged }
                                           proposeEdit(form now, scratch document)
                                           basedOn: the earlier proposal's, for the rest
                                         translationToReview: no rows ──▶ none held
  no rows: the status says why, the ids dropped, Ask again
  rows: the review: source · before · proposed · to look at,
  the form as proposed at that locale, Apply · Discard · Translate the rest
  Apply ──▶ applyProposal (0109): refused if the form moved, else one undo step
```

**Only what is missing, and only through the import.** The request holds the messages nobody
has written in that language, each with where the form uses it. The form's rules are not
sent, and neither is the document. An answer lands only where a message is still missing
when it arrives, so a translation a person typed while the model was answering is dropped
rather than overwritten. It lands by `importCatalogue`, in a scratch session, so the
proposal is what the import would have written from the same file uploaded by hand, with
two differences the request knows better than the answer: each source is the one the model
was sent, so *stale* means the English moved after it was asked, and a target of nothing but
spaces is one left empty
([0161](../decisions/0161-a-model-translates-only-what-is-missing.md)).

**An answer that writes nothing is not held.** Every message left empty, or every
translation dropped because a person wrote it first: there is nothing to apply or discard,
so the part offers Ask again, and the status and the list of what was dropped say which.

**The review belongs to its language.** The part is keyed by the locale in both builders, so
choosing another language, like leaving the tab, ends a run the part holds itself (0157).
A run the host holds goes on, and is drawn only under its own language (6.12). Through the
relay, the turn is drawn where the prompt pane's is (6.8), at the top of either builder.
*Translate the rest* asks over the proposal under review, and the answer is written over it
and held against its basis, so the two land together, or neither does if the form moved in
between.

## 6.10 Drafting examples from what the author said

```
drafting part                  draftScenarios, in builder-core                 host's AskModel (or a relay, 6.8)
─────────────                  ───────────────────────────────                 ─────────────────────────────────
Draft examples
  stop = createStop()  ───▶    scenarioPrompt(document, intent,
                                 { initialValue, existing })
                                 fields by data path, types, labels, options,
                                 the engine's codes, the form's own codes by name,
                                 where examples start, names taken, the words —
                                 no rule, no pattern, no bound, not required
                               askChecked (6.7's loop)                  ───▶   its request
                                 ├─ stopped / unreachable / busy / declined ──▶ ended, as 6.7
                                 ▼
                               each item read on its own
                                 ├─ none is an example ──▶ the reasons go into the next turn
                                 ▼
                               ok: drafts, and the items that were not, with why
                       ◀───    resolves, however it ended
  draftStatus, draftProblems ──▶ the live region, and the list beneath it
  draftQuotes                ──▶ the model's words, quoted: why it declined, or its last answer

  on every render, for each draft waiting:
    draftVerdict(document now, draft, { initialValue, mode })  ──▶ runScenarios: holds, or why not
  Keep    ──▶ keepDraft(document, scenarios, draft, options)
                ├─ a name already in the list    ──▶ refused, and said
                ├─ a path this form does not have ──▶ refused, and said
                ▼
              onChange / scenariosChange([...scenarios, draft]) ──▶ the host's list ──▶ the panel (0111)
  Discard ──▶ the draft leaves; nothing reaches the host
```

**What the model is never shown is the point.** A drafted example is worth having only if it
can disagree with the form, so the request carries what an example has to name and what the
author said, and none of what the rules do. **The engine, not the model, says whether a
draft holds**, with the panel's own options, every time the part is drawn, so an edit made
while a draft waits changes its verdict. **A person keeps each one**, and a draft that fails
can be kept: the failure is the question the person answers
([0162](../decisions/0162-an-example-is-drafted-from-what-the-author-said.md)).

## 6.11 A turn that outlives the pane that asked

```
page (host)                       PromptRun, in builder-core            prompt pane, in either builder
───────────                       ──────────────────────────            ──────────────────────────────
run = createPromptRun()           { instruction, asked, busy, result,   subscribe ──▶ draws the snapshot
  beside the relay                  proposal, refusal } — one object      Write ──▶ run.write(ask, session,
                                    until something in it changes                   { examples, attempts })
                                  write: one at a time; the box
                                    cannot change while it waits;
                                    asked: the words, kept with
                                    what the run comes to
                                  authorForm (6.7), its own stop ───▶  (6.8: the relay's turn waits)
  the visitor looks elsewhere:                                          unsubscribes — nothing is stopped
  Schema, another tab, the
  other builder
  back: the relay pane drawn again over the turn still waiting — no focus moved (0163)
                                  the answer pasted, checked ──▶
                                  proposeEdit(document when asked) ──▶  held
  the pane drawn again                                                  subscribes ──▶ the box, the review
                                                                        naming `asked`; Stop while it waits
                                  apply(session) ◀──────────────────── Apply: refused if the form moved (0109)
  another demo ──▶ run.discard(): stops a run in flight, forgets it and what it came to
pane given no run ──▶ makes its own, and stops it when it goes (0157)
```

**The run is the host's when the host holds it.** A run lived in the prompt pane, and a
pane taken off the screen stopped it, so a turn carried by hand ended whenever the visitor
looked at anything else. `createPromptRun` holds the run, its stop and what it came to
outside any pane; a pane given one only subscribes, and its going ends nothing. Stop ends
it from whichever pane shows it. The proposal is held against the document the run was
asked over, so Apply refuses it if the form moved while it waited, wherever that happened.
Once the run has answered, the box is the person's again, so the words it was asked with are
kept beside what it came to and drawn in the review: a review read beside a box that says
something else by then still says what it answers. A relay pane drawn again over the turn
still waiting moves no focus; only a turn that arrives while it is drawn does.
Each pane reads whether Stop had the focus as the run reports its end, before drawing it,
because the run ends in a promise no pane may still be awaiting
([0163](../decisions/0163-a-models-run-belongs-to-the-host.md)). The playground holds one at
the page, beside the relay, and discards it when another demo is chosen. The translations
pane's run (6.9) and the drafting part's (6.10) are held the same way since 0164 (6.12).

## 6.12 A translation held for its language, and drafts for their form

```
page (host)                    builder-core                                  parts, in either builder
───────────                    ────────────                                  ────────────────────────
translation = createTranslationRun()
                               { locale, busy, result, proposal, refusal }   pane opens on the run's locale
                               translate(ask, session, locale): forgets      Ask ──▶ translate
                                 the last, asks for locale's missing ones    Translate the rest ──▶ rest
                               rest: over the held proposal, its basis kept
                               apply: nothing while a run waits
                               translationOn(state, drawn, document)
                                 drawn == locale ──▶ the run                  the review, Stop, Apply
                                 another, waiting or held ──▶ elsewhere       one sentence, nothing else
                                 locale left the form ──▶ elsewhere, gone     the sentence, Stop or Discard
                                 another, came to nothing ──▶ idle            Ask for the language drawn
drafting = createDraftRun()
                               { intent, form: the id asked over, busy,      the box ──▶ describe
                                 result, drafts, note }                      Draft ──▶ draft(ask, session)
                               draft over another form: forgets its run
                               draftsOn(state, session)
                                 session's form id == form ──▶ the run        drafts, judged against this
                                                                               session's document as it is
                                 another id ──▶ the words only                no drafts, Draft idle
                               keep(draft, session, list): refused for
                                 another form; else keepDraft (0162)         Keep ──▶ the host's list
  the visitor looks elsewhere: Schema, another tab, the other builder        unsubscribe — nothing ends
  back: a new session over the same text ──▶ the same form id ──▶ drawn again, waiting or with drafts
  another demo ──▶ discard() on each: a run in flight stopped, forgotten, its turn cleared
part given no run ──▶ holds its own: stopped when it goes; the drafting's also on another session
```

**Each run is held for what it is about.** A translation is about a language and drafts are
about a form, so each holder keeps that, and one decision in `builder-core` says what a part
drawn somewhere else shows of it. A translation under another language is named and not drawn,
because its review and its Apply would read as that language's. Once its own language has left
the form no part is drawn under it, so every language names it as gone and offers its Stop or
its Discard, still drawing none of it; drafts over another form are
not drawn at all, because Keep would add them to the wrong list. The form is its id, which is
what survives the playground opening a new session over the same text every time *Build* is
shown, and what changes when it opens another form. The stops, and the rule that an ending
lands only on the run still in flight, are the three holders' one shared part
([0164](../decisions/0164-a-translation-is-held-for-its-language-and-a-draft-for-its-form.md)).

## 6.13 Asking the deployment's model through its server

```
admin, in the browser                      server                                  provider
─────────────────────                      ──────                                  ────────
signed in ──▶ GET /model ───────────────▶  requires form.publish
              404 ◀────────────────────── none configured: no prompt pane drawn
              { provider, model } ◀──────  one is: prompt pane, Translations ask,
                                           and a line saying where a request goes
a run asks askServerModel(prompt, turn)
  kind = modelRequestKind(prompt.system)
    none ──▶ rejects: not one formancy makes; nothing leaves
  POST /model/complete { kind, user } ──▶  401 / 403 before anything else
  turn.onCancel ──▶ AbortController        body over the cap ──▶ 413
                                           ten a minute per session ──▶ 429
                                           completeBuilderRequest
                                             unknown kind ──▶ 400, nothing asked
                                             system = modelBriefing(kind)
                                             Completer.complete ─────────────────▶ stream
                                               response closed unwritten
                                                 ──▶ cancellation ──▶ abort ─────▶ stops
                                               stop reason / status read first
                                           audit model.asked: kind, size, outcome
  { text } ◀───────────────────────────── answered
  declinedAnswer(reason) ◀─────────────── { declined }: the provider refused
  rejects with the sentence ◀──────────── 502: truncated, key refused, limited,
                                           model refused, unreachable
the run checks the text, as any model's (6.7, 6.9)
```

**The browser names the request and the server briefs it.** The kind is read from the
briefing the run handed the ask, so one `AskModel` serves the prompt pane and the
Translations tab, and a system part formancy did not write is refused before it leaves. The
server never reads a system part: it asks under the briefing `builder-core` writes for that
kind. That narrows the endpoint to formancy's three kinds of request without closing it — the
user part is free text, so a session can still ask for something else under formancy's
briefing, bounded by the permission, the limit, the cap and the audit row
([0165](../decisions/0165-a-deployments-model-is-asked-through-its-server.md)). The versions
are not compared: the browser names the kind from its own briefing and checks the answer as
its own version expects, while the model is briefed by the server's.

**Everything after the answer is the browser's, as before.** The loop, the checks, the
complaint in the next turn, the decline, the stop and the review are those of 6.7 and 6.9;
the server is one more `AskModel` behind them. A stop reaches the provider: the run's
`turn.onCancel` aborts the browser's request, the response closes before it was written, and
the route tells the adapter, which aborts its call. A browser that left while its session or
key was still being checked has closed the response before the handler ran; the route reads
that as gone from the start, and the adapter sends nothing. A response that closes after it
was written is how every request ends, and cancels nothing.

## 6.14 Keeping a form's examples, and publishing against them

```
admin opens a published form ──▶ GET /f/:path/examples ──▶ 401 without a session
                                   readExamples(actor)       403 for a viewer: no pane
                                     each kept row through   { scenarios, sample?, unreadable? }
                                     readScenario, as a PUT's
ScenarioPane over them, server mode, from the sample
  Remove, or Keep on a draft ──▶ drawn at once
                             ──▶ PUT /f/:path/examples, after the save before it
                                   keepExamples(actor)
                                     each item through readScenario ── any not an example
                                     names unique, sample a map        ──▶ 422, nothing kept
                                     one commit: form_examples row + form.examples.changed
                             ◀── failed: said; GET again in the same chain, its list drawn,
                                 changes made on the list it replaces never sent;
                                 GET unreachable too: the list the server last kept
  drafting (server has a model) ──▶ POST /model/complete { kind: "scenarios" } (6.13)
PromptPane's review runs the same examples, server mode (0159)

Publish ──▶ POST /forms ──▶ publishForm (6.4): examplesThatStopHolding
         ◀── 201 { version, schemaHash, warnings: [ "The example \"…\" held against
             version n and does not hold against version n+1: …" ] }
PublishNote draws the warnings under the version it published
```

**The server is the host the scenarios belong to.** The panes still decide nothing about where
they are kept ([0111](../decisions/0111-a-scenario-panel-names-what-stopped-holding.md)); the
admin holds the list for the form's workspace, so it survives the build tab coming and going,
and saves each change whole, one save after another, so two cannot reach the server in the
wrong order. A save that fails puts the server's list back: it is read again inside the same
chain, and a change made on the list it replaces — queued behind the failure, or made while the
read was out — is dropped rather than sent, since the server never took the list it was made on.
What is kept is read back as a `PUT` is read, so a row edited around the server reaches the
admin as a sentence in `unreadable`, never as an example for the pane to run. The publish reads them through the storage port and decides what to say; the
route carries the sentence on the `201`
([0166](../decisions/0166-a-deployment-keeps-a-forms-examples-and-runs-them-at-publish.md)).
A form never published has no row to keep them beside, so the admin offers no list until it
has one.


## 6.15 A limited request, on whichever replica answers it

```
request ──▶ replica A or replica B, the same either way
              │
   the route's limit — at onRequest; the model's at preHandler, once the session is known
              │
              ▼
   INSERT INTO rate_limit_counters … ON CONFLICT (key) DO UPDATE      one statement,
     key    'POST /f/:path/submissions 203.0.113.1'                    the row's lock
     window starts at the key's first request, ends now() + timeWindow on the database's clock
              │
     ┌────────┴──────────┬──────────────────────────────────────────────┐
     ▼                   ▼                                              ▼
   within max          over max                     no answer within a second, or an error
   ──▶ the route       ──▶ 429, Retry-After         ├─ declared admit: the public plane ──▶ the route, uncounted
                                                     └─ declared refuse: login, model ──▶ 503 RATE_LIMIT_UNAVAILABLE
                                                     the process says so once, and again when it answers

   at most once in ten minutes, on the back of a count and not waited for:
   DELETE FROM rate_limit_counters WHERE resets_at <= now()
```

**The count is the database's, so the replica does not matter.** Every limit counts in one
table, one row per route and client, and the upsert serialises two replicas counting the same
client on that row's lock, so the third request a minute is the third whichever process answered
the first two. The window is the plugin's — fixed, from a key's first request — kept on the
database's clock rather than on each process's
([0170](../decisions/0170-a-limit-is-counted-once-in-the-database-every-replica-shares.md)).

**A count that does not come back is decided without.** Each route's limit says, through
`limited`, whether it admits or refuses then; the error a refusing route sends says nothing about
the database. A count abandoned at the bound is not cancelled, and may land later.
