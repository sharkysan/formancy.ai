# Web fonts served with the website

Archivo, Fraunces (normal and italic), IBM Plex Mono, IBM Plex Sans and Space
Grotesk. These are the unmodified WOFF2 responses supplied by Google Fonts on
2026-10-05, with the original weight ranges, width range and language subsets.
`manifest.json` records each download URL, SHA-256 digest and byte length.

The font files are **SIL Open Font License 1.1**, not Apache-2.0. Each family's
`*-OFL.txt` includes its copyright and, where applicable, reserved font name.
No font was renamed, subsetted or converted here. `fonts.css` only replaces the
remote URLs with local relative URLs, so Vite emits each needed asset under the
application's configured base. Browsers download only the faces they use.

The site and playground import this stylesheet. Both also carry the notices in
their `public/font-licenses` directories, since Vite otherwise drops text files
beside an imported font. The site's Impressum links to these public notices.
The docs retain their existing system-font stack.

To update, download the replacement fonts and their corresponding licences,
record their sources and hashes, and replace all public notice copies as well.
`apps/docs/src/web-privacy.test.ts` verifies the assets and notice copies; it
also rejects Google Fonts links and preconnects in either HTML entry point.
