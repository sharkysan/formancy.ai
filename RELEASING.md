# Releasing

Releases are cut by [`.github/workflows/release.yml`](.github/workflows/release.yml)
and nowhere else. A release built on a laptop cannot carry provenance — the
attestation is a statement *by GitHub* about which workflow, at which commit,
produced a tarball, and only the workflow can make it.

## Cutting one

```bash
# 1. Bump every package to the new version (one number across all of them)
node scripts/bump.mjs 0.3.0     # or edit the manifests

# 2. Write the entry in CHANGELOG.md, including what is knowingly missing

# 3. Verify locally — the workflow runs these again, but finding out here is cheaper
pnpm build && pnpm typecheck && pnpm test && pnpm check:pkg
pnpm lint && pnpm format:check
node scripts/verify-licenses.mjs

# 4. Commit, tag, push
git commit -am "Release 0.3.0"
git tag -a v0.3.0 -m "formancy 0.3.0"
git push origin main --follow-tags
```

Pushing the tag is what starts the release. Everything after that is the
workflow's job.

## What the workflow does

1. **Refuses a tag that disagrees with the manifests.** A tag saying `v0.2.0`
   on a tree saying `0.1.0` would publish the wrong version under the right
   name, which cannot be fixed afterwards.
2. **Runs the full gate** — build, typecheck, the lint rules and the format
   ([0225](docs/decisions/0225-the-four-repositories-lint-and-format-by-one-set-of-rules-published-here.md)), test, `check:pkg`. A release must not be the first time these
   run against this tree.
3. **Refuses to publish a tarball without its licence.** See below.
4. **Generates a CycloneDX SBOM of what a consumer installs**, and refuses to
   publish when it leaves out a package the release publishes or a dependency
   one declares. See below.
5. **Publishes to npm with provenance.**
6. **Signs the SBOM with cosign**, keylessly.
7. **Creates the GitHub release** with both attached.

## Provenance

