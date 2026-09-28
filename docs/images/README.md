# The pictures, and how to take them again

Every image here is a screenshot of something this repository builds. None of them is
drawn by hand, and none should be: a picture that cannot be regenerated is a claim nobody
can check, and each of these outlived at least one change to the thing it shows before
anybody noticed.

Take them at **1440×900** unless a section says otherwise, from the **built** site rather
than the dev server — the dev server injects styles the build does not, and it renders a
`@monaco-editor/react` cancellation error the build has no trace of.

```bash
pnpm build:web
cd apps/site/dist && python -m http.server 4399
```

## `readme/hero.jpg` — the landing page

`http://localhost:4399/` at 1440×900, saved as JPEG. Nothing to set up: the page opens on
the Paper appearance with an empty form, which is what a visitor sees.

## `readme/themes.png` — one form, four themes

Four element screenshots of `.studio-canvas`, one per appearance, stitched side by side.

The stitching is not decoration. Captured as they sit on the page, the four cards are
different heights and the first one carries a shadow the others do not — which reads as
one of them being the real one and the rest being copies. So before each capture:

```js
const c = document.querySelector('.studio-canvas')
c.style.boxShadow = 'none'
c.style.margin = '0'
c.style.width = '460px'
c.style.borderRadius = '0'
```

Type the same answers into every one, then pad each panel to the tallest with **its own
page colour** rather than the sheet's, so the four are one rectangle each.

## `readme/builder.png` — the admin

Needs the stack. Postgres from compose, the server from its build, the admin from Vite:

```bash
docker compose up -d postgres
DATABASE_URL="postgres://formancy:formancy@127.0.0.1:5439/formancy" \
  FORMANCY_AUTH_SECRET="a-development-secret-of-sufficient-length" \
  FORMANCY_ADMIN_EMAIL="root@example.ch" FORMANCY_ADMIN_PASSWORD="root-password-1" \
  node packages/server/dist/main.mjs
pnpm --filter @formancy/admin dev
```

`127.0.0.1` and not `localhost` in `DATABASE_URL`: the container binds IPv4 and Node
resolves `localhost` to `::1` first on Windows.

Publish a form with enough in it to be worth a picture — a group, a repeater arranged as a
grid, a date with a bound, a file, a computed total — then open it, add one row to the
grid so the grid shows, and select a **leaf** field so the property panel has more than a
group's three settings in it.

## `readme/playground.png` — the playground

`http://localhost:4399/playground/` at 1600×1000, with a few answers typed in so the
engine pane shows a submission value rather than empty rows.

## `../../apps/site/public/og.png` — the social card

The card a chat app, a search result or a shared link shows. It is a **route**, not an
export: `http://localhost:4399/?og` renders `apps/site/src/og-card.tsx` at exactly
1200×630. Screenshot the `#og-card` element.

It is built that way because the last one was a PNG nobody could regenerate, and it
outlived two rewrites of the headline — every shared link said "One engine, in the browser
and on the server" long after the page stopped saying it.
`apps/docs/src/counts.test.ts` now fails when the card's headline and the page's disagree.
