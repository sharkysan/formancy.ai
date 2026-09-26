import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * Whatever the release pushes, it also signs.
 *
 * The npm side of a release has carried provenance and a cosign-signed SBOM for
 * some time; the container image was built in CI, proved to start, and then
 * thrown away. A self-hosted, security-adjacent product whose npm packages are
 * attested and whose *image* is not published at all is asking people to build it
 * themselves and calling that a supply chain.
 *
 * The failure this guards is the one that actually happens: somebody adds a push
 * and the signing lands in a later commit, or gets moved below a step that can
 * fail, and an unsigned image goes out looking exactly like a signed one. Nothing
 * about an unsigned image announces itself.
 *
 * Read as text rather than parsed as YAML on purpose: what matters is that the
 * step exists and is spelled the way cosign needs, and a parser would let a
 * `run:` block that says the wrong thing through.
 *
 * **Each assertion tests the property, not one spelling of it.** The first
 * version of this file looked for `--push` and for the digest on the same line as
 * `cosign sign`, and failed against a workflow that was correct on both counts —
 * it uses `push: true` and writes the command across a line continuation. That is
 * the third guard in this repository whose regex was the thing at fault, so the
 * alternatives are spelled out rather than assumed.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')
const release = readFileSync(join(repo, '.github', 'workflows', 'release.yml'), 'utf8')

describe('the release workflow', () => {
  test('is the file being checked, and publishes something', () => {
    // A guard on the guard: a renamed workflow would make everything below pass
    // for the wrong reason.
    expect(release).toContain('pnpm publish')
    expect(release.length).toBeGreaterThan(500)
  })

  test('pushes a container image', () => {
    // `push: true` is how build-push-action says it; the other two are how a
    // hand-written step would.
    expect(release).toMatch(/push:\s*true|docker\s+push|--push/)
  })

  test('signs the image it pushed, by digest', () => {
    expect(release).toContain('cosign sign')

    // By DIGEST, not by tag. A tag is mutable: signing `:v1.2.3` says nothing
    // about the bytes anybody later pulls under that name, and being about the
    // bytes is the entire point of the signature.
    //
    // Matched across the whole command rather than one line of it, because it is
    // written with a line continuation.
    const signing = /cosign sign(?![-\w])[\s\S]{0,400}/.exec(release)?.[0] ?? ''
    expect(signing).toMatch(/@sha256:|outputs\.digest|DIGEST/)
  })

  test('attaches the SBOM to the image, not only to the release page', () => {
    // The SBOM was already built and signed as a loose file on the GitHub
    // release. A file beside a download is a file somebody has to know to look
    // for; an attestation travels with the image and `cosign verify-attestation`
    // finds it without being told where it is.
    expect(release).toContain('cosign attest')
    expect(release).toMatch(/cyclonedx/i)
  })

  test('does not publish a mutable tag the documents tell people not to use', () => {
    // The SOUP declaration tells a manufacturer to pin an exact version and says
    // `latest` is not characterised software. Publishing one anyway would be the
    // project contradicting its own advice in the most convenient place to do it.
    const tags = /tags:[^\n]*\n?/g
    for (const match of release.match(tags) ?? []) {
      expect(match).not.toMatch(/:latest|latest\s*$/)
    }
  })

  test('says how to verify, where somebody cutting a release will see it', () => {
    // A signature nobody can check is decoration. The identity and issuer a
    // verifier has to pass are not guessable, so they belong next to the thing
    // that produced them.
    const releasing = readFileSync(join(repo, 'RELEASING.md'), 'utf8')
    expect(releasing).toContain('cosign verify')
    expect(releasing).toMatch(/certificate-identity|certificate-oidc-issuer/)
    // And verifying the IMAGE, not only the loose SBOM that was already there.
    expect(releasing).toMatch(/formancy-server@|verify-attestation/)
  })
})
