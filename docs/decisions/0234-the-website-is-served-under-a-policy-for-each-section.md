# 0234 — The website is served under a content security policy for each of its sections, which the build writes and the browser gate serves it under, failing on anything they refuse

- **Status:** accepted
- **Date:** 2026-11-05
- **Extends:** [0154](0154-the-website-makes-no-request-to-any-other-site.md), whose playground
  policy covered pictures and connections and deferred the rest; [0102](0102-what-jsdom-cannot-see-is-checked-in-a-browser.md),
  the browser gate this adds a module to
- **Deciders:** Daniel Bacher
- **Verified by:** each case watched failing first on 5 November 2026, its fault planted once and
  the file put back:
  - **`apps/docs/src/site-headers.test.ts`**, in CI's test job. Every section admits files of
    this origin by path, and never `'self'`, `'unsafe-eval'`, `*` or a scheme but `data:` and
    `blob:`. An inline style is admitted only in the starter's and the playground's `style-src`
    and the documentation's `style-src-attr`, and an inline script only by its hash. Every
    section refuses forms, bases, objects, manifests and whatever no directive names. Each
    refuses every connection but the documentation's to its search index, and every frame but
    the starter's, by this site. Trusted Types are required on the site's pages and the
    starter. The deploy's headers and the gate's differ in the origin and the report address
    alone. An address that is not an origin is refused. Paths match as Cloudflare matches them,
    and a header two rules set is joined, as it joins it. `_headers` refuses what Cloudflare
    would read otherwise. The built pages' inline scripts and styles are hashed per section,
    data blocks and external files not, and a page no section serves is refused. Failed with
    `'self'` in the playground's scripts, `https:` in the site's pictures, `'unsafe-inline'` in
    the site's scripts, the site connecting to itself, no `form-action`, the starter without
    Trusted Types, the playground framable, a later rule replacing a header, a splat needing a
    character, JSON-LD hashed, a page outside every section accepted, and the origin unchecked.
  - **`scripts/policy-browser-test.mjs`**, in `pnpm test:browser`. It checks the `_headers` the
    build wrote, opens every page the site holds, searches the documentation, and fails on any
    refusal the browser reports from any page the gate opens, but for the two the request gate
    provokes, which it must hear. It fails on any inline style the playground's report-only
    policy hears from anything but Monaco's files. Failed with the legal pages' styles not
    hashed, the documentation's scripts not hashed, no `'wasm-unsafe-eval'` (the search found
    nothing too), the site's scripts admitted from another directory, the starter's frame
    refused, and the second policy not served. With the Angular signature's static `style` and
    TipTap's stylesheet put back and the site rebuilt, it named both, from the playground's own
    bundle. The request gate's probe of the playground now counts only what the page's own
    `meta` policy refuses, since the header refuses both probes too: with the `meta` taken out
    of the built page, it failed.
  - **`packages/tiptap/src/rich-text-editor.test.ts`** and **`packages/angular/src/new-types.test.ts`**:
    the editor writes no `<style>` and keeps its surface's white space through the CSSOM, and
    the Angular signature surface's `touch-action` is not written as an attribute. Each failed
    on the code before it.

## Context

formancy.ai was served with no content security policy. Its playground set one for itself in
a `meta` element, for pictures and connections only, because a document pasted into it may
name any host ([0154](0154-the-website-makes-no-request-to-any-other-site.md)); the rest was
deferred, since "a full policy collides with the inline styles the renderers and Monaco set".
The demonstrations of Formancy Data, Report and Health are each served under one, from
their own repositories, so the site that links to them was the one page of formancy.ai without.

And the safety analysis says formancy runs under a strict policy with no configuration, `style-src` included
(C4), while saying in its residual that no browser here had been served one and watched. A
policy names what a page needs, so it was measured before it was written. On 5 November 2026
the browser gate ran under one strict policy in report-only mode, every report collected by
its server, and every page the site holds was opened under it. The site's pages, the landing
page, the templates, the Angular page and the legal notices, needed nothing but their own
files and the two notices' `<style>`. Then each other section:

- **The starter.** Angular Material writes each component's styles into a `<style>` as it
  first renders, and the build carries some of Roboto's faces as `data:` addresses.
- **The playground.** Monaco writes `<style>` elements and style attributes as it draws. It
  loads its codicon face as a `data:` address, and starts its workers from `blob:` addresses.
  Its loader and `@monaco-editor/loader` hand script addresses to their sinks as strings.
- **The documentation.** Starlight carries nine inline scripts across its pages, and its code
  blocks carry style attributes. Its search, Pagefind, compiles WebAssembly in a worker, and
  hands the worker's address and its results' markup to their sinks as strings.

And two things in the product broke C4, both in the playground's own bundle:

- **The Angular signature surface.** Its `style="touch-action: none"` was written in the
  template, which Angular sets as an attribute, so a policy with no `'unsafe-inline'` refuses
  it. The surface is then `touch-action: auto`, and only the fallback 0101 kept, which cancels
  each touch from a listener, stops the page panning.
- **`@formancy/tiptap`.** TipTap's default writes ProseMirror's base rules into a `<style>`
  through `innerHTML`, which such a policy refuses, and Trusted Types refuse before it. The
  surface then collapses runs of spaces as they are typed.

## Decision

**One function states the headers, as the demonstrations' do.** `scripts/site-headers.mjs`
gives the rules of `_headers` for the site at an origin. `pnpm build:web` writes them for
https://formancy.ai at the root of the composed site, where Cloudflare's static assets read
them. `pnpm test:browser` serves the composed site under the rules for its own origin, with
`report-uri` to its own server added.

