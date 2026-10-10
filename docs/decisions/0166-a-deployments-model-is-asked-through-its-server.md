# 0166 — A deployment's model is asked through its server, and the server writes the briefing

- **Status:** accepted
- **Date:** 2026-10-10
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/builder-core/src/model-requests.test.ts` runs `authorForm`,
  `translateCatalogue` and `draftScenarios` and compares the system part each sends with the
  briefing the server pins for its kind. With the translation briefing swapped for the
  authoring one, three cases fail; with a kind looked up by `in`, *is one of the list, and
  nothing an object happens to have* fails on `constructor`.
  `packages/server-core/src/model.test.ts` holds the use-case: taking `system` from the body
  fails *never under a system part the request carries*; dropping the kind check fails the
  three unknown kinds; trimming the user part fails *with the user part as it was sent*.
  `packages/server/src/model-settings.test.ts` holds every refusal: a key or a model with no
  provider started with none until two cases failed, a default model fails *a provider
  without FORMANCY_MODEL*, and a message that repeats the environment fails *and never says
  the key*. `anthropic-completer.test.ts` and `openai-completer.test.ts` drive the real SDKs
  over a fake `fetch`: content read before the stop reason (or the status) fails the refusal
  and cut-off cases; a thinking block joined into the answer fails *the text, and only the
  text*; an unwired cancellation fails both abort cases; the base URL left to the SDK fails
  against an ambient `ANTHROPIC_BASE_URL`, and an organisation and project left to it fail
  against ambient `OPENAI_ORG_ID` and `OPENAI_PROJECT_ID`. `completers.test.ts` fails with
  xAI mapped to OpenAI's base URL. `model-route.test.ts`, through `createApp`: without the
  permission five cases fail; with the system part taken from the body, two; without a body
  cap of its own, a request the size of a large form is refused; with a cap sixteen times
  the constant, an oversized one is asked; with the limit counted before the session is
  known, *a limit per person* fails; with the response's close never heard, a client
  disconnect does not reach the port, and with every close read as one, a finished request
  is cancelled after its answer; with the text in the audit row, *never the text* fails.
  `compose.test.ts` failed on all three new variables until both compose files passed them,
  and `dockerfile.test.ts` failed on `builder-core` until the image copied it. `apps/admin`'s
  `server-model.test.tsx`: a pane drawn whatever the server says, a system part sent along, a
  request to a provider's host for a briefing formancy did not write, a stop not handed on,
  and the Translations tab given no ask each fail a case.

## Context

The builders ask a model through an `AskModel` the host supplies, and the model is the
host's ([0056](0056-agents-get-the-checks.md)). formancy.ai has no server to supply one and
may ask no other site for anything, so a visitor carries each turn by hand
([0154](0154-the-website-makes-no-request-to-any-other-site.md),
[0160](0160-a-person-carries-the-models-turn.md)). That stays.

A deployment had no model at all. The admin — a deployment's own builder host — mounted no
prompt pane, and its Translations tab no ask. An operator who wanted one had to write an
`AskModel`, and the shortest way to write one is a `fetch` to a provider from the browser,
with the key in the page: anybody who opens it can read the key, which the agents guide
already warned about. The guide's alternative — an endpoint of your own that adds the key —
was left for every operator to write, and the obvious one forwards `{ system, user }`: a
proxy that lends every editor's session the operator's paid model, under whatever
instructions the browser sends.

The operator should choose the provider: Claude from Anthropic, ChatGPT's models from
OpenAI, or Grok from xAI.

## Decision

**The server has the model, the browser has a request.** A port in
`@formancy/server-core`, `Completer`, completes one prompt — a system part and a user part —
with a `Cancellation` (a callback, as `AskTurn.onCancel` is, because that package has no
`AbortSignal` type, [0008](0008-layered-packages.md)), and resolves with the text or a typed
failure: `refused`, `truncated`, `unavailable` with the provider's status, or `cancelled`. It
is a port because three providers and the tests' doubles stand behind it.

**Two adapters, in `@formancy/server`.** Anthropic through `@anthropic-ai/sdk`: the briefing
as the system prompt and the request as the one user message, adaptive thinking, streamed,
read with `finalMessage()`, and **the stop reason read before the content** — `refusal` is a
refusal with Anthropic's explanation, `max_tokens` and `model_context_window_exceeded` are
`truncated`, never half a document, and thinking blocks are not part of the answer. OpenAI
and xAI through `openai`, the Responses API at each one's base URL — xAI's documentation says
its API is compatible with OpenAI's SDKs and their Responses API at `https://api.x.ai/v1` —
with `store: false`, streamed and read with `finalResponse()`, status first: incomplete at
the output limit is `truncated`, withheld by the filter or a refusal part is `refused`. Each
answer may be up to 64,000 tokens. Each base URL is named in the adapter, and the SDKs'
habit of reading a base URL, an organisation or a project from the environment is overridden.

