# 0130 — Each file is its own upload, and belongs to its row rather than its control

- **Status:** accepted
- **Date:** 2026-10-09
- **Verified by:** `packages/core/src/uploads.test.ts` — one file at a time in the order
  picked, a file picked during an upload waiting its turn; a failure keeping its reason
  without stopping the rest; a retry sending the same file; progress only once the uploader
  reports it; a cancel telling the uploader, dropping whatever it finishes with, and costing
  the next file nothing when the cancelled upload rejects; late progress from a cancelled
  upload changing nothing; the field touched once its files settle and not before; a
  remounted control finding its row's uploads, a file finishing after its row moved landing
  in that row, and one whose row was removed landing in none; the thumbnail size. Every
  mutation tried against the queue failed a named case — two of them only after the case
  that catches them was added. Both renderers' `file-upload.test` — progress bar,
  cancel, waiting, retry, dismiss, the field named to the uploader, a row moved mid-upload,
  teardown, reordering with the position in the name, and a thumbnail drawn from the bitmap
  with no object URL; mutations of each fail them. `scripts/upload-browser-test.mjs` under
  `pnpm test:browser` — Chromium decodes and draws a picked PNG in both renderers, at its own
  shape, no larger than the theme's 2rem; removing the theme's maximum fails it.
  `apps/admin/src/api.test.ts` — the offer names the renderer's field, progress comes from
  XHR, a cancel aborts it, a 401 on the bytes clears the session.
- **Deciders:** Daniel Bacher

## Context

The file field sent every picked file in one loop, disabled its picker until the loop ended,
and said "Uploading…" for all of them. The backlog asked for per-file progress, thumbnails,
cancelling, retrying and reordering. The roadmap had named why progress was missing: the
`Uploader` interface had no way to report it.

Building it found two defects in what was there, both measured:

- **A file finishing after its row moved was attached to another row.** A row that moves
  remounts its controls in both renderers. The old field kept the path it had when the file
  was picked, so in an expense claim with a taxi row and a hotel row, moving the taxi row
  while its receipt uploaded attached the taxi receipt to the hotel. Measured in the React
  binding; the Angular binding's code captured the path the same way, read rather than run.
- **The admin's preview offered every file against the first file field in the form,**
  because the renderer never said which field a file was for. Its code named this as a
  stopgap "worth fixing by widening `Uploader` to take the field".

## Decision

**What happens to each file is `@formancy/core`'s, read by both renderers.** An upload queue
sends one file at a time in the order picked; each file is waiting, uploading — with how far
it has got once the uploader says — or failed with the uploader's reason. A failed file can
be tried again with the same `File` or dismissed; a waiting or uploading one can be
cancelled. A cancelled upload that finishes anyway is not recorded: the person took it back,
and bytes no submission claims are collected ([0055](0055-files-are-claimed.md)). Core has no
DOM types, so cancelling is a callback; each binding turns it into the `AbortSignal` its host's
uploader takes.

**The queue belongs to the form, found by the row's identity.** `fieldUploads(engine, wire)`
keys it by the path with each row position replaced by that row's `_id`, so a control drawn
for the same row after a move finds its uploads, and a finished file is written to wherever
that row is now — or nowhere, if the row was removed. A form that goes away cancels its
uploads from the provider, not from the field, because the field is remounted by a move.

**The uploader is told more, and need not listen.** `Uploader` is `(file, options)` with
`options.field` — the data path a server reads, `items[].receipt` for any row —
`options.signal` and `options.onProgress`. A function of the file alone is still an
`Uploader`; the field then shows no figure, and a cancel stops waiting rather than stopping
the transfer. The admin uses all three: the offer names the field, and the bytes go by XHR
because `fetch` cannot report an upload's progress.

**The picker stays open while files upload**, so a second file joins the queue rather than
waiting for the first to be remembered.

**A stored file can be moved up or down**, with its position in the button's name and no
button at the end it cannot move past — a repeater row's convention.

**A thumbnail is drawn, not loaded.** An image picked in this session is decoded with
`createImageBitmap` and drawn on a canvas at `@formancy/core`'s size, at most 64 pixels on
its longer side. An `<img>` on an object URL is subject to the page's `img-src`, and a strict
policy without `blob:` would show a broken image while the product says a form runs under a
strict CSP with no configuration; drawing a bitmap involves no URL.

## Consequences

**Calling an `Uploader` takes two arguments now.** Writing one does not change; code that
invokes its own uploader typed as `Uploader` has to pass options. The playground's tests
were the only such code here.

**A file stored before this page has no thumbnail.** Its bytes are not in the browser and the
renderer knows no address to fetch them from. The name is still shown.

**An upload whose row was removed runs to its end.** Its result is dropped and the bytes are
collected, but the transfer is not stopped — the queue cannot tell a removed row from one it
has not looked for yet without asking the engine on every progress report.

**Scanning is not here.** A scanning hook is a server decision about when a stored file
becomes trusted, with its own failure modes, and is its own change.

**The renderers' words are English.** "Cancel uploading", "Try … again" and the rest join
"Remove" and "Undo removing", which the field already said in English whatever the form's
language; the renderers' own words have no catalogue yet.

## Alternatives considered

**Each renderer keeps its own queue.** Every decision above would be made twice; the
measured row defect was in both renderers because both had made it the same way, and the
next one would not necessarily be.

**Upload the files in parallel.** Five bars that each crawl say less than one that moves, the
answer's order would be the order uploads finished rather than the order picked, and a
connection is not faster for being split.

**Keep the queue in the control and stop rows from remounting.** Keeping controls mounted
across a move is the repeater's known limitation and a change to both renderers' row
rendering; the upload's owner should not depend on it.

**`URL.createObjectURL` and an `<img>`.** Simpler, and wrong under the CSP the product
documents.