`pnpm publish --provenance` under `id-token: write` makes npm record a
[sigstore](https://www.sigstore.dev/) attestation binding each tarball to the
workflow run, the commit and the repository that built it. npm shows it as a
verified badge, and anyone can check it:

```bash
npm audit signatures
```

**Wait for the registry before checking.** A package the run says it published can be missing from
npm for minutes afterwards: on 2026-10-30, `v0.11.0`'s run published all sixteen at 14:29–14:30
UTC, and `@formancy/builder-core@0.11.0` was listed about five minutes after the others, with
`npm install` of it failing `ETARGET` until then. `npm cache clean` does not help; the registry's
own document for the package is what lags. Ask it directly, and install once every package is
listed:

```bash
curl -s https://registry.npmjs.org/@formancy%2fbuilder-core | grep -c '"0.11.0"'
```

This is the signing story for the packages themselves. There is no private key,
because there is no key at all — the identity is the workflow's OIDC token,
which cannot be leaked or lost.

**Requirements**: the repository is public, every manifest carries a
`repository` field matching it, and publishing happens from GitHub Actions. All
three are in place.

### The token, which is the part that bites

The only secret is `NPM_TOKEN`, and **its type matters more than its
permissions**.

It is a secret of the **`npm` environment**, not of the repository
([0176](docs/decisions/0176-the-npm-token-is-a-secret-of-the-npm-environment.md)).
A repository secret is handed to any workflow, on any branch a collaborator
pushes, that asks for it; an environment's only to a job that names the
environment, and the `npm` environment's deployment policy admits `v*` tags
alone. The release job names it, and
`apps/docs/src/npm-token-environment.test.ts` fails when a job reads the token
without naming it. The environment and its policy are repository settings,
written down in [`.github/REPO-METADATA.md`](.github/REPO-METADATA.md) with
the commands that set them; nothing in the tree can read them.

npm accounts set to `auth-and-writes` two-factor authentication demand a
one-time password for every publish. A classic **Publish** token does not
bypass that, so CI fails with:

```
Error: ERR_PNPM_OTP_NON_INTERACTIVE
  × The registry requires additional authentication, but pnpm is not running
  │ in an interactive terminal
```

— and it fails *after* the whole gate has run, because publishing is the last
thing that happens. Use one of these instead, both of which bypass 2FA:

- a classic **Automation** token, or
- a **Granular Access Token** with read-and-write on the `@formancy` scope.

Neither can be created from the CLI — `npm token create` only offers
`--read-only` and `--cidr`. They are made at
[npmjs.com/settings/~/tokens](https://www.npmjs.com/settings/~/tokens).

A preflight step checks the token authenticates before anything is built, and
warns if the account enforces 2FA on writes, so this is a ten-second failure
rather than an eight-minute one.

### Trusted publishing, which pnpm tries before the token

pnpm tries npm's **trusted publishing** first, and falls back to `NODE_AUTH_TOKEN`. Every
published package trusts one publisher: a run of `release.yml` in `sharkysan/formancy.ai`, in
the `npm` environment ([0230](docs/decisions/0230-every-package-trusts-the-release-workflow-in-the-npm-environment-to-publish-it.md)),
read back for each with `npm trust list` on 2026-11-01. Before then each release
logged this and published with the token:

```
[WARN] Skipped OIDC: ERR_PNPM_AUTH_TOKEN_EXCHANGE: Failed token exchange
request with body message: Unknown error (status code 404)
```

No release has published through trusted publishing yet, so the token stays, and the step
that checks it still fails a release without it, before anything is built. The next release
shows whether the exchange works: its log without that warning, and the registry's record of
who published each version, which for 0.12.0 is the maintainer's account:

```bash
npm view @formancy/core@0.12.0 _npmUser
```

Once a release has, the token can go, and with it that step and the environment's secret; a
package the registry has not seen then needs one for its first release (below). It has a
date: npm's notice links a changelog of GitHub's, of 2026-07-31, by which a token that skips
two-factor authentication is to lose direct publishing, with January 2027 as the target.

npm trusts the workflow by its file name and the environment by its name, so renaming either
makes a release a stranger to it. `apps/docs/src/npm-token-environment.test.ts` fails when the
job that publishes is not in `release.yml`, does not name the environment, or cannot ask for
an OIDC token; it cannot read what npm was told.

**Setting it up for a package** takes an owner's npm login and npm 11 or later, on a Node
version that npm supports:

```bash
npm trust github @formancy/<name> --file release.yml --repo sharkysan/formancy.ai --env npm --allow-publish
npm trust list @formancy/<name>
```

Run it in a terminal. Each package asks for its own two-factor approval at a link the command
prints, and the link lasts about five minutes: sixteen created at 18:44:07 on 2026-11-01
expired, unapproved, at 18:49:19. Without a terminal the command fails `EOTP` rather than
wait. npm reads the result back as `publish, stage publish`, although the command asked for
publishing alone.

**A package the registry has not seen** has no trusted publishing to set up, so its first
release publishes it with the token, whatever the others use by then. For that release the
token must be one that may create a package in the `@formancy` scope, not only write the
packages it names; and trusted publishing for the new package can be set up only after it.
`@formancy/code-style` was the last: the registry answered 404 for it before the tag on
2026-10-31, and 0.12.0's release published it that day. Its trusted publishing was set up
with the others' on 2026-11-01.

**A new package needs no placeholder published by hand: the registry makes one.** On a new
package's first publish the registry lists a version `0.0.0-stage`, described as "Temporary
package placeholder for staged publishing", under the token's account and with no
attestation, before the release's own version. 0.12.0's run logged
`@formancy/code-style@0.12.0` as published at 17:23:13 UTC, the second the registry created
`0.0.0-stage`, and the registry listed `0.12.0` at 17:24:08, read from it on 2026-11-01.
`@formancy/cli` has one too, from two minutes before 0.8.0's version on 2026-10-28, which
this section once said nothing here explained. It is a prerelease below every release, so no
pinned version or range a host asks for resolves to it, and `latest` names the release.

## The SBOM

CycloneDX, generated by `cdxgen`, attached to the GitHub release and signed.

It describes what a consumer installs
([0187](docs/decisions/0187-the-sbom-describes-what-a-consumer-installs.md)).
Before publishing, the workflow packs the packages it is about to publish with
`scripts/pack.mjs`, the helper the install gates use; installs those tarballs
with npm into a project of their own under `RUNNER_TEMP`, outside the checkout,
with `--ignore-scripts`, so no package's install script runs, and
`--legacy-peer-deps`, so no peer is installed; and runs cdxgen with
`--required-only` over that project.

`scripts/sbom.mjs` then reads it, and the release stops before anything is
published when it:

- does not name a package the release publishes, at the release's version;
- does not give a published package, in its dependency graph, a dependency the
  package's manifest declares, or gives it one at a version it does not name, or
  a sibling at another release's version;
- gives no published package the CEL evaluator, `@marcbachmann/cel-js`, which
  decides whether a submission is valid, whatever the manifests declare.

**Until 0187 this section described an SBOM the release did not make.** It
was cdxgen over the pnpm workspace, which this section said "keeps every runtime
dependency and drops the test tooling — about 71 components instead of 1067".
`0.6.0`'s SBOM, read from its release page on 2026-10-21, has 109 components: it
names none of the packages it released, marks Playwright, TypeScript, Vite,
ng-packagr, `@angular/build` and the Testing Library packages as required, and
names no tslib, which both Angular packages depend on. Its one check, the CEL
evaluator somewhere among its package URLs, passed. Made the new way from
`main` on the same day, still at `0.6.0`, it has 199 components, none of them a
test tool.

**From the release that first publishes `@formancy/code-style`, it names lint tooling**
([0225](docs/decisions/0225-the-four-repositories-lint-and-format-by-one-set-of-rules-published-here.md)). The package is published like any other, so the SBOM is made with it
installed, and what its manifest declares is installed beside it and named as required:
`@eslint/js`, typescript-eslint with its parser and plugin, the React hooks plugin with the
Babel it parses with, the plugin for disable comments and `globals`, and what each of those
depends on. ESLint, Prettier and TypeScript are its peers, and the SBOM names no peer.
Nothing a form, a builder or the server runs imports any of it: it is what a repository lints
with ([`SOUP-DECLARATION.md`](docs/regulatory/SOUP-DECLARATION.md) says the same).

What it does not say:

- **No peer.** Not React or Angular, which the host brings at versions of its
  own, and not `@tiptap/extension-list`, which three of `@formancy/tiptap`'s list
  extensions ask for as a peer and a consumer's npm installs.
- **Versions on the day.** The install has no lockfile, as a consumer's has
  none, so each version is the one npm resolved during the release run — not
  necessarily the lockfile's, which the server image is built from. See *Not
  covered yet*.
- **No platform binary.** `--required-only` leaves out what npm marks optional,
  so it names `@node-rs/argon2` and not the native package a platform installs.

Note when reading it: CycloneDX splits an npm scope across `group` and `name`,
so `@noble/hashes` appears as `{"group": "@noble", "name": "hashes"}`. Search
the `purl`, not the name.

Verifying the signature:

```bash
cosign verify-blob \
  --bundle formancy-v0.2.0-sbom.cdx.json.sigstore \
  --certificate-identity-regexp 'https://github.com/sharkysan/formancy\.ai/.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  formancy-v0.2.0-sbom.cdx.json
```

## The server image

Published to GHCR on every release, signed by digest, with the SBOM attached as
an attestation:

```
ghcr.io/sharkysan/formancy-server:v0.2.0
```

**There is deliberately no `latest`.** The SOUP declaration tells a manufacturer
to pin an exact version and says in as many words that `latest` is not
characterised software. Publishing one anyway would be this project
contradicting its own advice in the most convenient place to do it — so a
deployment names a version, and finds out about a new one by reading the
changelog rather than by restarting.

Verifying the image. Note the **digest**: the signature is about the bytes, and a
tag is mutable, so verifying `:v0.2.0` would only ever tell you what that name
pointed at when you asked.

```bash
digest=$(crane digest ghcr.io/sharkysan/formancy-server:v0.2.0)

cosign verify   --certificate-identity-regexp 'https://github.com/sharkysan/formancy\.ai/.*'   --certificate-oidc-issuer https://token.actions.githubusercontent.com   "ghcr.io/sharkysan/formancy-server@${digest}"
```

And reading the SBOM out of the image itself, rather than finding the file on the
release page:

```bash
cosign verify-attestation   --type cyclonedx   --certificate-identity-regexp 'https://github.com/sharkysan/formancy\.ai/.*'   --certificate-oidc-issuer https://token.actions.githubusercontent.com   "ghcr.io/sharkysan/formancy-server@${digest}"
```

From `0.9.0`, the release attests the image with GitHub's own build provenance —
the same statement the npm tarballs make, that this workflow at this commit produced
these bytes. `v0.9.0`'s tag was the first run of that step, and GitHub's attestation API lists a
SLSA v1 provenance for that image's digest, from `release.yml` at `refs/tags/v0.9.0`, read on
2026-10-29. `--repo`, not `--owner`: the owner form asks the organisations' endpoint, and this
repository belongs to a user.

```bash
gh attestation verify --repo sharkysan/formancy.ai   "oci://ghcr.io/sharkysan/formancy-server@${digest}"
```

**No image up to `v0.8.0` has one, though this section said they did**
([0209](docs/decisions/0209-the-image-carries-githubs-build-provenance.md)). The
command answered 404 for every image, `v0.2.0` to `v0.8.0`, on 2026-10-28:
`provenance: mode=max` had made BuildKit's provenance, not GitHub's. Every one of them
has that, an SLSA document in an attestation manifest inside its index, naming the
repository, ref and commit it was built from. It is not signed on its own; the
cosign signature above is on the index's digest, and the index names it by digest,
so verify that first and then read it:

```bash
docker buildx imagetools inspect "ghcr.io/sharkysan/formancy-server@${digest}" \
  --format '{{json .Provenance}}'
```

## Licences

Apache-2.0 section 4(a) requires a copy of the licence to travel with the work,
and 4(d) requires the NOTICE file. The `license` field in `package.json` is a
claim *about* the terms, not the terms.

`scripts/sync-licenses.mjs` copies both from the repository root into every
publishable package during `pnpm build` — including Angular's `dist/`, which is
what it packs from. The copies are gitignored, so the root files stay the only
source of truth.

`scripts/verify-licenses.mjs` then refuses to publish if either is missing,
because the failure is otherwise silent: `npm publish` will happily ship a
tarball with neither, and the first person to notice is whoever audits the
dependency months later. npm always includes a `LICENSE` whatever `files` says;
it does **not** do that for `NOTICE`, so both are listed explicitly.

## Not covered yet

**The container image's SBOM describes npm and nothing else.** `cosign attest`
attaches the same CycloneDX document the release page carries, which is made from the
published tarballs as a consumer installs them — so it says nothing about the base image
or its system packages, and its npm versions are the ones a consumer resolved on the
release day, not the lockfile's the image was built from: on 2026-10-21 it named fastify
5.12.7 where the image would hold 5.12.5. A manufacturer characterising the container
needs both layers at the image's versions; this covers the npm layer, at a consumer's.
Listed as debt in [§11](docs/architecture/11-risks-and-debt.md).

**Nothing verifies a release after it is published.** Every check above runs
*before* publishing, inside the workflow that publishes. There is no job that
installs the published tarballs from the registry and runs anything against them, so
"the tarball on npm works" rests on `check:pkg` having passed against the tree it was
built from. `pnpm test:e2e:install` through a local Verdaccio is the intended answer
and is not built.

*This section previously said there was no container image to sign, while the section
above it explained how the image is signed and how to verify it. The image shipped and
the caveat stayed — which is the failure the whole documentation policy exists to
prevent, in the document about shipping.*