**Configured by environment, and off unless set.** `FORMANCY_MODEL_PROVIDER` (`anthropic`,
`openai` or `xai`), `FORMANCY_MODEL_API_KEY` and `FORMANCY_MODEL`: all three, or none. A key
or a model without a provider, an unknown provider, or a provider without its key or model
stops the server at startup, as `fileStoreSettings` and `trustProxyFrom` do, because a server
that started anyway would have no model while the operator believed it had one. **No
provider has a default model**: see below.

**The server writes the briefing.** `@formancy/builder-core` names the requests formancy
makes — `MODEL_REQUEST_KINDS`, `authoring`, `translation` and `scenarios` — and
`modelBriefing(kind)` is the system part each is asked with, from the same functions the
runs use. `POST /model/complete` takes `{ kind, user }` and asks under `modelBriefing(kind)`;
a `system` in the body is never read, and an unknown kind is a 400 before anything is asked.
The browser finds the kind from the briefing its run handed it — `modelRequestKind(system)`
— so one `AskModel` serves every pane, and a briefing formancy did not write has no kind and
is refused in the browser, before anything leaves.

**The route** takes the permission editing a form takes (`form.publish`: an editor or an
admin, not a viewer; 401 and 403 as everywhere), a body cap of its own of 512 KiB, ten
requests a minute **per session** — the limit runs after the session is known — and answers
`{ text }`, `{ declined }` for a provider's refusal, or a 502 with a sentence: the key
refused, the provider limiting, the model refused, or unreachable. A response that closes
before it was written is a browser that went away, and the adapter is told to abandon the
call at the provider. Every request asked is audited as `model.asked`: who, the kind, the
provider and model, the length of the user part, how it ended, and the provider's status
when it failed — never the text. `GET /model` says which provider and model, to the same
permission, or 404.

**The admin asks it.** When `/model` names one, the build tab draws the prompt pane with
`askServerModel`, which sends the kind and the user part to the server, hands a `declined`
back as `declinedAnswer`, rejects with the server's sentence otherwise, and aborts when the
run is stopped. The Translations tab gets the same ask. Above each, one line says the request
goes through the server to that provider's model, with the form. The admin mounts no scenario
pane, so it does not ask for examples; the route serves that kind for a host that does. When
there is no model, nothing new is drawn.

`builder-core` on the server is an edge [0008](0008-layered-packages.md) allows: it points
from the server to an isomorphic package with no DOM and no Node types, as the edges to
`core` and `spec` do. It costs the image one more workspace package, which
`dockerfile.test.ts` now copies.

## Consequences

**What it buys.** A deployment can give its builders a model of the operator's choosing,
with the key on the server, through the same `AskModel` every pane already takes — the
loop, the checks, the stop and the review are unchanged ([0056](0056-agents-get-the-checks.md),
[0109](0109-an-ai-edit-is-reviewed-before-it-lands.md), [0157](0157-a-models-turn-can-be-stopped.md)).
What the key pays for is formancy's three requests under formancy's briefings; a refusal by
the provider ends the run as a decline in one turn ([0158](0158-a-model-may-decline.md)), and
a browser that goes away stops the provider writing.

**What it costs.** **The form leaves.** Each request sends the whole document (authoring),
its words and where each is used (translation), or its fields, labels, options, starting
answers, the names of its examples and what the author said it should do (scenarios) to the provider, under that provider's
terms. `store: false` asks OpenAI and xAI not to keep it for retrieval; what any provider
keeps otherwise is its own policy, and nothing here can see it. The admin says where a
request goes; it does not say it is private, because it is not.

**The endpoint is narrowed, not closed.** The briefing is pinned, the user part is not: it
is the person's instruction, and nothing stops somebody asking the model for something else
under formancy's briefing and reading the text that comes back. The permission, the limit,
the cap, the output limit and the audit row bound and record what that costs. They do not
prevent it. Ten requests a minute per session is counted per process, so N replicas allow N
times it, and an API key with an editor's role can spend it around the clock. There is no
spending cap; the provider's own is the backstop.

