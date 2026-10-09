# 0136 — The Angular page runs the starter, and dates what it says about others

- **Status:** accepted; its comparison with SurveyJS reversed by
  [0141](0141-the-angular-page-compares-with-no-other-product.md)
- **Date:** 2026-10-09
- **Deciders:** Daniel Bacher
- **Verified by:** `pnpm test:browser` (`scripts/angular-page-browser-test.mjs`) — at 390 and
  1440 pixels the page cannot be scrolled sideways and the frame on it shows the starter's
  heading and its builder's tree; with the starter's assets removed from the composed site,
  both cases fail. `pnpm build:web` — refuses an app whose `index.html` asks for an absolute
  URL outside where it is served, or loads no script; the starter built with base `/` is
  refused. `apps/docs/src/site-snippets.test.ts` — the install command names only published
  packages, and the snippet imports only names those packages export, read by the compiler; a
  missing package, a package marked private, a misspelt export and an import the command
  does not install each fail it. `apps/site/src/angular-builder-page.test.tsx` — the versions
  are `compatibility.json`'s, and the SurveyJS comparison carries its date and links three of
  SurveyJS's own pages. `apps/angular-starter/src/app/app.test.ts` — the starter saves, opens
  on what it saved, reloads it, and does not open a saved document that is no longer valid.

## Context

The backlog asked for a page somebody searching for an Angular form builder lands on: a working
demo, the install, the supported versions, an example that saves and reloads a form — and a
factual comparison with SurveyJS, whose Angular builder is what that search finds first.

Two things make such a page go wrong quietly. A demo built for the page is a second application
nobody maintains, and drifts from what the packages do. And everything on a marketing page is a
claim: an install command, a snippet, a version, a sentence about a competitor's licence — each
stays on the page after it stops being true.

## Decision

**The demo is the Angular starter itself.** `build-web.mjs` builds `apps/angular-starter` and
serves it at `/angular-form-builder/demo/`; the page embeds it in a frame. What a visitor edits
there is what somebody who clones the starter gets. The starter is built with a relative base
so it can be served from any path, which a copy of it needs too.

**The starter gained saving.** `saved-form.ts` keeps the form being built in the browser's
storage, the app opens on it, and **Reload saved** puts it back as one edit. It is the one file
a host changes to keep forms on a server, and the page shows it verbatim — imported as text,
so the code on the page is the code the demo runs.

**What can be derived is.** The versions are read from `compatibility.json`, the file CI reads
as its matrix. The two snippets written by hand are checked against the packages they name.

**What cannot be checked is dated.** The SurveyJS comparison is prose, part by part — renderer,
visual builder, backend, PDF and dashboards — and says which day it was read from SurveyJS's
licensing page, Survey Creator documentation and architecture page, and links them. It says
what SurveyJS has that formancy does not as plainly as the reverse.

## Consequences

**The demo costs a build.** `build:web` now builds a third application, and the site's deploy
carries the starter's bundle, Material included.

**A starter change is a page change.** Somebody reworking the starter is reworking the demo
on the landing site. That is the point, and it means the starter cannot become a test bed.

**The browser gate is the only thing that sees the demo.** jsdom never loads a frame; a blank
one would pass every other gate.

**The comparison will be wrong one day, and nothing will say so.** A licence is its vendor's to
change. The date is what keeps the page honest, and re-reading it is a person's job; a test
that fetched SurveyJS's pages would answer differently in CI than locally and fail for reasons
that are not ours.

**The footer was found typed.** Adding the page's chrome found "Spec version 2" in the shared
footer, two spec versions late. It is derived now.

## Alternatives considered

**A purpose-built demo for the page.** Smaller and prettier, and a second Angular application
that only the page uses — the shape that drifts.

**Rendering the builder into the page directly.** The site is React; mounting Angular inside it
is what the playground does, and it would put the Angular toolchain into the site's build for one
page. The frame keeps the two builds apart and shows the starter exactly as it ships.

**Leave SurveyJS unnamed.** The search the page answers names it. A comparison that avoids the
name is one the reader makes anyway, with less care.

**Check the comparison with a test.** It would need the network, which CI's checkout and a
vendor's rate limits make an unreliable gate — prose with a date is the honest form.
