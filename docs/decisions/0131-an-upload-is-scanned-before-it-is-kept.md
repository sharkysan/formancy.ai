# 0131 — An upload is scanned before it is kept, and refused when it cannot be

- **Status:** accepted
- **Date:** 2026-10-09
- **Verified by:** `packages/server-core/src/uploads.test.ts` — without a scanner every upload
  is kept; a clean verdict keeps it and the scanner saw the bytes that arrived; a finding
  refuses it by name; a scanner that cannot be asked refuses it too, and the cause is kept
  for the log. Making it fail open, or ignore a finding, fails a named case.
  `packages/server/src/clamd-scanner.test.ts`, against a stand-in speaking clamd's INSTREAM
  protocol — bytes arrive intact across many chunks, `OK` is clean, a finding is refused by
  name, a file over the configured limit is refused without being sent, clamd's own
  size-limit answer is a refusal, and an answer it does not understand, no daemon and no
  answer all reject; unframing the chunks, taking an unknown answer for clean, dropping the
  size check or the timeout each fail a case. `packages/server/src/server.integration.test.ts`
  on real PostgreSQL — a refused file is not in the store and cannot be claimed by a
  submission, an unavailable scanner keeps nothing and names no address, and the same bytes
  are kept once it is back; removing the scan from the route fails all four.
  `apps/admin/src/api.test.ts` — the server's refusal reaches the field in its own words.
- **Deciders:** Daniel Bacher

## Context

A stored file was trusted the moment its bytes landed. The plan named a scanning hook with a
ClamAV sidecar; the backlog asked for "scanning hooks" with the rest of the upload work
([0130](0130-each-file-is-its-own-upload.md)). Downloads were already attachments with
`nosniff` and a sandboxing CSP, which limits what an uploaded file can do to the page — not
what it does to whoever opens it afterwards.

## Decision

**A deployment supplies a `Scanner`, and it is asked before the bytes are kept.** The
upload's bytes are buffered in memory already, up to the operator's ceiling, so the scan runs
on them between the size checks and the write: a file the scanner refuses is never in the
store, not even until the collector runs, and its row stays `offered`, so it cannot be
claimed by a submission.

**Fail closed.** Clean is kept. A finding is refused with `422 refused_by_scanner` and the
scanner's name for it, which the field shows as the reason it was not attached. A scanner that
cannot be asked — refused, timed out, answering nonsense — is refused too, with `503
scanner_unavailable` and "try again": a deployment that configured a scanner did so to keep
unscanned files out, and its being down is not a reason to let one in. The cause goes to the
operator's log, never to the client, because it can name an internal address. The file
field's retry is how a person gets past a scanner that was restarting.

**ClamAV is supplied, over its own protocol.** `createClamdScanner` speaks clamd's INSTREAM —
the command, length-prefixed chunks, a zero-length chunk, one line back — over `node:net`,
adding no dependency. Only `stream: OK` is clean. `FORMANCY_CLAMD_HOST` turns it on;
`FORMANCY_CLAMD_PORT` and `FORMANCY_CLAMD_MAX_BYTES` say where and how much. It is not
checked at startup: clamd takes minutes to load its signatures, and a server that refused to
start until then would make a slow scanner an outage of everything.

**The size limit is checked before a byte is sent.** Past its `StreamMaxLength`, clamd says
so and closes the connection while bytes may still be arriving. Against the stand-in, the
bytes in flight reset the connection and the answer was lost to `ECONNRESET` — read as a
scanner that is down, the person would be told to try again forever. Checked first, a file
over the configured limit is refused as one that could not be scanned, whatever the timing.

## Measured once against ClamAV itself

`clamav/clamav:stable`, ClamAV 1.5.4, on 2026-10-09, with its shipped configuration: a plain
document came back clean; the EICAR test file came back as `Eicar-Test-Signature`; a 90 MiB
stream was accepted and answered, and a 110 MiB one answered `INSTREAM size limit exceeded` —
**intact, not reset**, unlike the stand-in. That fixed the default: clamd's `StreamMaxLength` is
100 MiB, as its shipped `clamd.conf` says, not the 25 MiB this change first assumed.

**What it did not show.** The EICAR file is recognised only as itself — 1 KiB of padding before
or after it, and clamd answered clean — so it cannot be hidden in a larger file to find out
whether content past clamd's `MaxFileSize` or `MaxScanSize` is scanned. ClamAV's own shipped
`clamd.conf` says it is not flagged unless `AlertExceedsMax` is set, and that default is off:
an archive that expands past the limits is answered clean. The documentation tells an operator
to set it; nothing here can.

## Consequences

**Without a scanner, nothing is scanned**, as before. It is a supported state and the
documentation says so; it is not a default this changes.

**Detection is the scanner's.** A signature scanner finds what its signatures know, and keeping
them current is the operator's. Files stored before a scanner was configured are not rescanned.

**An upload waits for its scan.** The `PUT` returns once clamd has answered; for a large file
that is the time clamd takes, on top of the transfer.

**The file routes left `app.ts`** for `routes/files.ts`, one route family per plugin, when the
scan needed lines that file had no room for; `ServerDeps` left `use-cases.ts` for `deps.ts` for
the same reason.

## Alternatives considered

**Scan asynchronously after storing, and quarantine.** It is what the plan first said. It lets a
submission claim a file before its verdict, which then needs a state for "claimed but
infected", a way to tell whoever read it, and an answer to what the submission now means. A
synchronous refusal reaches the person who can do something about it: the one attaching it.

**Fail open when the scanner is down.** Uploads keep working through a scanner restart — and a
deployment that configured a scanner would accept unscanned files whenever it was unavailable,
which is the condition an attacker can most easily arrange.

**A ClamAV client library.** A dependency, a SOUP row and its own anomalies, for a protocol of
a command, a framing and one line.
