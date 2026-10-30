# 0224 — A summary is counted a response at a time, and the server reads a page of them at once

- **Status:** accepted
- **Date:** 2026-10-30
- **Deciders:** Daniel Bacher
- **Supersedes in part:** [0223](0223-responses-are-summarised-on-the-server.md), whose summary
  read every submission of the form into the server's memory
- **Verified by:**
  - **`packages/core/src/summary.test.ts`**:
    - *gives a number its range and mean over more answers than a call can take arguments*:
      200,000 answers, which threw `RangeError: Maximum call stack size exceeded` before the change;
    - *counted one response at a time, says what it says counted all at once*, over the
      fixture and over no submissions, which failed for want of `createSummary`.
  - **`packages/server-core/src/response-summaries.test.ts`**, *read the responses a page at a
    time, never all at once*: 2,500 responses counted in pages of 1,000, 1,000 and 500, with a
    storage that refuses to list every submission. It failed against the summary that asked
    for all of them.

## Context

0223 moved the summary of a form's responses to the server, counted by `summariseAnswers`, and
recorded that the server read every submission of the form into memory to count them.

There was a worse limit underneath. `summariseAnswers` kept every answer to a number question and
found its range with `Math.min(...numbers)`. A spread into a call is bounded by the engine's
argument limit, and past it the call throws. Measured on Node 22, 100,000 numbers passed and
120,000 threw. A form with that many answers to one number question, or that many rows of one,
could not be summarised: `/f/:path/summary` answered 500, and the admin, which counted the same way
in the browser until 0223, had thrown too.

## Decision

**`createSummary`, in `@formancy/core/summary`, counts one submission at a time.** `add` counts a
submission's answers, and `questions` says what has been counted, in document order.
`summariseAnswers` is that over a list, and says what it said. A number keeps its count, sum and
bounds rather than every answer. Every question is declared, empty, before anything is counted, so
one nobody answered still has its line.

**The server counts page by page.** `summariseResponses` reads the form's responses through
`pageSubmissionsByForm`, a thousand at a time from where the last page ended (0222), counting each
into its version's summary as it reads it. The server holds a page of responses and the counts,
never the form's every response.

## Consequences

A form's summary costs the server memory in proportion to its questions, not its responses, and a
number question has its range and mean however many answer it.

**What it costs.**

- **One read per thousand responses** where there was one read of all of them, each an index range
  scan from where the last ended.
- **A summary read during a write is a summary of a list that moved.** A response stored while the
  pages are read is counted if its place comes after the page being read, and not if it comes
  before, so a count can be one short of a listing made a moment later. The single read was a
  snapshot.

**What it does not do.** The listing asked for no `limit` still answers every submission at once
(arc42 §11.2).

## Alternatives considered

- **Keep the array and find the bounds with a loop.** It fixes the throw, and keeps memory growing
  with every answer.
- **Read in one transaction, at one snapshot.** It would hold a connection, and its snapshot, open
  for as long as counting a large form takes.
