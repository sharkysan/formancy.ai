# 0102 — Serve web fonts with the site and name what still leaves it

- **Status:** accepted
- **Date:** 2026-10-05
- **Deciders:** Daniel Bacher
- **Verified by:** `apps/docs/src/web-privacy.test.ts`; `pnpm build:web` and inspection of its emitted CSS/assets. Hosting settings require the operator review in `docs/website-privacy-review.md`.

## Context

The landing page and playground asked Google for CSS and font binaries before
the visitor did anything. The preconnects disclosed a connection even when a
font was cached. Neither app, nor the docs, linked to operator or privacy details.

## Decision

Bundle the existing WOFF2 fonts unchanged, retain every family's copyright and
OFL notice in both apps' static output, and link static privacy/operator pages
from all three surfaces. The pages are drafts while operator and account-level
facts are unknown. Describe the remaining Monaco CDN request explicitly.

## Consequences

Typography no longer requires Google Fonts requests, including for the existing
language subsets and variable axes. The legal pages work without JavaScript.

The cost is vendoring font binaries and maintaining their provenance, licences
and duplicate public licence copies. The apps' independent builds can emit
duplicate font files. A source check cannot prove the CDN does not inject a
script or set a cookie; the privacy notice still needs the operator's actual
settings. This is not a declaration of legal compliance.

## Alternatives considered

- System fonts everywhere: removes the dependency but changes the established design.
- Keep Google Fonts behind consent: adds a decision to reading a page when serving
  the existing files ourselves avoids that connection entirely.
- Assume Cloudflare Workers and a retention period from the README: a deployment
  example does not establish the account settings or actual data handling.
