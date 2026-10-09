---
title: Files
description: How an attachment gets from a browser to your disk, why a file is claimed rather than uploaded, and what the renderers do when there is nowhere to put one.
---

A `file` field collects attachments. What the submission stores is what each
file **is** and where it went — never its bytes:

```json
{
  "id": "0193…",
  "name": "floor-plan.pdf",
  "size": 182344,
  "contentType": "application/pdf",
  "storageKey": "forms/survey/0193…"
}
```

A submission read back years later is therefore small, readable on its own, and
still says what was attached even if the object store has since been emptied.

## Three states, and one rule

A file is **offered** when somebody asks where to put one — before any bytes
exist — **stored** when they arrive, and **claimed** when a submission that
references it is accepted. Anything that stays unclaimed is rubbish, and is
collected after a day.

The rule underneath: **the claim happens inside the submission's own
transaction.** A submission exists if and only if the files it names belong to
it. Two submissions naming the same file are adjudicated by the database rather
than by whichever check ran first, because the check made before the
transaction passes for both of them.

The row is written *before* the bytes, too. Bytes with no row are invisible
rubbish that nothing will ever look for; a row with no bytes is a broken
reference that shows up the moment anybody tries to download it. Only the first
is a problem you never find out about.

## Turning it on

```bash
FORMANCY_FILES_DIR=/var/lib/formancy/files
FORMANCY_MAX_FILE_BYTES=10485760          # optional; the operator's ceiling
```

| Variable | Required | Meaning |
| --- | --- | --- |
| `FORMANCY_FILES_DIR` | no | Where uploaded bytes go. Unset means this deployment accepts none. |
| `FORMANCY_MAX_FILE_BYTES` | no | The operator's ceiling over every form's own `maxFileSize`. Defaults to 10 MB. |

**Leaving it unset is a supported state, not a misconfiguration.** A form with
a file field still renders and still submits; the field says plainly that there
is nowhere to put one. It is deliberately not defaulted, because in a container
it has to be a mounted volume, and that is the one thing a self-hoster has to
think about.

:::caution[The local store is for one replica]
It does not survive more than one: two containers with two volumes each accept
uploads the other cannot serve. Point the deployment at an object store instead
— see below — and that ceiling is gone.
:::

## An object store instead of a directory

Set `FORMANCY_S3_ENDPOINT` and the four settings beside it, and bytes go to an
S3-compatible store rather than a local directory:

```bash
FORMANCY_S3_ENDPOINT=http://garage:3900
FORMANCY_S3_BUCKET=formancy
FORMANCY_S3_REGION=garage
FORMANCY_S3_ACCESS_KEY_ID=GK…
FORMANCY_S3_SECRET_ACCESS_KEY=…
```

**None of the four is defaulted.** A guessed bucket is a deployment that uploads
into nothing; guessed credentials are a deployment where every file reads as
missing. Both fail at startup instead. Setting this and `FORMANCY_FILES_DIR`
together is also refused, because two stores means files land in one and are
looked for in the other.

The region is part of the request signature rather than a label: a wrong one is a
signature the store computes differently and rejects. Garage answers to whatever
its own `s3_region` says.

**Garage is what this is tested against** — a real one, in a container, on every
run. The same code path serves MinIO, Backblaze B2, Cloudflare R2 and Amazon S3,
because the only thing they need in common is SigV4 and path-style addressing.

**Bytes still pass through the server.** A presigned upload straight from the
browser is the eventual shape and is the only way to accept a file larger than
the request body cap; this replaces where the bytes land without changing how
they arrive, which is what a second replica needs.

## What is refused, and where

**At the offer, before a byte is sent.** The field's `accept` list, its
`maxFileSize`, and the deployment's ceiling. A browser's file picker filter is
a convenience for the person filling the form in, and nothing at all to
somebody posting to the endpoint directly.

The offered size is then binding: a different number of bytes is refused, or
the size check was only a suggestion.

**Being allowed to submit is not being allowed to upload… and it is the same
rule.** The upload gate and the submission gate are one function, because a
form nobody may submit to is not a form anybody may upload to — otherwise the
store is free disk for whoever finds the path.

