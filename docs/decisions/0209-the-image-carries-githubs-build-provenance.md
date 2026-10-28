# 0209 — The image carries GitHub's build provenance, as the documents said it did

- **Status:** accepted
- **Date:** 2026-10-28
- **Deciders:** Daniel Bacher
- **Verified by:**
  - **`packages/server/src/release-image.test.ts`**, *makes the attestation RELEASING.md tells a
    verifier to check*: while `RELEASING.md` gives `gh attestation verify`, `release.yml` has a
    step running `actions/attest` whose subject is `ghcr.io/<owner>/formancy-server` at the digest
    the image step pushed, in a job with `attestations: write` and `id-token: write`. Watched
    failing against the workflow as it was, with no such step; and against three changes to the
    new one: the permission dropped, the digest read from a step that does not exist, and a tag
    put in the subject's name.
  - **Not yet on a runner.** The step first runs at the next tag. Until a release has run it, the
    test holds the step's shape, not that GitHub accepts it.

## Context

`RELEASING.md` said the server image "also carries GitHub's own build provenance — the same
statement the npm tarballs make", and gave `gh attestation verify` to check it. The release
workflow's comment on `provenance: mode=max` said the same.

`provenance: mode=max` is BuildKit's: an SLSA provenance document in an attestation manifest
inside the image's index, beside the image. It names the repository, the ref and the commit, and
it is not signed on its own; the cosign signature on the index's digest covers it, because the
index names it by digest. `gh attestation verify` does not read it. It asks GitHub's attestation
store for the digest, and the store had nothing: no step had ever made an artifact attestation.

Checked on 2026-10-28, verifying 0.8.0 after it was published: `gh attestation verify` answered
404 for every image in the registry, `v0.2.0` to `v0.8.0`, and `docker buildx imagetools inspect`
found BuildKit's provenance in all seven. So every instruction in that paragraph failed for every image
there has been, and no gate could have noticed, because the command runs only after a release
and only by hand.

## Decision

The release workflow attests the image's build provenance with `actions/attest`, by the digest the
image step pushed, kept in GitHub's attestation store, where `gh attestation verify` looks. Nothing
more is pushed to the registry. BuildKit's provenance stays. `RELEASING.md` says which images have
which, and gives `--repo` rather than `--owner`, which asks the organisations' endpoint and
answers 404 for a repository a user owns.

## Consequences

The documented check works from the first release after `0.8.0`, and a release that stops making
the attestation fails a test rather than a verifier's command, months later.

**What it costs.** One more step after `pnpm publish`, so one more way for a release to fail
after its packages are on npm and before its GitHub release exists — the position the image's
signing steps are already in, and the reason `hands GitHub a release body it will accept` exists.
The job gains `attestations: write`. And the step has not run yet: the first time it does is a
real release.

**What it does not do.** Images `v0.2.0` to `v0.8.0` stay without GitHub's attestation, since an
attestation is made by the run that built the image and those runs are over; their BuildKit
provenance and their cosign signatures are what they have. Nothing re-checks a published image —
`RELEASING.md`'s *Not covered yet* still says so.

## Alternatives considered

- **Correct the documents only**, saying the image carries BuildKit's provenance and how to read
  it. Honest, and it is what the documents now say of the older images. Lost because the npm
  tarballs and the image would then be checked two different ways, and BuildKit's document is not
  signed on its own: it is trusted through the index's cosign signature, which a reader has to
  know to check first.
- **`actions/attest-build-provenance`**, which `RELEASING.md`'s wording was written after. Since
  its version 4 it is a wrapper over `actions/attest`, and its own README sends a new use there.
- **`push-to-registry: true`**, a second copy of the attestation beside the image in GHCR. It also
  makes an artifact storage record, which GitHub makes only for an organisation's repository, and
  this one is a user's. Turning the record off would leave the copy alone, which nothing here
  reads: `gh attestation verify` finds the attestation in GitHub's store.
