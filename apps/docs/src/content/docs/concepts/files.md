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

:::caution[One replica]
The local store does not survive more than one replica: two containers with two
volumes each accept uploads the other cannot serve. `FileStore` is four
methods, so an S3 adapter replaces one file — but it is not written yet.
:::

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

const upload: Uploader = async (file) => {
  // …put it somewhere, and report what was stored
  return { id, name: file.name, size: file.size, contentType: file.type, storageKey }
}
```

Angular takes the same function through `provideFormancyUploader(upload)`.

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
- **An S3 store.** See the note above about replicas.
