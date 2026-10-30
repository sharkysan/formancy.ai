# 0223 — A form's responses are summarised on the server, and the admin reads them a page at a time

- **Status:** accepted
- **Date:** 2026-10-30
- **Deciders:** Daniel Bacher
- **Supersedes in part:** [0206](0206-a-forms-responses-are-summarised-by-question.md), which
  counted in the browser, from every submission the admin fetched
- **Builds on:** [0222](0222-submissions-are-listed-a-page-at-a-time.md), the listing a page at a
  time
- **Verified by:**
  - **`packages/server-core/src/response-summaries.test.ts`**:
    - *are one summary per version that has responses, newest first, each against its own
      questions*, which failed with every version counted against the newest one's document;
    - *say a tick box in the language of the version's document*: *Ja* and *Nein*;
    - *leave out a version nobody answered*;
    - *are none for a form there is none of*.
  - **`packages/server/src/server.integration.test.ts`**, on real PostgreSQL, *the summary counts
    every response, a version at a time, newest first*: as many responses in all as the listing
    has, and 404 for an unknown form.
  - **`apps/admin/src/workspace.test.tsx`**:
    - *the current version's responses are summarised question by question*: the pane draws
      the server's 41 responses to version 1, where the listing it was handed holds one, and it
      asked `/f/contact/summary`. This failed while the pane counted what it had listed.
    - *submissions are listed a page at a time, the next when asked for*: one page asked for, a
      second only on *Show more submissions*, and no button after the last. This failed while
      the pane asked for every submission.

## Context

0206 counted a form's responses by question in the admin, from every submission the listing handed
over, and said a form with very many responses would want the server to count. 0207 drew one
summary per version, against that version's document. 0222 let the listing hand over a page at a
time, but the admin still asked for every submission, because its summary needed all of them.

## Decision

**The server counts: `GET /f/:path/summary`**, behind `submission.read`, answers one summary per
version that has responses, newest first. Each is that version's number, how many responses it has,
and its questions as `summariseAnswers` says them. That is the function the admin called, from
`@formancy/core/summary`, against the version's own document and in that document's language, with
the words from `createFormText`. The counting rules are written once, and the server runs the code
the browser ran. The read is audited as `submission.read`, with the count, since the counts are
drawn from people's answers.

**The admin draws what the server counted**, and lists submissions a page at a time: fifty, newest
first, and the next fifty when the person presses *Show more submissions*. It fetches each version's
document once, as that version's first submission arrives.

## Consequences

The admin no longer reads every submission of a form to show it, and its summary counts every
response, not only those it has listed.

**What it costs.**

- **The server reads every submission of the form to count them**, into its memory, as it read
  them to list them all. What leaves it is the counts, a few lines per question, where the admin
  was sent every answer. Counting as it reads, a page at a time, would bound the memory too, and
  `summariseAnswers` takes the whole list today.
- **A second request** when the submissions pane opens, for the summary beside the first page.
- **A host's own client** that counted from the full listing can keep doing so: the listing without
  `limit` is unchanged (0222).

**What it does not do.**

- **The summary is the document's language's**, as it was in the admin. There is no `?locale=`;
  the admin reads one language.
- **Nothing is cached.** Each opening of the pane counts again.

## Alternatives considered

- **Count in SQL**, as 0206 considered. Faster, and a second reading of answers beside the engine's:
  the rules for what counts as answered would be written twice, in two languages.
- **Keep counting in the browser over pages it has fetched.** The summary would say only what the
  person had scrolled to, and it would change as they asked for more.
- **One endpoint per version**, `/f/:path/versions/:version/summary`. The pane wants every version's
  at once, and would first have to learn which versions have responses.
