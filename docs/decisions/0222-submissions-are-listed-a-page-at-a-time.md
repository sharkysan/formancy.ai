# 0222 — A form's submissions are listed a page at a time, from where the last page ended

- **Status:** accepted
- **Date:** 2026-10-30
- **Deciders:** Daniel Bacher
- **Verified by:**
  - **`packages/server-core/src/submission-pages.test.ts`**, on the in-memory storage:
    - a page holds at most the limit, newest first, and the next is asked for from where it ended;
    - responses stored at the same moment are split by their ids and each listed once;
    - a response stored while somebody pages shifts nothing;
    - each response says which version it answered;
    - an unanswered form has an empty page with no next, and an unknown form has none;
    - a cursor that names no place in the list is refused;
    - a page holds between 1 and 1000, whatever is asked.

    They failed for want of the function. *Is not shifted by a response stored while somebody
    pages* was also seen failing against a listing that ignored the cursor.
  - **`packages/server/src/server.integration.test.ts`**, on real PostgreSQL:
    - *a page at a time lists every submission the full list does, in its order, and says when it
      ends*, a page of one at a time, which failed against a query that ignored the cursor;
    - *a cursor that names no place in the list is refused, 400*.

## Context

`GET /f/:path/submissions` answered every submission of a form in one reply. The server read them
all into memory to send them, and the admin read them all to draw them and count its summary
(0206). A form with many responses was a reply of all of them. Nothing in arc42 §11.2 recorded it.

## Decision

**The listing takes a page when asked for one.** `?limit=` asks for at most that many, newest
first, held between 1 and 1000, and 100 when only `after` is given. The reply carries
`next`, which `?after=` asks for the next page with, or `null` when this page is the last. A
cursor that names no place in the list is refused with `400 bad_cursor`.

- **Keyset, not offset.** A page is asked for from where the last one ended: that response's time
  and its id, the order the list is in. A response stored while somebody pages comes before the
  first page and moves nothing after it. An offset would shift every row by one, and the next page
  would list again the last row of the one before. The query is a row comparison,
  `(submitted_at, id) < (…)`, over a new index on `(form_id, submitted_at DESC, id DESC)`, so a page
  late in a long list costs what the first does.
- **The cursor is opaque by contract and readable by design**: the time and the id, joined by `_`.
  `server-core` has neither Node's nor the browser's types, so no base64 to hide them in (0008), and
  there is nothing to hide: whoever may read the page may read both.
- **Without `limit` or `after`, the reply is every submission, as before.** A client that ignored
  `next` would otherwise take the first page for all there is, without a word. The unbounded reply
  stays available to a caller who asks for it by asking for nothing, and arc42 §11.2 records it.
- **The audit records the page's count**, as it recorded the list's.

## Consequences

A caller can read a form's responses in bounded replies, and one reading while responses arrive
sees each once.

**What it costs.**

- **A new index**, built on the first start of this version by the server's bootstrap. It is a
  plain `CREATE INDEX`, which holds back writes to `submissions` while it builds: a response sent
  in that time waits. `CONCURRENTLY` would not hold them, but an interrupted build leaves an
  invalid index that `IF NOT EXISTS` then keeps for ever, unused.
- **The order assumes the times the server writes**, to the millisecond. A cursor carries the time
  as the server reads it back, so a row written by hand with microseconds could be passed over at
  a page's edge.
- **One more port method**, `pageSubmissionsByForm`, in both storages. The in-memory one compares
  as PostgreSQL does, a time and then an id, and the integration case holds PostgreSQL to the
  order of the full list.

**What it does not do.**

- **The admin still reads every submission.** Moving it to pages, with its summary counted on the
  server per version, is what this is for, and comes next.
- **The CSV export is unchanged**: it is a file of every submission, and is asked for as one.

## Alternatives considered

- **Page by default, with `limit` 100 when none is given.** Every reply would be bounded. But a
  client written against the old reply, which ignores `next`, would silently read a hundred
  responses as all of them: a quiet loss in place of a slow reply.
- **An offset, `?page=3`.** Simpler to write, and wrong while responses arrive: each one shifts
  every page after the first.
- **A cursor signed by the server.** It would stop a caller from making one up. A made-up cursor
  can only name a place in a list the caller may already read in full.