**Each section is served under its own policy**, since each is its own build and needs
different things of it. The four are the site's pages, the starter at
`/angular-form-builder/demo/`, the playground and the documentation. Each admits files from its
own directories by path, never `'self'`, and refuses every form, base, object, manifest, frame
and connection, but for the documentation's search index and the starter framed by the site.
Beyond that, each admits exactly what was measured:

- **The site's pages:** the two notices' styles, by hash. Trusted Types are required, with no
  policy allowed.
- **The starter:** `'unsafe-inline'` for styles and `data:` faces. Trusted Types are required.
- **The playground:** `'unsafe-inline'` for styles, `data:` faces, `blob:` workers, and
  `data:` and `blob:` pictures as before.
- **The documentation:** its inline scripts by hash, `'wasm-unsafe-eval'`, and
  `'unsafe-inline'` for style attributes alone.

No page matches two rules that set a policy, since Cloudflare joins a header two rules set, and
`inlineOf` fails the build on a page no section serves. Every response carries `nosniff`, no
referrer, no camera, microphone or location, and Cloudflare's own cache control with
`no-transform`, so that Cloudflare rewrites nothing.

**The product writes no inline style.** The signature surface binds `touch-action`, which
Angular writes through the CSSOM, as `@formancy/angular` already does its host's display
([0079](0079-a-host-is-undone-without-a-stylesheet.md)). The TipTap editor is made with
`injectCSS: false` and sets the white space ProseMirror needs on its surface, through the
CSSOM, when it mounts.

**The gate fails on a refusal.** It hears the reports of every page any module opens, frames
and workers included. It opens each page of the site once, and searches the documentation.
It fails on any refusal but the request gate's two probes, and unless it hears both.
Since the playground's own policy admits inline styles, the gate serves it a second,
report-only policy with no inline style. Every report that one sends must come from Monaco's
files.

## Consequences

**What it buys.**

- **The browser refuses what the site was only checked not to do.** A request to another
  host, a script from anywhere but the section's own directory, a form posted, a page framed:
  each is now refused, not just checked for. The playground's protection against a pasted
  document now covers styles, workers, scripts and frames as well as pictures and
  connections. A script Cloudflare injects from `/cdn-cgi/` of the same origin is refused,
  since the policies name directories.
- **C4 is observed, not only reasoned.** Both renderers and both builders run in a real
  browser under a policy with no inline style and no `'unsafe-eval'`, and the gate watches.
  It found two defects on the first run.

**What it costs.**

- **Inline styles where measured.** The starter's styles and the playground's are admitted
  inline, for Material and for Monaco: a style an injection writes there is not refused. The
  documentation's style attributes are admitted too, since one hash for each of more than
  forty distinct attributes, with `'unsafe-hashes'`, is more than a header line holds.
- **No Trusted Types on two sections.** The playground and the documentation do not require
  them: Monaco's loader and Pagefind hand strings to their sinks.
- **What the measurement missed is refused.** It covered the pages the gate opens, in the
  states it drives them to, and every page opened once; a state nobody reached is refused
  only when somebody reaches it. A Starlight upgrade changes its inline scripts' hashes,
  which the build recomputes. A section that loads a file from a new directory is refused
  until the policy names it, and the gate says so.
- **The policies name the origin.** A copy served at another address, a `workers.dev`
  preview among them, loads none of its files.
- **Some refusals go unheard.** Monaco's and Pagefind's workers are served under their
  section's policy, and a refusal inside one is posted like any other. One in a frame the
  gate never opens is not. Chromium alone runs the gate.
- **Nothing reads the live headers.** That needs the network, which CI's gates do not have,
  so a Cloudflare setting that drops one goes unnoticed until somebody reads a response
  (0060).
- **A theme cannot restyle the editor's white space.** It is set as an inline style, which
  outranks a stylesheet. Before, the injected rules had the lowest specificity there is.

**What it does not do.** It says nothing of a host's page: the renderers ship no policy, and a
form on another site is held to whatever that site sets (C4's and C6's residuals). It does not
apply to `/data/`, `/report/` or `/health/`, which are served by their own Workers under their
repositories' own headers. It sets no `Strict-Transport-Security`: that is Cloudflare's setting
for the zone, not a file's.

## Alternatives considered

**One policy for the whole site.** Rejected: it would be the union of the four. Every page
would take Monaco's inline styles and lose Trusted Types for Pagefind's sake, though none of
the site's own pages needs either.

**`'self'` for scripts and styles.** Rejected, as formancy.ai-report 0051 rejected it: it
admits whatever the origin serves, Cloudflare's injected scripts from `/cdn-cgi/` among them,
one of which formancy.ai-health measured sending what was typed to the origin.

**Astro's own policy, `security.csp`.** Not taken: it writes a `meta` policy per page, which
cannot say `frame-ancestors`, and it does not support Shiki's style attributes, which the
documentation's code blocks are drawn with.

**Hashes for the documentation's style attributes, under `'unsafe-hashes'`.** Rejected: more
than forty distinct values, measured, and over Cloudflare's line limit.

**Trusted Types on the playground,** through a default policy for Monaco's loader and a list
of the ten policies Monaco names. Not taken: the list is Monaco's internals, changing with
its version, and refusing one stops the editor where the gate may not look. Worth revisiting
with a bundled Monaco.

**A constructed stylesheet for TipTap's rules**, which no policy governs either and which a
theme could still outrank. Not taken: the renderers carry no stylesheet of any kind (C4), and
a document-level sheet does not reach an editor inside a shadow root.

**Dropping the playground's `meta` policy now that a header covers it.** Not taken: it is
what holds a copy of the playground served elsewhere, the header being formancy.ai's alone.
