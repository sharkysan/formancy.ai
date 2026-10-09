/**
 * The oldest browsers the stylesheets here are written for, as a bundler's CSS target.
 *
 * The themes say which side a thing is on with `:dir()` and logical properties
 * ([0113](docs/decisions/0113-a-theme-is-written-in-reading-order.md)), and a bundler
 * targeting older browsers does not leave `:dir()` alone. Lightning CSS — Vite's —
 * rewrote `:dir(rtl)` as `:is(:lang(ar), :lang(he), …)`, which asks what LANGUAGE a page
 * is in rather than which way it reads: `dir="rtl"` on a page with no Arabic or Hebrew
 * `lang` then changed nothing. Measured 2026-10-09 in this repository's own playground and
 * landing page, both built with Vite's default target
 * ([0123](docs/decisions/0123-the-builder-reads-right-to-left.md)).
 *
 * Each entry is the first release with both `:dir()` and `color-mix()`, the two the
 * stylesheets lean on that no rewrite can keep the meaning of. One list for both apps
 * that bundle a theme, so the two cannot drift; `pnpm test:browser` reads what they
 * built and fails on a `:lang()` the sources never wrote.
 */
export const CSS_TARGET = ['chrome120', 'edge120', 'firefox113', 'safari16.4', 'ios16.4']