**No default model is a configuration step, on purpose.** A default would go stale when the
provider retires the model, and every turn would then end *could not be reached* after an
upgrade nobody made; and which model runs is what the operator pays for. `.env.example`
shows `claude-opus-5`, Anthropic's Opus as its model list named it on 2026-06-24. A model
that is wrong or retired is found at the first request, not at startup: probing at startup
would cost a request, and a provider's outage would stop the server.

**The adapters are not the providers.** No test here reaches Anthropic, OpenAI or xAI. The
adapters' tests drive the real SDKs over a fake transport, in the event shapes those SDKs
parse; a provider that changes its stream changes what they read. **xAI's compatibility is
xAI's claim**, read on 2026-10-10 through a web search's summary of its documentation — the
pages themselves refused the fetch — and not exercised here. Adaptive thinking needs a Claude
model that has it, Opus 4.6 or Sonnet 4.6 or later; an older one answers 400 to every turn.

**Two SDKs in the image whether or not a model is configured.** `@anthropic-ai/sdk` brings
`json-schema-to-ts` and `standardwebhooks`, and through them `@babel/runtime`, `ts-algebra`,
`@stablelib/base64` and `fast-sha256`; `openai` brings nothing. The SOUP declaration lists
both. They are loaded when the server starts.

**What the provider said is dropped.** The route words a failure by its status for the
person, and the provider's message would go to a request log the server does not have
(SAFETY-ANALYSIS C3). The audited status is what an operator has to go on.

**A browser and a server from different versions brief differently.** The model is briefed
as the server's `builder-core` briefs; the browser recognises the briefing its own version
writes. A mismatch refuses every request in the browser as one formancy does not make, which
is loud rather than wrong.

**The admin's line about where a request goes is English**, as the rest of the admin is; the
builders' own words stay in their catalogue. The prompt pane in the admin holds its own run,
so leaving the build tab stops it.

`MDR-CONTEXT.md` is unchanged: what the regulatory set claims to be has not moved.

## Alternatives considered

**The key in the browser**, an `AskModel` calling the provider directly. Lost to the page:
anybody who opens it reads the key.

**A general-purpose proxy** forwarding `{ system, user }`. Lost because every editor's
session would hold the operator's model under any instructions at all, and the server
could not say what its key pays for.

**The whole run on the server**, the browser sending only the instruction. Lost because the
run, the stop, the review and the relay all live in `builder-core` in the browser; a second
loop on the server is the same decision in two places ([0091](0091-a-second-builder-is-a-binding.md)),
and the instruction would still be free text.

**Compare the system part the browser sends with the briefings**, rather than send a kind.
The same check, made on the server after ten kilobytes of briefing have crossed the network
for every turn. Recognising the briefing in the browser refuses a foreign one before it
leaves, and the server never reads a system part at all.

**The briefings in `@formancy/spec`**, so the server needs no `builder-core`. The authoring
briefing is already there; the scenario briefing runs the engine's own example and path
syntax, which `spec`, at L0, cannot import.

**A default model per provider.** Lost to staleness and to cost, above.

**A base URL of the operator's choosing**, for an OpenAI-compatible server on their own
hardware, so that nothing about a form leaves their network. Deferred rather than rejected:
nothing here tests against one, and "where the form goes" would become a free-text URL that
the deployment view could no longer name. It deserves a record of its own.

**Chat Completions for OpenAI and xAI.** xAI's documentation calls it legacy, and the
Responses API carries `store: false`, a refusal as a typed part, and why a response is
incomplete.

**Anthropic's server-side refusal fallbacks**, which re-run a refused request on another
model. Lost because the operator chose one model, and a request answered by another is not
what they configured; a refusal ends as a decline with Anthropic's explanation.

**A vendor-neutral library** between the server and the providers. Lost because it is a
third party between the operator and the provider, maintained elsewhere, when the port is
the abstraction and each adapter is one short file over the provider's own SDK.

**A limit per address.** Lost because an office behind one address would share one budget
and one editor could spend another's; the session is the identity a management route has.

**A spending cap in the server.** Deferred: it needs token accounting per provider and a
place to keep it. The audit log says who asked and how often, and the provider's own limit
is the backstop.
