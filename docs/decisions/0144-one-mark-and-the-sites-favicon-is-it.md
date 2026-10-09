# 0144 — One mark, and the site's favicon is it

- **Status:** accepted
- **Date:** 2026-10-09
- **Deciders:** Daniel Bacher
- **Verified by:** `apps/docs/src/mark.test.ts` — every favicon, the documentation's header
  mark and the admin's inline mark draw the same four shapes in the same four colours as
  `apps/site/public/favicon.svg`; the site's bar and social card draw the same shapes and fill
  them from `--client` and `--server`, which must be its colours; the touch icon's pixels are
  read and compared; and every page an application serves links a favicon. Watched failing on
  the documentation's mint, the darker favicon violet, the old touch icon and the Angular
  starter's missing icon.

## Context

Asked: why is the logo not the same everywhere, for example in the docs? Because there were
four. The site's bar drew a violet stem and teal arms from its palette, `#8b7bff` and
`#3fe0d5`. The site's and the playground's favicons — and the touch icon rendered from them —
drew a darker `#7c6bf5` and `#3fd0c9`. The admin drew the palette's colours on the favicon's
ground. The documentation drew one mint, `#a8f5ca`, on dark green, in its header and as its
favicon. The Angular starter had no favicon, so its tab showed the browser's blank page.

The playground's favicon said "one mark across the site, the playground and the admin", and
nothing held it to that — or to the documentation, which it did not name.

## Decision

**The mark is `apps/site/public/favicon.svg`**, in the site's palette: `#8b7bff` for the stem,
`#3fe0d5` for the arms, on `#10141c`. Every other copy is that file's four shapes and four
colours, and a test compares them, shape for shape and colour for colour. The palette is the
source because it is what most people see — the bar on every page of the site.

The copies stay copies — an SVG beside each application, the admin's inline component, a PNG
for the touch icon — because each application is built and served on its own. They are
compared rather than derived.

## Consequences

**The documentation looks like the site it is part of**, rather than like a product of its
own. Its accent colour is Starlight's and still blue; only the mark changed.

**The favicons are a little brighter**, the palette's violet and teal rather than the darker
pair they had drifted to.

**A raster copy is checked by its pixels**, which needed a few lines of PNG decoding in the
test rather than a dependency. Re-rendering the touch icon is a screenshot of the SVG at
180 pixels with a square ground, since iOS rounds the corners itself.

## Alternatives considered

**Derive every copy from one file at build time.** The applications build independently and
the PNG would need a rasteriser in the build, which is a dependency for an icon. A comparison
fails as surely and costs nothing to run.

**Keep a mark per application** — a mint one for the documentation. It reads as a different
product, which is what was asked about.
