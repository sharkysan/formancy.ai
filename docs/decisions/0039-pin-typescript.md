# 0039 — Pin TypeScript to the range Angular accepts

- **Status:** accepted
- **Date:** 2026-09-19
- **Deciders:** Daniel Bacher
- **Verified by:** the pin lives in the `catalog:` block of
  `pnpm-workspace.yaml`, with its reason in a comment beside it, and `.npmrc`
  sets `strict-peer-dependencies=true`, so raising it past Angular's declared
  range makes `pnpm install` fail rather than warn. CI runs
  `pnpm install --frozen-lockfile` as its first step, so the job stops there
  instead of failing later in something harder to read.

## Context

TypeScript `latest` on npm is 7.0.2, the native port. `@angular/compiler-cli`
22.1.7 declares `"typescript": ">=6.0 <6.1"` among its peer dependencies and
rejects it. This is not a case where one package can be held back on its own:
the Angular binding and the isomorphic packages beneath it are typechecked
together, against one compiler.

## Decision

Pin `typescript` to `~6.0.3` in the pnpm catalog, with the reason written in a
comment next to the pin so nobody has to rediscover it.

The catalog is what makes this a single decision rather than eleven. Every
manifest that needs TypeScript references `catalog:` instead of a version, so
the version exists in one place and the packages cannot drift apart.

## Consequences

**What it buys.** One compiler across the workspace, one place to change it, and
an install that refuses rather than a build that misbehaves when someone tries.

**What it costs.** The repository cannot use TypeScript 7 features and cannot
benefit from the native compiler's speed until Angular widens its range. That
cost is paid by every package, including the ones that have nothing to do with
Angular and would compile happily under 7.x today. It is a direct and ongoing
consequence of the co-first Angular commitment
([0007](0007-react-and-angular-first.md)), and the kind of constraint worth
recording precisely because it will look arbitrary in six months, when 7.x is
unremarkable and this comment is the only thing that explains why formancy is
behind.

## Alternatives considered

**Take TypeScript 7 and let the Angular package lag on 6.0.** Rejected. The
packages typecheck against each other, so a second compiler version is a second
set of emitted declarations to keep compatible, and the isomorphic packages
would have to remain 6.0-compatible anyway for Angular to consume them. The
split buys the newer compiler only where it is least needed.

**Loosen `strict-peer-dependencies` and install 7.x regardless.** Rejected. It
converts a stated incompatibility into an unstated one, and the failure would
reappear as a compiler-cli crash rather than an install error.
