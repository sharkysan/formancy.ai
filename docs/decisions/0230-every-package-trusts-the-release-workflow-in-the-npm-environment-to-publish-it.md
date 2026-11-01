# 0230 — Every package trusts the release workflow, in the `npm` environment, to publish it

- **Status:** accepted
- **Date:** 2026-11-01
- **Deciders:** Daniel Bacher
- **Verified by:** `apps/docs/src/npm-token-environment.test.ts`, *npm's trusted publisher*: the
  only job whose commands publish is in `release.yml`, names the `npm` environment and may ask for
  an OIDC token. Watched failing with the file renamed, with the environment removed, with
  `id-token: write` taken away, and with a publishing step added to `ci.yml`; it first failed on a
  comment in `ci.yml` that names `npm publish`, and reads commands alone since. npm's half, what
  each package trusts, is held by the registry and **nothing in the tree can read it**: `npm trust
  list` needs an owner's login. Read with it for every published package on 2026-11-01:
  GitHub Actions, `sharkysan/formancy.ai`, `release.yml`, environment `npm`.

## Context

A release publishes with `NPM_TOKEN`, a token that publishes without a one-time password, held as
a secret of the `npm` environment, which only `v*` tags reach (0176). 0176 named npm's trusted
publishing as the better destination and deferred it: it is configured per package, on the
registry, against a package that already exists. Every release's log carried pnpm's
`Skipped OIDC … (status code 404)`: pnpm tries trusted publishing first, found none, and fell back
to the token.

Two things changed. `@formancy/code-style`, the last package the registry had not seen, was
published by 0.12.0 on 2026-10-31, so every package exists. And npm printed, on every command on
2026-11-01, that "npm tokens that bypass 2FA are being restricted for account changes and direct
publishing", which is the kind of token the release publishes with. The changelog it links
(GitHub's, of 2026-07-31) says such a token is to lose direct publishing, with January 2027 as the
target date, keeping only staging a publish that a maintainer approves with two-factor
authentication, and advises moving automated publishing to trusted publishing or to staged
publishing.

## Decision

Every published package trusts one publisher: a GitHub Actions run of `release.yml` in
`sharkysan/formancy.ai`, in the environment `npm`. The token stays, as what pnpm falls back to,
until a release has published through trusted publishing; taking it out is then its own change,
which supersedes 0176.

## Consequences

**What it buys.** A release can publish with no secret at all: npm exchanges the run's OIDC token
for a short-lived one that publishes the package it trusts, for that run alone. The environment's
tag policy reaches it too: a run outside the `npm` environment is no trusted publisher, and only
a `v*` tag reaches the environment (0176).

**What it costs.** Two halves that must agree, and only one of them is in the tree. npm trusts the
workflow by its file name and the environment by its name: renaming either makes a release a
stranger to npm. The test holds that the tree keeps both names, and cannot hold that npm was told
them. Setting it up costs an owner's two-factor approval per package, and the approval link
`npm trust github` prints lasted about five minutes: sixteen created at 18:44:07 on 2026-11-01
expired, unapproved, at 18:49:19. A package the registry has not seen cannot be configured, so a
new package's first release publishes with a token. npm's read-back lists `publish, stage publish`
for each package, although the command asked for publishing alone (`--allow-publish`); this
repository does not stage. And until the token is removed this buys little against a leak: the
token still publishes.

**What it does not do.** It does not remove the token, or the step that fails a release without it
before anything is built. It does not show that the exchange works: no release has published
through it yet. The next release's log is what will, without pnpm's `Skipped OIDC` warning, and so
is the registry's record of each version's publisher, which for 0.12.0 is the maintainer's
account, `sharkysan`, read with `npm view @formancy/core@0.12.0 _npmUser` on 2026-11-01.

## Alternatives considered

**Keep the token alone.** Rejected: a token that skips two-factor authentication is to lose
direct publishing, which is how a release publishes, from January 2027 by the changelog's target,
and a token is a secret to rotate and to leak.

**Staged publishing.** The other way the changelog advises: the release stages each version and a
maintainer approves it with two-factor authentication. Rejected: a person's approval after every
tag, for what a workflow's identity does unattended.

**Remove the token in the same change.** Rejected for now: nothing here has seen the exchange
work, and a release that finds out it does not fails at publishing, after its whole gate has run.

**Trust `release.yml` without naming the environment.** Rejected: a run of `release.yml` from any
branch, its trigger edited there, would then be trusted, and the tag policy that keeps the token
from branches would not keep trusted publishing from them.

**Configure each package on npmjs.com's settings page.** The same configuration, typed seventeen
times into a form. `npm trust github` takes the same values on one line per package, and
`npm trust list` reads them back.
