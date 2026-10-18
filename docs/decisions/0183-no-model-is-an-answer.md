# 0183 — A deployment with no model says so in a 200, not a 404

- **Status:** accepted
- **Date:** 2026-10-18
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/server/src/model-route.test.ts`, *is said when this deployment has
  none*: `GET /model` on a server with no model answers `200` with
  `{ "provider": null, "model": null }`. With the `404` it gave before, it fails
  `expected 404 to be 200`. `apps/admin`'s `server-model.test.tsx`: a `fetchModel` that took any
  answer naming both members as a model fails *is none for the server's answer that it has none*,
  and *the prompt pane is not drawn when the server has no model* with it, since the pane is then
  drawn; one that threw on a status that is not ok fails *is none for a server before 0183*.
  Nothing in the repository watches the admin's console (see below).

## Context

[0165](0165-a-deployments-model-is-asked-through-its-server.md) gave the server a model for the
builders, off unless the operator sets three variables, and `GET /model` to say which provider
and model to somebody who may edit a form, "or 404". The admin asks it on every sign-in, to know
whether to draw the prompt pane.

Off is how a deployment ships, so the 404 was the answer most sign-ins got. A browser prints a
4xx it fetched as a failed request, whatever the page does with it. Measured on 2026-10-18 with
postgres from `compose.yaml`, the server from its build and the admin from Vite, signing in as the
bootstrap admin in Playwright's Chromium: one `console.error`, *Failed to load resource: the
server responded with a status of 404 (Not Found)*, for `GET /api/model`, on every sign-in. The
admin read it correctly as "no model". Somebody running the stack reported it as a defect, which
is what it looks like: a console that shows a failure on every sign-in, for a deployment set up
exactly as documented, teaches whoever reads it to step over failures, and it is the first place
anybody looks when something does fail.

Nothing was missing. The route exists and the deployment exists; asked which model it has, the
truthful answer is none.

## Decision

**None is an answer.** `GET /model` answers `200` with `{ "provider": null, "model": null }` when
the deployment has no model, and `{ "provider": …, "model": … }` as before when it has one: the
same two members either way, null rather than absent, so a host reads one shape and cannot mistake
the answer for one from a server that names neither. Who may ask is unchanged: `form.publish`,
and `401` and `403` as everywhere.

**Asking a model that is not there stays an error.** `POST /model/complete` on a server with no
model answers `404` `model_not_configured` as before. That request is one nothing can serve, and
the admin never sends it once `/model` has said none.

**The admin did not change.** Its reading of `/model`, written in 0165 for a server older than the
route, takes an answer that does not name a provider and a model as none, so it already reads the
new answer correctly, and it still reads a `404` as none — what a server from before this record
says. The admin and the server are built apart, so an admin newer than the server its `/api`
reaches is an ordinary case.

## Consequences

**What it buys.** A sign-in to a deployment as shipped makes no failed request: measured the same
way after the change, the console has nothing in red. A failure in it is a failure again.

**What it costs.** **A documented response changed.** A page of a host's own that read the `404`
as "none" and any `200` as a model now reads a model whose provider is `null`, and draws a pane
whose every turn the server refuses. It is called breaking in the changelog and spelt out in
`MIGRATIONS.md`. The admin of every release that has the route reads the new answer as none, so
it is not affected. A host that reads the new answer also has to read the old `404` as none while
it may meet a `0.5.0` server, as the admin does.

**A viewer's sign-in still logs one.** `GET /model` refuses a viewer with a `403`, as 0165 has it,
and the admin does not know the role of whoever signed in, so it asks anyway. That one is a real
refusal, and it stays; telling a viewer "none" would be untrue, and a route saying who is signed
in is a change of its own.

**The status no longer says whether there is a model.** Anything that told the two apart by status
— a probe, a script — has to read the body.

**Nothing watches the admin's console.** The browser gate loads the landing page, the playground
and the docs, not the admin against a server, and the console here was read once by hand, as
above. What holds this record is the route's test of its answer; a route that answered a feature
being off with a 4xx again would be caught only if it were this one.

## Alternatives considered

**`204 No Content`.** Also a success with no failure in the console, but a host that reads every
2xx as JSON throws on the empty body, and "no content" says there is nothing to say rather than
that there is no model.

**`{}`, both members absent.** The shape of an answer that is not about a model at all — what the
admin's check was written to survive from a server that answers `/model` some other way. Null says
the server knows, and there is none.

**A third member, `configured`.** Two ways of saying one thing, which can disagree; a provider of
`null` already says it.

**Keep the `404`, and have the admin not ask.** It cannot know without asking, and putting the
answer into the sign-in's response would make another route's contract carry one pane's question.

**Keep the `404`, and accept the line in the console.** Lost for the reason in the context: it was
reported as a defect by the person reading that console, and it would be reported again.

**A `200` for `POST /model/complete` with no model, too.** Lost: there, nothing can be answered,
and a success that carries no answer is what a refusal is for.