**The storage key is minted, never submitted.** A key built from a filename is
a path traversal waiting for somebody to try it. The name is kept verbatim
because it is what the reader called it, and it is display only.

## Reading files back

Authenticated, `Content-Disposition: attachment`, `nosniff`, and a sandboxing
CSP. Never inline.

A separate hostname is the right answer to stored XSS via an uploaded HTML or
SVG file, and a single-container deployment has not got one — forcing a
download is the accommodation, and it is the one place this deployment model
genuinely costs something.

A session is required **even for a form anyone may submit to**. Being allowed
to submit is not being allowed to read what everybody else attached.

## In a renderer

The control picks files; something else uploads them and reports back what was
stored. That split is the whole design: no formancy package has an opinion
about where bytes go, which is what lets the same field work against local
disk, S3 or your own service.

```tsx
import { UploaderProvider } from '@formancy/react'

<UploaderProvider value={upload}>
  <FormancyForm />
</UploaderProvider>
```

```ts
import type { Uploader } from '@formancy/react'

const upload: Uploader = async (file, { field, signal, onProgress }) => {
  // …put it somewhere, and report what was stored
  return { id, name: file.name, size: file.size, contentType: file.type, storageKey }
}
```

Angular takes the same function through `provideFormancyUploader(upload)`.

**The second argument is optional to read.** `field` is the data path of the field the
file is for, as a server looks it up — `items[].receipt` for a file field in any row of a
repeater. `signal` is aborted when the person cancels the file: hand it to `fetch` and the
transfer stops. `onProgress(sent, total)` draws the file's progress bar — but `fetch`
cannot report how far an upload has got, so an uploader that wants a figure sends the bytes
with `XMLHttpRequest` and its `upload.onprogress`. An uploader that ignores all three still
works: the bar has no figure, and a cancel stops waiting for the file rather than stopping
the transfer.

## Each file is its own upload

The field sends one file at a time, in the order they were picked, and shows each: waiting
its turn, uploading with how far it has got, or refused with the reason the uploader gave —
with **Cancel**, **Try again** and **Dismiss** where they apply. The picker stays open
meanwhile, so a second file joins the queue. A failure on one file does not stop the others,
and a file that did upload is recorded at once, so nothing that reached storage is left
unclaimed while somebody reads a message.

**A cancelled upload is not attached**, even if the uploader finishes it anyway — the person
took it back, and bytes nobody claims are collected after a day.

**A file belongs to its row.** In a repeater, a row that moves while its file uploads keeps
the file: it lands in that row wherever it now is, and in no row if the row was removed.

Attached files can be **moved up or down**, with the file's position in the button's name;
the order is the person's, and it is kept in the answer.

**An image picked in this session gets a thumbnail**, decoded from its bytes and drawn on a
canvas rather than loaded from an object URL — so a page whose Content-Security-Policy does
not allow `blob:` images still shows it. A file stored before the page was opened has none:
its bytes are not in the browser, and the renderer knows no address to fetch them from.
Without `createImageBitmap` there is no thumbnail, and the name is shown alone.

What happens to each file is decided once, in `@formancy/core`, and both renderers draw it
([0130](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0130-each-file-is-its-own-upload.md)).

**Rejecting is a real answer.** Throw, and the field says so out loud rather
than dropping the file — a submission somebody believes carries their evidence
and does not is the worst outcome available here.

**Without an uploader the field is read-only and says why.** That is a
supported state too: a form with no file fields needs no uploader, and throwing
would turn a form that mostly works into a blank page.

## Not built yet

- **Virus scanning.** A `ScanHook` with a ClamAV sidecar is designed, not
  written. A stored file is trusted the moment its bytes land; the exposure is
  limited to whoever deliberately downloads one.
- **Resumable or multipart uploads.** The deployment ceiling is also the
  largest single file.
- **A presigned upload path.** Bytes go through the server on their way to the
  object store. Removing it from the data path changes the upload flow end to
  end, including both renderers, and is what would lift the request-body ceiling.
- **Garage in the supplied compose files.** They pass the settings through, and
  neither runs a store: a fresh Garage node accepts no data until a layout is
  assigned, which is four commands after the container starts rather than
  anything a compose file can declare. Point it at a store you run.
