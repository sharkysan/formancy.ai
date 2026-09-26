# Working in this repository

## Every change keeps the documentation true

A change is not done until the documents that describe it say so. Update them
in the same pull request as the code, not in a follow-up:

- **User documentation** — `README.md` and `apps/docs` when behaviour, an API,
  a package or a command changes.
- **`CHANGELOG.md`** — a line under *Unreleased* for anything a user or
  integrator would notice, with the reason attached, not only the what.
- **`MIGRATIONS.md`** — when the spec version moves or stored data needs
  converting.
- **Decision records** (`docs/decisions/`) — a new record for every decision
  someone could helpfully undo, in the format `docs/decisions/README.md`
  describes: next free number, the cost paragraph, the alternatives, and a
  **Verified by** line naming the test or gate that fails if it is violated.
  Add it to the index in that README. A decision that changes an old one marks
  the old record `superseded by NNNN` or `reversed` rather than editing it
  away.
- **Architecture** (`docs/architecture/`, arc42) — the section the change
  touches: building blocks for a new package or module, the runtime view for a
  new flow, cross-cutting concepts, quality requirements, verification, and
  risks and debt for anything accepted rather than fixed.
- **Regulatory** (`docs/regulatory/`) — whenever a change affects what the
  software does wrong, how it is verified or what it depends on:
  - `SAFETY-ANALYSIS.md` for a new failure mode, or a new constraint or test
    against an existing one.
  - `SOUP-DECLARATION.md` for a new or changed runtime dependency, required
    environment, or known anomaly.
  - `LIFECYCLE.md` when the way work is done or verified changes (a new CI
    gate, a new kind of test).
  - `MDR-CONTEXT.md` only if the scope of what this set claims changes.

Keep the voice of the existing documents: say what it costs and what it does
not do, and never claim more than a test shows.

Counts written into prose go stale ("Forty records", "Forty-eight decision
records"). When the number of decision records, packages or tests changes,
search for it in `README.md`, `docs/README.md` and the site, or better, derive
it the way `apps/site/decision-records.ts` does.

## Checks before pushing

CI runs `pnpm build`, `pnpm typecheck`, `pnpm test:coverage` and
`pnpm check:pkg`. Run the ones for the packages you changed. The server's
integration tests need Docker and run in CI.
