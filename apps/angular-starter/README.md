# formancy Angular starter

An Angular application with a form builder and the form it builds, side by side: the
builder edits the document on the left, and the right is that document filled in, drawn
with [Angular Material](https://material.angular.dev) through `@formancy/angular/material`.

It opens on an expense claim — a repeater of expenses with a receipt each, a reason asked
for only when one expense is over CHF 500, a confirmation to tick — and shows a submitted
claim as the data a server would receive. **Save** keeps the form being built and the app
opens on it next time; **Reload saved** puts it back without restarting.

```bash
pnpm install
pnpm --filter @formancy/angular-starter dev    # http://localhost:4383
```

## What is yours to change

Everything a host decides is in four files, and nothing else in the app names a field:

| File | Decides |
|---|---|
| `src/app/expense-claim.ts` | the document it opens on — replace it with your own |
| `src/app/app.ts` | which builder panels appear, and what happens to a submitted claim |
| `src/app/preview.ts` | how a document becomes a form: the engine's clock, the Material registry, the uploader |
| `src/app/saved-form.ts` | where the form being built is kept — the browser's storage here |

**A saved form is the browser's, for this page.** A form is JSON, so keeping one elsewhere is
replacing two functions: `saveForm` sends `JSON.stringify(document)` to your server, and
`savedForm` fetches it back and checks it is still a form this version reads, since a session
refuses an invalid document by throwing. Against a formancy server, saving is publishing a
version — `POST /forms` with the document — and the server keeps every one.

**The uploader keeps the bytes in the browser tab**, and its storage key says so. Replace
`inTabUploader` with one that sends them somewhere. Against a formancy server it is two
requests — offer the file, then `PUT` its bytes to the address the offer returns:

```ts
const upload: Uploader = async (file, { field, signal, onProgress }) => {
  const offer = await fetch(`${server}/f/${path}/files`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ field, name: file.name, size: file.size, contentType: file.type }),
    signal,
  })
  if (!offer.ok) throw new Error((await offer.json()).message ?? 'The file was refused.')
  const { uploadUrl, ...stored } = await offer.json()
  const sent = await fetch(`${server}${uploadUrl}`, { method: 'PUT', body: file, signal })
  if (!sent.ok) throw new Error((await sent.json().catch(() => ({}))).message ?? 'The upload failed.')
  return stored
}
```

`fetch` cannot report an upload's progress; send the bytes with `XMLHttpRequest` and its
`upload.onprogress` for a figure on the bar. The file field shows each file's progress,
lets it be cancelled or tried again, and keeps the answer in order either way.

## Taking it out of this repository

It builds against the workspace's own packages. Copied out, replace each `workspace:*` in
`package.json` with the version you want from npm, and change the two paths outside this
directory: `../../tsconfig.base.json` in `tsconfig.json` and `../../css-target` in
`vite.config.ts` (the browsers it is for: Chrome and Edge 120, Firefox 113, Safari 16.4).

It is built with Vite and Analog's Angular plugin, the toolchain this repository's Angular
packages are tested with. An Angular CLI project takes `src/app` unchanged: the components
and providers are plain Angular, zoneless.

## What it is held to

`src/app/app.test.ts` opens it as somebody who cloned it would: the form drawn with
Material and the receipt drawn by the default control, a large expense asking why and an
untouched form not, a claim submitted and shown, an edit in the builder reaching the
form, and a form saved, opened again and reloaded — but not one saved that is no longer
valid. Each was observed failing with the thing it guards removed.
