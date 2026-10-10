# 0160 — On the website a person carries the model's turn, and the relay is decided once in builder-core

- **Status:** accepted
- **Date:** 2026-10-10
- **Supersedes:** the playground's stand-in model in
  [0109](0109-an-ai-edit-is-reviewed-before-it-lands.md), and what
  [0157](0157-a-models-turn-can-be-stopped.md) and [0158](0158-a-model-may-decline.md)
  decided about its dialog — nothing else of any of the three
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/builder-core/src/relay.test.ts`. Against a first cut that
  queued turns, pre-checked nothing, ignored a stop and built a fresh turn on every read,
  four cases failed: *is the same object until it changes* on identity, *with no JSON
  object in it is refused before the run sees it* with `'accepted'`, *clears the turn* with
  the turn still waiting, and *a second run asking while one waits is refused* by timing out
  behind the first. With the relay mutated one change at a time: a turn without its
  `followUp` fails *is exactly the prompt a host's model would have been sent*; a trimmed
  message fails *verbatim*; a pre-check that refuses a decline fails *that declines ends the
  run as declined*; ignoring `anyway` fails *sent anyway*; and not telling listeners about a
  stop fails *clears the turn*. Both builders' `relay-pane.test`: against a pane that drew
  nothing, every case but *the pane is not there at all* failed. Then, one change at a time
  in each: Copy writing the user message alone fails *Copy puts the whole request on the
  clipboard* and the refusal case; Copy on a retry writing the whole request fails *on a
  retry Copy puts only what was wrong*; a refusal that does not select the text fails *a
  refused clipboard write selects the text to copy*, and so, in React, does one that says
  "Copied"; a link without `rel` fails *links to a chat only when the host names one*;
  "Use it anyway" drawn from the start fails *only then offered anyway*; and an Angular pane
  that never subscribes fails ten cases. Under *the relay it follows*, a pane that keeps the
  first relay it was given fails *a relay replaced is let go* in either builder, and an
  Angular effect that reads the turn it follows fails *listened to once, however many turns
  pass*. Added after review, each watched failing in both builders: a Copy that opens the
  chat itself, or posts the request elsewhere, fails *Copy sends the request nowhere*, which
  presses every Copy with `fetch`, `XMLHttpRequest`, `sendBeacon` and `window.open` spied;
  a new turn that keeps what was held about the last — the React pane spreading `held` over
  the new turn, the Angular `follow()` leaving the answer — fails *leaves nothing of its
  answer box to the next request*; an edit that keeps "Use it anyway" fails *edited after it
  was held back*; and against panes that did not move the focus, both cases under *a turn
  arriving* failed. Both `language.test` cases, *the relay pane…*, fail
  with "Check this answer" written into the pane, and — now that they walk a copy that
  succeeds as well as one refused — with "Copied" written into either pane, which passed
  every suite before. `apps/docs/src/builder-layering.test.ts`
  failed with `RelayPane` and `FormancyRelayPane` unaccounted for until they were paired,
  and `workbench.test.ts` on `relay-pane`, `relay-request` and `relay-answer` until the
  workbench dressed them. `apps/playground/src/two-builders.test.tsx`, *describing a change
  in words*, in either builder: before the playground was wired, both cases failed finding
  no relay pane; with a `fetch` added to the relay's `ask`, both failed on the fetch spy,
  and an `XMLHttpRequest` opened there and a `sendBeacon` each failed on theirs. The round
  trip once pressed no Copy, so an Angular pane whose Copy opened the chat and posted the
  request elsewhere passed it, and every other suite. It now presses every Copy — the
  request, then on a retry what was wrong and the whole request — with `window.open` spied
  too. Against that pane the Angular case failed on `fetch`, and on `window.open` with the
  post taken out; the React pane made to open the chat failed the React case.
  `apps/playground/src/accessible.test.tsx`, *Fields, with a turn to carry*, fails the name
  check and axe with the answer box's label unbound. `scripts/request-browser-test.mjs`,
  run by `pnpm test:browser`, opens the playground a second time and carries a turn through
  each builder, React and then Angular — the request copied and read back from the
  clipboard, an answer pasted, the review applied — counting every request the page makes
  on the way. Its first run found the
  React pane's `flushSync` had bundled `react-dom` into `@formancy/builder-react`, which
  left the playground blank with every jsdom suite green. With the React pane made to open
  the chat itself after a copy, the round trip failed with *"it asked https://claude.ai"*
  while the playground at rest still passed. It carried a turn through React alone at
  first, and passed with the Angular pane's Copy opening the chat and posting the request;
  carrying a second turn through Angular, it fails on that pane with *"it asked
  https://claude.ai"*. The post never reached the route: the playground's content security
  policy refused it first. `scripts/install-fixture/consume.ts`,
  under `pnpm test:e2e:install`, carries a turn through the packed packages.

## Context

The playground's AI — describe a change in words, review what it does, apply it — needs a
model, and formancy.ai may ask no other site for anything
([0154](0154-the-website-makes-no-request-to-any-other-site.md)). A real model behind a key
was rejected in [0109](0109-an-ai-edit-is-reviewed-before-it-lands.md) for the same reason,
and the playground supplied a stand-in instead: `DEMO_MODEL`, a `window.prompt` that showed
the attempt, the last line of the request, and asked the visitor to type a whole form
document as an answer.

So nobody could use a real model on formancy.ai. The dialog showed one line of a request
whose substance is the briefing and the current document; a visitor who wanted to ask a
model of their own had nothing to give it. Everything after the answer was real — read,
validated, compiled, type-checked, diffed, held for review — and the one part that was
pretend was the part that makes the feature worth trying.

Visitors have models: a chat under their own account. What was missing was a way to carry
the request to one and the answer back without the page making the call.

## Decision

**On the website a person carries the model's turn.** The page shows the exact request,
the visitor copies it into a chat of their own, and pastes the answer back. Every check
after that runs in the tab.

**The relay is decided once, in `@formancy/builder-core`.** `createRelay()` returns a
`Relay`: `ask` is an `AskModel` like any host's, so `authorForm` asks it, races it against
the stop and checks what comes back exactly as it would a model's
([0157](0157-a-models-turn-can-be-stopped.md)). `waiting()` is the turn a person is to
carry — the prompt, the whole request as one text, and the follow-up from the second turn —
and stays the same object until it changes, with `subscribe` to hear when it does.
`relayMessage(prompt)` is the system briefing, a blank line and the user message, verbatim.
`answer(text, { anyway })` hands back what was pasted. No sentence is written there; what a
pane says is the catalogue's. Three rules live in it:

- **One turn at a time.** A second `ask` while one waits is refused: the promise rejects,
  so that run ends `unreachable` with a reason, rather than queuing behind a turn the person
  may never answer.
- **A paste is pre-checked.** With no JSON object in it, as `readAnswer` reads one, it is
  `'no-object'` and the turn keeps waiting, so a bad copy costs a paste rather than an
  attempt — unless the person says `anyway`, and then it is the run's answer. A decline is
  an object and an answer ([0158](0158-a-model-may-decline.md)).
- **A stop clears the turn.** `turn.onCancel` takes it away, and a paste after that is
  `'nothing-waiting'`, never an answer to whatever is asked next.

**Both builders draw it, and only draw it.** `RelayPane({ session, relay, chat? })` in
`@formancy/builder-react` and `<formancy-relay-pane [session] [relay] [chat]>` in
`@formancy/builder-angular`, paired in the layering test, dressed by the workbench, every
word in English, German and French. Nothing is drawn while nothing waits. The briefing sits
in a `<details>`, the user message in a read-only text box. Copy writes the whole request;
on a retry it writes what was wrong, alone, with *"New chat? Copy the whole request"* as the
second choice. When the browser refuses the clipboard, the text to copy goes into the
request box, selected, and the pane's polite live region says so. The answer goes in a text
box with *"Check this answer"*; when it holds no object the pane says so and only then
offers *"Use it anyway"*, until the answer is edited. A new turn starts with an empty
answer box. A link to a chat appears only when the host gives
`chat = { name, href }`, opening in a new tab with `noopener noreferrer`: the service is
the host's to name, and a pane given none links nowhere. The pane's own sentence about what
leaves names none either, and speaks for the pane alone, since a package cannot know what
the rest of its host's page sends: *"This pane sends the request nowhere. Copy puts the
whole request on your clipboard, including the form; pasting it into a chat gives it to that
service under your own account."*

**Every turn drawn takes the focus to Copy**, whose `aria-describedby` is the turn and what
to do with it — *"Turn 2 of at most 3. That answer did not work. Copy what was wrong…"*. From
that moment the page waits on the person, and nothing else says so: the prompt pane, where
they pressed Write, says the form is being written, which is true of any model and silent
about whose move it is; and an answer that is checked ends its turn, so the pane, with the
focus in it, goes before a retry draws it again. Focus is the DOM's, and `builder-core` has
none, so each pane moves it — as each prompt pane gives Write the focus back after Stop —
and one case in each builder's `relay-pane.test` holds them to the same.

**The playground has one relay** (`useState(() => createRelay())` in its page), asked by
both builders' prompt panes and drawn at the top of both builders' bodies. It names the
chat — Claude, at `https://claude.ai/new` — in one constant, and nowhere else. No prompt is
put in a URL. `DEMO_MODEL` and its tests are gone. The case
[0159](0159-a-proposal-is-checked-against-the-forms-examples.md) wrote against it in
`two-builders.test.tsx`, *a model's answer, against the form's examples*, now pastes its
answer into the relay, as a visitor does; the playground hands the same prompt panes the
open form's examples, so the review a relayed answer reaches names the examples it would
stop holding.

