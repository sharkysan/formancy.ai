# 0063 — A compose file for the published image, and no default version

- **Status:** accepted
- **Date:** 2026-09-26
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/server/src/compose.test.ts` (4 cases: every variable
  `.env.example` documents is passed through by both compose files, the optional
  challenge secret uses the spelling that leaves it absent rather than empty when
  unset, and a secret is mandatory in both files or in neither) and
  `packages/server/src/release-image.test.ts` (5 cases on the published file: it
  names the image the release pushes, refuses to run without a pinned version,
  does not build, keeps the secrets mandatory, and does not publish the database
  to every interface). Removing `FORMANCY_CHALLENGE_SECRET` from either compose
  file fails the first; so does the obvious-but-wrong `${FORMANCY_CHALLENGE_SECRET:-}`.
  Adding a `${FORMANCY_VERSION:-latest}` default fails the second.

## Context

The server image is built, pushed and signed by digest since
[the release workflow gained it](../../.github/workflows/release.yml), with a
CycloneDX attestation travelling alongside it. Nothing consumed it. `compose.yaml`
— the only compose file — declares `build: context: .`, so the documented way to
run formancy was to clone the repository and build the image that had just been
published for nobody.

The roadmap said the gap was "the one-command path a self-hoster expects", and
**that was wrong**: `docker compose up -d` had been that path for some time. The
actual gap was narrower and more embarrassing — the one-command path rebuilt from
source, so the signature, the attestation and the provenance were all decoration
for anybody following the instructions. A correction is in the roadmap rather
than a quiet edit, because the wrong sentence is the more instructive artefact.

Looking at what the compose files actually pass to the container turned up a
second thing, which is the one that settled the shape of this record.
**`.env.example` documents `FORMANCY_CHALLENGE_SECRET` in fourteen lines of
careful prose, and neither compose file passed it through.** A self-hoster putting
a public form on the internet reads that the proof-of-work challenge
([0059](0059-proof-of-work-not-a-captcha.md)) defends it, sets the secret in
`.env` as instructed, gets a server with the challenge off, and is told nothing.
The switch was documented and inert — the same failure as the rate limit whose
`timeWindowMs` key did nothing, and it survived because nothing connected the file
that documents the environment to the files that deliver it.

## Decision

**A second compose file, `compose.published.yaml`, which runs the published image
and does not build.** `compose.yaml` keeps `build:` and is right for somebody with
a checkout; the new one is for somebody with neither a checkout nor a build
toolchain, which is most people who want to run a product rather than work on it.

**`FORMANCY_VERSION` has no default**, and compose stops with a message naming an
example rather than starting something nobody chose. There is no `latest` tag to
fall back on: `SOUP-DECLARATION.md` tells a manufacturer to pin an exact version
and says `latest` is not characterised software, so a compose file that defaulted
to one would be this project contradicting its own advice in the most convenient
place to do it.

**Every variable `.env.example` documents is passed through by both files**, and a
test compares the two directions rather than trusting them to stay in step. A
commented-out line in `.env.example` is how that file spells *optional*, not *not
documented*, so the guard reads those too.

**The optional challenge secret is spelled as a bare key** —
`FORMANCY_CHALLENGE_SECRET:` with no value — and this was measured rather than
assumed, because the obvious spelling is wrong in a way that would have taken
every deployment down:

| Spelling | Set in `.env` | Unset |
|---|---|---|
| `${FORMANCY_CHALLENGE_SECRET:-}` | passed | **empty string** |
| `FORMANCY_CHALLENGE_SECRET:` | passed | absent |

The server refuses to start on a challenge secret shorter than 32 characters, and
an empty string is not `undefined` — so the interpolated spelling would refuse to
boot for everybody who never wanted a challenge. `docker compose run` in an alpine
container printed `ABSENT` for the bare key and an empty value for the other,
which is how the table above was arrived at rather than by reading documentation
about it.

## Consequences

**Two compose files to keep in step**, which is the real cost and is why the
agreement between them is tested rather than reviewed. The guard covers the things
that actually drift: the mandatory secrets, the loopback database bind, and the
pass-through list. It does not cover them being *identical*, because they are
deliberately not — one builds and one pins a version.

**The published path is the one that gets a signature to check.** A self-hoster
following `compose.yaml` builds their own bytes and has nothing to verify; one
following `compose.published.yaml` pulls bytes that cosign can attest to, and the
file says so with a pointer to the commands. That is the first time the signing
work is reachable by the person it was for.

**A documented environment variable now has somewhere to fail.** The narrower
lesson is the general one: the deployment files are a product surface, and the
only reason this particular hole lasted is that prose and YAML were maintained by
different hands on different days with nothing between them.

**The object store is still not in either file.** The design calls for Garage and
both files give a local volume, which does not survive more than one replica.
Recorded in the roadmap rather than fixed here, because it is a separate piece of
work and pretending otherwise would put a half-configured store in the file people
copy.

## Alternatives considered

**One compose file with a `build` profile, or `image:` plus `build:` together.**
Compose does support both keys on one service, building when `--build` is passed
and pulling otherwise. Rejected because the defaulting is the whole question: with
both keys present the file has to pick what happens when somebody types `docker
compose up` with no flags, and either choice is wrong for half the readers.
Two files each of which does one thing, and says which in its first line, costs a
guard and removes the ambiguity.

**Publishing a `latest` tag and defaulting to it.** Rejected for the reason above.
It is also the one change that would make the quickstart shorter, which is exactly
why it needs to be written down as refused rather than left to be rediscovered as
a convenience.

**Passing the challenge secret through unconditionally, with the server treating
an empty value as unset.** This would work, and is arguably a small improvement to
the server regardless — an empty environment variable is how most templating
layers spell *not set*. Rejected for now as the larger change: it alters the
server's contract for every variable rather than fixing the one file that was
wrong, and the bare key gets the correct behaviour with no code at all. Worth
revisiting if a Kubernetes chart hits the same edge, where an empty value is
harder to avoid.

**Documenting the missing variable in prose instead.** Which is what already
existed, and is what failed.
