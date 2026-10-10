# 0154 — The website makes no request to any other site, and a browser gate says so

- **Status:** accepted
- **Date:** 2026-10-09
- **Extends:** [0142](0142-the-angular-starter-is-dressed-in-materials-tokens.md), which had the
  starter load Roboto itself for this reason and left the rest of the site as it was;
  [0102](0102-what-jsdom-cannot-see-is-checked-in-a-browser.md), the browser gate this adds a
  module to
- **Deciders:** Daniel Bacher
- **Verified by:** `scripts/request-browser-test.mjs`, run by `pnpm test:browser` — the landing
  page, the templates, the Angular page with its frame, the playground and one page of the
  documentation, each opened with every request routed through the gate, and any addressed to
  another origin aborted and named; a `preconnect` or `dns-prefetch` hint to another host,
  read from every frame, counts as one. Committed before the fix and watched failing on `main`:
  `fonts.googleapis.com` on every page of the site, `fonts.gstatic.com` as a hint on each (the
  stylesheet that would have asked it was itself refused), and `cdn.jsdelivr.net` on the
  playground. The same module asks whether each page's heading and body are drawn in a face
  the document loaded and whether the playground's schema editor is Monaco — both failed on
  `main` with the loads refused, so a page that simply dropped its fonts or its editor cannot
  pass. And whether the playground's policy refuses a picture and a connection on another host
  before they are made, watched failing with the policy taken out of the built page: both
  reached the network. `apps/playground/src/main.test.tsx` — the page as `main.tsx` starts it
  renders, and Monaco's loader asks this site for its script: watched failing with the loader
  left at its default (`cdn.jsdelivr.net/npm/monaco-editor@0.55.1`), and, before `app.tsx`
  changed, with the whole page down.

## Context

The rule is that formancy.ai makes no request to any other site, so opening a page tells
nobody but formancy.ai who opened it. It did not hold, in two ways:

- **Every page loaded its type from Google Fonts.** All four Vite entries — the landing
  page, the templates, the Angular page and the playground — linked a Google Fonts stylesheet,
  with `preconnect` hints to both of its hosts. [0142](0142-the-angular-starter-is-dressed-in-materials-tokens.md)
  had already rejected exactly that for the Angular starter, because every page built from it
  would send its visitors' addresses to a third party; the site around the starter went on
  doing it.
- **The playground loaded its editor from jsDelivr.** `@monaco-editor/react` loads Monaco at
  runtime, by script tag, from wherever its loader's `paths.vs` points, and nothing called
  `loader.config`, so it pointed at its default: `monaco-editor@0.55.1` on `cdn.jsdelivr.net`.
  The playground was compiled against the types of 0.56.0, installed as a peer — so the
  version it was typed against was not the version it ran.

Nothing could say so. jsdom makes no request, and no gate that does was looking. A font
request that fails is a page that still renders, in a fallback face, which is why the
`Inter` the templates page once named went unnoticed until somebody looked at it
([0106](0106-one-shell-for-every-page-of-the-site.md)).

The playground is also the one page of the site that renders documents somebody else wrote: a
visitor pastes one in, or a model writes one, and an option's picture may name any `https`
host ([0126](0126-an-option-may-carry-a-picture.md)). Whatever the site does about its own
requests, such a document can make one on its behalf — the hazard C6 in the safety analysis
describes for every form.

## Decision

**The faces come from Fontsource's packages**, the way the starter's Roboto does: imported by
`apps/site/src/shell.css`, which every page of the site imports, and by the playground's
`app.css`. The weights and axes are the ones the Google request named. Archivo is the variable
face with its width axis — read out of the font file's variation table before anything else
was decided: `wdth` 62 to 125 and `wght` 100 to 900, which covers the 75 to 125 the pages asked
for, so the axis stays. Fraunces is the variable face with its optical size, 9 to 144, upright
and italic. IBM Plex Sans in 400, 500 and 600, Plex Mono in 400 and 500, and in the playground
Space Grotesk in 400, 500 and 600, which Dusk and Pop ask for.

Fontsource names a variable face `<Family> Variable`, so the site's and the playground's
stacks ask for `Archivo Variable` and `Fraunces Variable`, and the Pop and Paper themes name
that spelling after the plain one, so either way of loading the face reaches it.

**Monaco comes from the playground's own origin.** `main.tsx` calls
`loader.config({ paths: { vs } })` with `vs` under the app's base, and a Vite plugin copies the
installed `monaco-editor`'s AMD build, `min/vs`, whole into the build — with the package's
licence and third-party notices beside it, since the copy is now ours to distribute — and
serves the same directory in development. `monaco-editor` is now a direct dependency of the playground at
`^0.56.0`, the version it was already typed against.

**A browser gate records every request.** A module of `pnpm test:browser` opens each page with
every request routed through it and **aborts** anything addressed to another origin, naming
it, rather than letting it through and recording it — so the answer is the same on a machine
with no network, in CI and behind a proxy. It routes on the browser context, so a frame's
requests are seen, and it checks that it saw the embedded starter's own requests, because a
recorder that silently missed a frame would report a clean page.