## Consequences

**What it buys.** A visitor can use a real model on formancy.ai — their own — and watch
every check the product makes run on its answer, the review included. The site still asks
no other site for anything, and the browser gate now carries a turn through the playground
while it counts. A host whose page may not call a model has the same option: a relay and a
pane, with its own chat named or none.

**What it costs.** **A pasted answer is not bound to the prompt it answers.** The relay
cannot tell where a paste came from: another chat, an earlier turn, a different form, JSON
a person wrote by hand. Whatever it is, the run checks it as a form, and `proposeEdit`
diffs it against the document the run was asked against — the basis pinned when the run
began. That diff, read by the person, is the only defence. A paste written for another form
reads as an edit that removes this form's fields, which the review lists and marks as
costing answers. SAFETY-ANALYSIS D10 carries this as a residual.

**The request leaves with the person, whole.** Copy puts the briefing, the instruction and
the whole current document on the clipboard, and pasting it into a chat gives it to that
service under the visitor's own account and terms. Nothing in formancy can see or limit
what happens to it after that. The pane says so in its own sentence. It is not described
anywhere as private. That the pane sends it nowhere is held of the pane in both builders;
that formancy.ai sends nothing is held of the site by the request gate. Neither says
anything about another host's page, which may send whatever it likes beside the pane.

