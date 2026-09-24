# 0055 — A file belongs to a submission, or it is rubbish

- **Status:** accepted
- **Date:** 2026-09-24
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/server-core/src/uploads.test.ts` (19 cases: the
  offer's refusals, the claim's refusals, and what the collector must not
  touch), `packages/server/src/file-store.test.ts` (13, mostly keys trying to
  leave the store), and `uploaded files` in
  `packages/server/src/server.integration.test.ts` against real PostgreSQL —
  including two concurrent submissions naming the same file, which only a real
  database can adjudicate.

## Context

The `file` field type shipped with a renderer, an `Uploader` interface and
nowhere to put bytes. A self-hoster adding one got a control that said, plainly
and correctly, that this deployment had no upload destination.

Three things make file upload harder than it looks, and each has a wrong answer
that is easier than the right one.

**A file exists before the submission does.** Somebody picks a file, it
uploads, and then they keep filling the form in for ten minutes — or close the
tab. So there is always a window where bytes exist that no submission owns, and
the easy answer (upload with the submission) means a 20 MB POST that fails
validation and has to be re-sent.

**A submission that references a file must own it.** If the reference and the
ownership are set separately, one of two failures follows: a rolled-back
submission leaves files claimed against nothing, or an accepted submission
references bytes the collector is about to delete.

**Serving a file back is the vulnerability.** Stored cross-site scripting via
an uploaded HTML or SVG file is the most commonly exploited vulnerability in
this product category, and the answer — a separate hostname — is precisely what
a single-container deployment does not have.

## Decision

**Three states: offered, stored, claimed.** The row is written when somebody
asks where to put a file, before any bytes exist, so a half-finished upload is
still something the collector knows to look for. Bytes with no row are
invisible rubbish; a row with no bytes is a broken reference that shows up the
moment anybody tries to download it. Of the two, only the first is one you
never find out about.

**Refuse at the offer, not after the upload.** The field's `accept` list and
`maxFileSize`, plus the deployment's own ceiling, are checked before a byte is
sent. The browser's filter is a convenience for the person filling the form in
and nothing at all to somebody posting to the endpoint directly. The offer's
declared size is then binding: an upload of a different length is refused,
because otherwise the size check was a suggestion.

**The upload gate is the submission gate, and the same function.** A form
nobody may submit to is not a form anybody may upload to either, or the store
becomes free disk for whoever finds the path. `maySubmit` moved into its own
module so both callers use it; two copies of that rule is one copy that gets
forgotten.

**The claim is part of the submission's transaction.** `insertSubmission` takes
the file ids alongside the deliveries, for the same reason the deliveries are
there ([0048](0048-webhook-delivery.md)): one call, one `COMMIT`, and a port
that exposed them separately would invite a caller to break it. The `UPDATE`
matches only rows in `stored`, and a row count short of what was asked for
rolls the whole thing back — which is how two concurrent submissions naming the
same file are adjudicated. The check made before the transaction passes for
both of them; only the database can decide.

**The storage key is minted, never submitted.** It is the form id and the file
id. A key built from a filename is a path traversal waiting for somebody to try
it. The name is kept, verbatim, because it is what the reader called it and
what they should see — and it is display only.

**Files are served as attachments, authenticated, always.** `Content-Disposition:
attachment`, `nosniff`, a sandboxing CSP, and a session required even for a
form anyone may submit to: being allowed to submit is not being allowed to read
what everybody else attached. A separate hostname remains the right answer and
is not available here; forcing a download is the accommodation, and it is the
one place this deployment model genuinely costs something.

**Unclaimed files are collected after a day.** Bytes first, then the row, for
the reason above. The collector is a timer in the server process, like the
outbox worker and for the same reasons — and unlike the outbox, running two of
them is harmless, because deleting a file twice is deleting it once.

**Local disk is the only store, and it is an interface.** `FileStore` has four
methods; S3 replaces one file. `@formancy/server-core` never sees it: it
decides what is rubbish and the host deletes it, which is why the whole
lifecycle is testable without a filesystem.

## Consequences

**What it buys.** A submission exists if and only if the files it names belong
to it. A form author's `accept` and size limits are enforced where they cannot
be bypassed. And a disk that fills up is a bug rather than an inevitability.

**What it costs.** Two round trips per file instead of one. A `files` table
with a foreign key to `forms` that is `ON DELETE RESTRICT`, so deleting a form
with attachments is a deliberate act rather than a cascade. And the local store
does not survive more than one replica: two containers with two volumes will
each accept uploads the other cannot serve. That is the same single-replica
constraint the outbox already has, now with a second reason.

**What is not built.** Virus scanning — the design calls for a `ScanHook` with
a ClamAV sidecar, and a `stored` file is currently trusted the moment its bytes
land. Resumable or multipart uploads, so the deployment ceiling is also the
largest single file. And no S3 adapter, though the interface it would implement
is the one local disk already does.

## Alternatives considered

**Upload with the submission, as multipart.** Rejected: it makes every retry
re-send every byte, puts the whole payload through the body limit that exists
to protect the JSON parser, and turns a validation failure into a repeated
20 MB upload.

**Presigned PUT straight to object storage, with no local option.** Rejected as
the default: `docker compose up` has to produce something that works, and a
self-hoster with one container and one volume is who this product is for. The
interface is shaped so that adding it later replaces one file.

**Claim the files right after the submission is stored.** Rejected — it is the
second failure in the Context, and it is invisible until the day a transaction
rolls back.

**Serve files inline with a strict `Content-Type`.** Rejected: browsers sniff,
`Content-Type` is attacker-chosen at upload, and the failure mode is script
running on the administrator's own origin. A download is worse to use and
cannot do that.