**The playground holds what a document asks for to itself.** A content security policy in its
`index.html`: `img-src 'self' data: blob:; connect-src 'self'`. A picture on another host shows
as a broken picture rather than telling that host who opened the document. A `data:` or `blob:`
address carries or names bytes the page already holds, so allowing them tells nobody anything;
the starter's own pictures are `data:` addresses.

## Consequences

**Opening formancy.ai tells no other site who opened it**, for the pages the gate opens — one
of each kind the site serves — in the states it drives them to. The Angular starter's own claim — that it makes no third-party
request — is now checked too, as it runs inside the Angular page.

**The Monaco copy is 24,480,458 bytes in 153 files of the composed site**, its licence and
notices included, measured on 2026-10-09 with `monaco-editor` 0.56.0 — re-measured with the
next version, not incremented.
A visitor opening the playground fetches 24 of them, 5,236,069 bytes, measured the same day in
Chromium against a static server like the gate's, which compresses nothing; before, the
equivalent files of 0.55.1 came from jsDelivr. Most of the copy is never asked for: the
language workers for TypeScript, CSS and HTML — the TypeScript one twice over, 13,778,599 bytes
between its two copies — for an editor that edits JSON. That is the price of copying the build
whole rather than a list of its modules.

**The faces are 1,208,848 bytes in 65 files of the site's build, and 1,416,908 in 83 of the
playground's** — every subset of every weight, in WOFF2 and, for the static faces, WOFF too. A
browser fetches only the subsets the page's text uses. Measured on 2026-10-09: 190,724 bytes in
six files for the landing page and the playground, 272,244 in seven for the templates, and
349,436 in eleven for the Angular page, the starter's Roboto included.

**Pop and Paper name a second family.** A page loading Archivo or Fraunces from a font service
gets the plain name, as before; one using Fontsource's variable packages now gets the face
instead of the fallback. The cost is a longer stack in two published stylesheets.

**`useMonaco`'s first answer is `undefined` once the loader is configured**, though its type
says `null`: `loader.config` stores the instance it was given, and given only `paths` it stores
`undefined`. `app.tsx` checked against `null`, read `languages` off `undefined`, and the first
build of this change was a blank playground that every mocked suite passed. It checks
truthiness now, and `main.test.tsx` runs the real loader and hook under the real `main.tsx`.

**What the gate does not see.** A request made only after an interaction it does not perform —
a template's preview, a theme switched, a document typed into the editor. Pages it does not
open: one page of the documentation stands for all of them, which share Starlight's head and
not each other's content. Requests from Monaco's workers did reach its route when checked by
hand on 2026-10-09 — the worker scripts they import were among what it saw — and nothing
asserts that this stays so. A connection with no request and no hint in the document is
invisible to it.

**The playground's policy is narrow on purpose.** Pictures and connections only: no
`script-src`, no `style-src`, no `font-src`. A full policy collides with the inline styles the
renderers and Monaco set and is separate work. A `meta` policy also cannot do what a header
can — `frame-ancestors`, reporting. And it is the playground's: the renderers ship none, so a
host's page is held to whatever policy the host sets, which is C6's residual unchanged.

**The admin still loads Google Fonts.** It is not part of formancy.ai and the gate does not
open it; it is what a deployment runs for its operators, and moving its faces is the same
change made again. Recorded in the risks and debt rather than claimed here.

> *Later, 2026-10-10 — a note, not a change to this decision.* The admin follows: its faces
> come from Fontsource and Monaco from its own origin, through the plugin the playground used,
> now one module both apps import (`monaco-from-this-site.ts`). It also loaded Monaco from
> jsDelivr, which this record did not notice. `apps/admin/src/no-other-host.test.tsx` holds
> both; the request gate still does not open the admin.

## Alternatives considered

**Bundle Monaco's ES modules through Vite**, with `loader.config({ monaco })` and its workers
imported as workers. Smaller — only what is imported ships, hashed and cached with the rest of
the app. Not taken: it moves Monaco into the playground's own build, so every build compiles
it and the worker wiring is ours to keep right, where the AMD build is what the loader was
written to load and the change is one path. Worth revisiting if the size of the copy starts
to matter to a host.

**Copy only the files the JSON editor needs.** Rejected: the list would be a second copy of
Monaco's module graph that nothing checks, and a module missing from it is an editor stuck at
"Loading…" in whichever language nobody tried. The gate would catch it for JSON only.

**Let the gate's requests through and record them.** Rejected: what a page asks for next
depends on what answered — `fonts.gstatic.com` is asked only once `fonts.googleapis.com` has
sent a stylesheet naming it — so the list the gate failed with would depend on the runner's
network, and every run would itself tell the third party about the runner. Aborted, the
first foreign request is named everywhere, and the hint check names the hosts it would have
led to.

**Look for other hosts in the built files instead.** Rejected: Monaco's build alone carries
hundreds of documentation addresses it never requests, and the loader's default address was a
string in JavaScript. A request is a fact about a running page. The hint check is the one part
read from the document, and it reads the live DOM rather than the files.

**Write the `@font-face` rules by hand under the plain family names**, pointing at Fontsource's
files, so no stack changes. Rejected: it copies Fontsource's unicode ranges into this
repository's CSS, where nothing checks them against the files they describe.

**A full content security policy on the playground.** Deferred, as above: it needs the inline
styles moved or hashed first, and that is a change to the renderers, not to a page.