**An answer that works takes the focus with the pane.** The turn ends on the paste, the pane
goes, and the focus that was on *Check this answer* falls to the page's body. The prompt
pane's live region announces the review, but nothing moves the focus to it; a keyboard user
starts again from the top of the page.

**Each turn is a round trip by hand,** two pastes, and a run may take up to three. The
pre-check spares an attempt only for a paste with no object in it. A paste that holds some
object but not a form is an answer, and costs one.

**The turn lives as long as the prompt pane.** The relay pane sits above the tabs in both
builders, but a run is the prompt pane's. Switching tab, builder or editor mode takes the
prompt pane away, which stops its run (0157) and clears the turn. A visitor mid-turn who
looks at another tab loses it and asks again.

**One turn at a time is said in English.** A host that wires two prompt panes to one relay
sees the second run end as a model that could not be reached, with the relay's reason as the
host's own error message — shown as written, untranslated, as every host's is (0157). One
relay per prompt pane, or one pane at a time, avoids it.

**The clipboard needs the browser's leave.** A secure context and a user's press; refused,
the person copies the selected text with the keyboard. Measured only in jsdom with a stubbed
clipboard and in the gate's Chromium with the permission granted to the page's own origin.
No other browser is checked here.

**A link is a page on another site.** The chat link is navigation the visitor chooses, not a
request the page makes, and the gate looks at it without following it. What that site
records about the visit is its own.

## Alternatives considered

**A real model behind a key, on the site.** Rejected in 0109 and still: a vendor, a key and
a network call on every visitor's behalf, from a site that promises none (0154).

**A proxy on formancy.ai's own origin that calls a model.** Same-origin, so the gate would
pass. Lost because the site would then be operating a model service: a key to keep, calls
to pay for and to rate-limit, and every visitor's form passing through formancy's server.
The rule is about what the page hands on, not about which host it hands it to.

**Put the request in the chat's URL** — one click instead of a copy. Lost because a form in
a URL is a form in a browser history, a server log and a referrer, and a long one does not
fit. No prompt is ever put in a URL.

**Keep the stand-in dialog, showing more.** A `window.prompt` shows a line, takes a line, and
cannot be styled, translated or tested by role. Showing the whole request there would still
leave a visitor pasting a long document into a one-line box.

**The relay in the playground alone.** Both builders draw it, and when a paste counts would
then be written twice ([0091](0091-a-second-builder-is-a-binding.md)) — and a host with the
same constraint could not use it.

**Bind the answer to the request with a token the model repeats.** Lost because repeating
it is an instruction to a model, not a control: a model may drop it, a person may paste any
answer that carries it, and every request would grow a line that is about the relay rather
than the form. The review's diff is the defence that holds whatever was pasted.

**Announce a new turn in a live region instead of moving the focus.** A live region has to
be in the page before its text changes to be read reliably, and the pane draws nothing
between turns; one kept mounted for it would also leave a keyboard user wherever the focus
fell, on the body after a failed answer. Moving the focus does both, and the description
says what a live region would have.

**Have the prompt pane's status say the request is waiting to be carried.** The prompt pane
does not know its `ask` is a relay, and should not: it is the same pane for a host's own
model. Teaching it would make the relay a case in the run rather than a model like any
other.

**Queue a second request.** Lost because a paste meant for one turn could be taken as the
other's, and the queued run would wait behind a turn nobody may answer.

**No pre-check: every paste goes to the run.** The run would tell the model it wrote no JSON
when the person copied the wrong part of the chat, spending one of three attempts and a round
trip by hand on a mistake of the paste.
