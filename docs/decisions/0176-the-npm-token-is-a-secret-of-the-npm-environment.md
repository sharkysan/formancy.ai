# 0176 — The npm token is a secret of the `npm` environment, which only release tags reach

- **Status:** accepted
- **Date:** 2026-10-14
- **Deciders:** Daniel Bacher
- **Verified by:** `apps/docs/src/npm-token-environment.test.ts` — every job in every workflow
  that reads `secrets.NPM_TOKEN` names the `npm` environment, and at least one job reads it, so
  the rule cannot pass by reading nothing. Watched failing on `release.yml: release` before the
  job named the environment. The environment's deployment policy, that only `v*` tags reach it,
  is a repository setting and **nothing in the tree can read it**: it is written down, with the
  commands that set it, in `.github/REPO-METADATA.md`, and held by nothing else.

## Context

`release.yml` reads `NPM_TOKEN` from the repository's secrets. A repository secret is handed to
any workflow that asks for it, on any branch a collaborator pushes: a workflow added on a branch
could print the token, or publish with it, without a tag and without the release job. The
release job itself runs only on a `v*` tag; the token did not.

Formancy Data, which publishes the same way, moved its token into an environment on 2026-10-09
(its 0035); this repository had not, and the two drifted.

## Decision

`NPM_TOKEN` is a secret of the environment `npm`, whose deployment policy admits only tags
matching `v*`. The release job names the environment. A job that names it on any other ref is
refused before it starts, and a job that does not name it is given no environment secret at all.

## Consequences

**What it buys.** The token reaches a release and nothing else. A branch's workflow cannot read
it, whoever wrote the branch.

**What it costs.** Two repository settings — the environment and its tag policy — that nothing
in the tree can check; if someone widens the policy to "any branch", the test still passes. The
token's move has an order: the environment's secret is set before the repository's is deleted,
and only once this change is on `main`, or the next tag's release finds no token. A tag's release
now shows a deployment to `npm` in the repository's activity, which is noise and also a record.

**What it does not do.** It does not protect against anyone who may push a `v*` tag: they can
still publish, which is what a tag is for. It does not replace the token with npm's trusted
publishing, which `RELEASING.md` names as the better destination once a first release exists;
that would remove the secret altogether, and this would then be moot.

## Alternatives considered

**Keep the repository secret.** The release job only runs on a tag. Rejected: the risk is not the
release job but every other workflow on every other branch, which the repository secret reaches.

**Trusted publishing now.** No token at all. Deferred, not rejected: it is configured per package on
npmjs.com against a package that already exists, and is worth doing after the next release; when
it lands this record is superseded.

**Required reviewers on the environment.** A second person approves each release run. Not for one
maintainer: it would be the same person approving their own tag.
