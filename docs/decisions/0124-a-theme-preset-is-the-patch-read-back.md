# 0124 — A theme preset is the patch, read back through the editor's own rule

- **Status:** accepted
- **Date:** 2026-10-09
- **Verified by:** `apps/playground/src/theme-tokens.test.ts` — what the editor writes reads
  back as the same overrides; a token the theme does not declare, another theme's tokens
  and a declaration on `:root` are each named and none is applied; and the report says all
  three. Applying undeclared tokens, dropping the other themes and never reporting `:root`
  each fail a named case. `apps/playground/src/theme-editor.test.tsx` — a file uploaded
  through **Import CSS** lands on the themed host and in the fields and is announced; it
  replaces the edits in progress rather than merging with them; and a file with nothing for
  this theme changes nothing and says why. Merging, and applying an empty reading, each
  fail one of those.
- **Deciders:** Daniel Bacher

## Context

The visual theme editor ([0103](0103-a-theme-editor-edits-what-a-theme-declares.md))
hands back a CSS patch and persists nothing, on purpose: nothing in the playground
persists, and a stored theme needs a home — a table, a route, an owner — that nobody has
decided. The backlog asked for presets that can be saved and imported. Saving existed as
the download; importing did not, so a preset was a file a person could keep and never
carry on editing. Every session started from the theme again.

## Decision

**A preset is the patch the editor already writes**, and nothing else. **Import CSS** reads
a file back and puts its overrides in the editor, where they land on the themed host as
any edit does.

**Read by the browser, filtered by the editor's own rule.** The text goes into a constructed
stylesheet (`new CSSStyleSheet()`, `replaceSync`) and through the same adapter and the same
discovery rule as the live stylesheets: a token counts when it is declared on the theme's
own selector and the theme declares it. So a preset can set exactly what the editor offers.

**What is not applied is said.** Three things in a file are not read, and each is named in
the report rather than dropped: a token this theme does not declare, which would set a
property nothing reads; tokens for another theme, which belong to it — the themes share
almost no vocabulary on purpose; and a declaration on a selector that is not a theme's own,
such as `:root`, which the theme's own root overrides before it reaches a control. A preset
that half applies and says nothing reads as one that worked.

**An import replaces the edits in progress.** A preset is a whole set of changes; laid over
edits already made it would be neither. A file with nothing readable for this theme leaves
the editor alone.

**The report belongs to the theme it was about**, kept with that theme's name rather than
cleared by an effect, so choosing another theme does not leave it standing under the
second theme's controls. It is a live region that is never hidden while empty, because a
region added with its text is not reliably announced.

## Consequences

**A preset for another theme is not converted.** Opened on `blueprint`, a `dusk` preset
changes nothing and says to choose `dusk` and import it again. Mapping one vocabulary onto
another would be guessing, and 0103's whole point is that the vocabularies differ.

**Still nothing persists.** A visitor's presets live where they put the files. The cost is
that there is no list of presets in the editor; the benefit is that the file in somebody's
repository and the preset are the same thing, so neither can drift from the other.

**The preset format is CSS, which a person can read and a host can ship as it is** — the
same file is the input to the editor and the stylesheet a project includes. No second
format exists to version.

## Alternatives considered

**Presets kept in `localStorage`, named, listed in the editor.** The odd one out in an app
where nothing else persists, invisible to the person's project, and lost with the browser's
storage — a list that looks durable and is not.

**A JSON preset beside the CSS.** A second format to keep in step with the first, for no
information the CSS does not already carry.

**Apply whatever `--fm-*` the file declares.** Undeclared tokens would show as changed and
change nothing on screen; a `:root` declaration would show as applied and be overridden by
the theme. Both are the documented-but-inert failure this repository refuses.
