# 0178 — The admin's palette is published, and the admin imports it like anybody else

- **Status:** accepted
- **Date:** 2026-10-16
- **Deciders:** Daniel Bacher
- **Verified by:** `apps/docs/src/room.test.ts` — `packages/themes/room.css` is one `:root`
  rule of custom properties and its colour scheme, with no at-rule; every name in it has the
  value the test pins (*holds every value it publishes*), so no value moves and no name comes
  or goes without the pin moving too, and the failure says the move owes a line in the
  changelog, which no test reads; it sets every colour `workbench.css` declares and no
  `--wb-*` the workbench lacks; no stylesheet of the admin sets one of its names; every app
  that imports it and the workbench imports it second; and the themes README names every
  variable it declares and no other. `apps/docs/src/themes.test.ts` (*what the package
  publishes*) fails for a stylesheet in the package that `exports` or `files` leaves out,
  `publint` under `pnpm check:pkg` for an export the tarball does not carry, and
  `pnpm test:e2e:install` bundles `scripts/install-fixture/bundled.tsx`, which imports it
  from the packed tarball. Each was watched failing: an element rule, an `@import`, `--muted`
  moved, `--wb-caution` dropped, a `--wb-*` the workbench does not declare, the admin's
  imports swapped, the admin setting `--muted`, `--warn` left out of the README, and
  `room.css` left off `files`.

## Context

The admin is drawn in a room: a dark ground, glass panels, violet for what the person acts
on and teal for what the server did, with the workbench's `--wb-*` pointed at them
([0143](0143-the-workbench-dresses-every-part-a-builder-draws.md)). The values were the
`:root` block of `apps/admin/src/admin.css`, and an application's stylesheet is in no
package.

Two source-available repositories built on formancy wear the same room. Formancy Report's
Studio, and Formancy Data's examples page, studio and host page, each copied the block by
hand under a comment naming admin.css, and each repository wrote a test holding its copies
to one another, and Report's to a pin of admin.css's values as read at one commit as
well. Neither test can read admin.css: CI there has no checkout of this repository
and no network. So the copies agreed with formancy as of the day somebody last looked, and
a colour moved here — a grey lightened for a contrast finding — would have moved nothing
there, and said nothing. The maintainer's word on it was not to copy the palette but to take
it from formancy.

## Decision

**The palette is `@formancy/themes/room.css`**: the custom properties the admin declared on
`:root` — `--ground`, `--glass`, `--text`, `--muted`, `--edge`, `--edge-strong`, `--client`,
`--server`, `--invalid`, `--ok`, `--warn`, `--display`, and every colour of the workbench set
to them — at the values the admin had, and `color-scheme: dark`, which is a fact about those
colours rather than a rule for a page. Nothing else: no rule for an element, no face loaded,
no query.

**The admin imports it, after `workbench.css`, and declares none of it.** There is one
statement of the room, and the admin reads it the way an application elsewhere does.

## Consequences

**A repository downstream depends on a release instead of a pin.** Its room moves when it
takes a release of `@formancy/themes`, a bump somebody makes and reviews, and between bumps
it is the room of the release it names — which is what a copy only claimed to be.

**The names are API now, and a value is a visible change for every importer.** `--client`
cannot be renamed for the admin's convenience, and a darker `--muted` reaches Report's and
Data's pages with the next release they take. The changelog says so whenever a value moves: a
test pins every value, and moving one fails it with a message asking for that line. The themes
README names every variable, which a test holds too.

**Order matters, and only the importer can get it right.** Both stylesheets say `:root`, so
the room recolours the workbench only when it loads second, and loaded first leaves the
builder's light panes in a dark room. The README says so, and the test holds this
repository's apps to it; another repository's order is that repository's to check.

**What it does not carry.** The faces are named, not loaded: `--display` names Archivo and
IBM Plex Sans, which each page serves itself
([0154](0154-the-website-makes-no-request-to-any-other-site.md)). The admin reads its body
faces from the workbench's `--wb-sans` and `--wb-mono`. The downstream copies also declared a
`--sans` and a `--mono` of their own, which the admin never did; those stay theirs.

**The playground and the landing page do not import it.** Each declares a room of its own
under some of the same names, with values that differ: the playground's glass at 72 % rather
than 74 % and a `--display` that names only `Archivo Variable`; the site's glass, its
stronger edge, and colours the admin has no name for. Importing the room there would change
how both look, which is a decision about those pages rather than this one, and until it is
made nothing holds the three to each other ([§11.2](../architecture/11-risks-and-debt.md)).

## Alternatives considered

**Keep the copies, with a pin test, as Report and Data did.** It holds the copies to each
other and to values somebody read once. It cannot see this repository move, which is the
failure that matters, and every new app downstream is one more copy.

**A token package in JavaScript**, the values as an exported object and the stylesheet
generated from it. Nothing reads a colour from a script, so it would add a build step to a
package that has none and a second form of every value to keep in step, for consumers who
want custom properties.

**Import the admin's own stylesheet.** It is in no published package, and it is the admin's
chrome: importing it would bring its element rules, its faces and its layout with the
colours.

**Publish the playground's room, or the site's.** Each differs from the admin's in small
ways and carries names only that page uses. The admin's is the room the downstream
repositories copied.
