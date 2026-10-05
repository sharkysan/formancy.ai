# Website privacy: operator review before publishing

Technical inspection: **2026-10-05**. This file is an implementation handoff,
not a privacy notice for visitors. The German visitor pages are
`apps/site/public/privacy/index.html` and `apps/site/public/imprint/index.html`.
They deliberately remain marked **draft** and `noindex` until the facts below
are supplied. Do not merge/deploy the draft pages as a finished legal notice.

## Confirmed from source or the public response

- The site, playground and docs are composed into one static output by
  `scripts/build-web.mjs`. The README gives a Cloudflare Workers deployment
  example; it does not establish which hosting product the live account uses.
- A live `HEAD https://formancy.ai/` returned `server: cloudflare`,
  `cf-cache-status: HIT` and `Report-To`/`NEL` headers targeting
  `a.nel.cloudflare.com`. `max_age: 604800` is the browser reporting-policy
  lifetime, **not a seven-day server log-retention period**.
- The landing-page response inspected that day contained no Cloudflare Web
  Analytics beacon. This does not establish dashboard settings, other routes,
  conditional injections or whether security challenges set cookies.
- Google Fonts stylesheets and preconnects were in the two HTML entry points.
  This change removes them. Unmodified font files and their OFL notices now
  ship with the apps. No font service is contacted by the resulting font CSS.
- The demos evaluate form data locally; the playground uploader keeps selected
  files in the tab. The docs' Starlight theme uses browser local storage.
- **Another external resource remains:** `@monaco-editor/loader` defaults to
  `https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs`. `useMonaco()` in
  the playground initializes it, not only a deliberate click on an external
  link. The privacy draft discloses this. A future local-editor change should
  package its workers as well as its main script and remove this disclosure
  only once the emitted app has been checked.

## Facts the operator must supply

| Item | Required answer |
| --- | --- |
| Responsible operator | Individual or company, full name, postal address and country; representation/registration details only if applicable |
| Public contact | Email for the Impressum and privacy requests; whether one address covers both |
| Hosting | Actual product (Workers Static Assets, Pages or another host), additional origin provider and processing locations |
| Cloudflare | Active CDN/security/analytics products, NEL choice, cookies/challenges, log access, exports and retention configuration |
| Recipients and countries | Actual hosting/CDN/mail providers and subprocessors; international transfer basis and applicable contractual safeguards |
| Retention | Access/security logs, exports/backups, NEL and contact email; exact periods or specific operational deletion criteria |
| Email | Mail provider, processing countries and retention policy |
| Target market | Whether the offer targets the EU/EEA, so GDPR-specific disclosures and any further operator information can be assessed |

`NOTICE` names Daniel Bacher as copyright holder and Git history carries an
author email. Neither establishes the legal operator, a serviceable postal
address or the mailbox to publish for privacy requests. No employer address
or private address was inferred.

## Finalisation

Replace every `.pending` paragraph/span with verified information or remove
inapplicable sections. Remove the draft banners and `noindex` directives only
after completing that review. Add the two URLs to `sitemap-pages.xml` and its
expected list in `scripts/build-web.mjs` if they should be indexed. Confirm the
live response and network requests after deployment; repository tests cannot
observe a Cloudflare dashboard change.

## Primary sources checked

- [EDÖB: Datenschutzerklärungen im Internet](https://www.edoeb.admin.ch/de/datenschutzerklaerungen-im-internet)
- [Cloudflare privacy policy](https://www.cloudflare.com/privacypolicy/)
- [Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/)
- [Cloudflare NEL documentation](https://developers.cloudflare.com/network-error-logging/)
- [jsDelivr privacy policy](https://www.jsdelivr.com/terms/privacy-policy)

Cloudflare's general policies describe the provider; they do not confirm
this account's enabled products, contract acceptance or retention settings.
The jsDelivr policy page requires client-side loading, so its detailed terms
were not verified in this inspection.
