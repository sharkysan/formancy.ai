# 0082 — The draft flow is demonstrated in the admin

- **Status:** accepted
- **Date:** 2026-09-29
- **Deciders:** Daniel Bacher
- **Verified by:** `apps/admin/src/fill-pane.test.tsx` — seven cases, one per thing the
  documentation asks a host to get right: the debounce (*'saves once after the typing
  stops, not once per keystroke'*), the token in a header rather than a URL, the resume,
  the migration notice, and the read-only path that stops saving. Reachability is separate
  and deliberate: `workspace.test.tsx`, *'fill in opens the published form, so the draft
  flow is reachable'*, observed failing with the tab removed from the titlebar —
  `Unable to find role="button" and name "fill in"`.

## Context

Drafts were finished and unproven. The server had the three public routes, a draft
carried its own token ([0062](0062-a-draft-carries-its-own-key.md)), the migration model
was tested ([0027](0027-lazy-draft-migration.md)), and both renderers shipped a notice for
a resume that lost answers. The roadmap said what was missing in as many words: *"the
debounce, the stored token and the read-only path are described and not demonstrated"*.

That is this repository's own named failure mode. `CLAUDE.md` puts it plainly — prose that
says a feature exists and a build where nobody can see it working are two different claims,
and the second is the one an evaluator checks. It has shipped here once already.

Nothing in the repository filled in a form against a server. The playground is client-only
by design, the marketing site must not depend on a backend, and the admin was the authoring
tool.

## Decision

**The admin gains a *fill in* tab**, which opens the published form against the server and
keeps a draft behind it: `apps/admin/src/fill-pane.tsx`.

It does the three things the documentation asks of a host, and each is the documented
answer rather than a convenient one:

- **Saves two seconds after the typing stops.** The obvious implementation writes a
  database row per keystroke. The draft routes are rate-limited on the same terms as
  submissions, so an undebounced save does not cost money quietly — it starts answering
  429 while somebody is typing hardest.
- **Keeps the token the server minted, and sends it in a header.** In `localStorage`, one
  key per form, read through a `try` because a private window throws. A token in a URL
  lands in logs, in a `Referer` and in a browser history.
- **Shows the resume notice, and refuses to save a read-only draft.** A draft that came
  back against its own version is shown as it was left; saving it would overwrite the
  answers on screen with ones the server could not rebind. "Start over" forgets the token,
  which is the other half the documentation says only the host can supply.

**The public routes are called as a respondent's browser calls them** — plain `fetch`,
no session — rather than through the admin's authenticated helper. A demonstration that
quietly used the management plane would be demonstrating something else.

## Consequences

**The flow can be seen rather than read about**, which was the whole point, and the tab
earns its place beyond the demonstration: seeing what a respondent sees is a thing a form
author wants.

**It is not the anonymous path end to end, and says so.** The admin is signed in, so a
submission from here skips the proof-of-work challenge an anonymous one must solve. The
draft routes take no identity at all, so those are exactly the public ones — but the
sentence "the draft flow is demonstrated" would be doing more work than it can carry
without this caveat, and it is now in the roadmap and in the drafts page as well as here.

**A second surface can now drift from the documentation.** `drafts.md` and this pane say
the same things in two places, and the tests hold the pane rather than the prose. The page
now points at the file, which is the cheapest available link between them and not a guard.

**`localStorage` is the wrong place for a token in a shared browser.** It survives the tab
closing, which is the point, and it is readable by anything running on that origin. For
the admin — one operator, their own machine — that is the right trade. A public host with
a different threat model should keep the token in memory and accept losing the draft when
the tab closes, and the drafts page does not yet say so.

## Alternatives considered

**A new app**, `apps/respondent`, that serves the public form-filling surface. The honest
demonstration of the anonymous path, including the challenge, and it is a whole
application: routing, a form-not-found page, its own build and its own place in
`build:web`. Rejected as more than the roadmap item asks for, and named here because it is
the right answer if the anonymous path ever needs demonstrating rather than testing.

**The playground.** It already renders a form and people already open it. Rejected because
it is deliberately backend-free: making it talk to a server means it either needs one
running or degrades to a broken tab on the public site.

**Serving a form-filling page from the server itself**, at `/f/:path` with an `Accept:
text/html` branch. Tempting, and the reason against it is [0008](0008-layered-packages.md):
the server would then ship HTML, CSS and a renderer bundle, which is a product decision
about appearance being made in the package that must not own one.
