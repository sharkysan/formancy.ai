import { readFileSync } from 'node:fs'
import { releaseNotes } from '../../../scripts/release-notes.mjs'
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

/**
 * The commands of a step's `run: |` block, line continuations joined, each with the
 * directory it runs in: the checkout, or the step's `working-directory`, until a `cd`
 * moves it. Quotes are dropped from the words, so `"${RUNNER_TEMP}"/x/*.tgz` reads
 * `${RUNNER_TEMP}/x/*.tgz`. Enough shell to follow where a command runs, and no more.
 */
function shell(step: string): { cwd: string; words: string[] }[] {
  const lines = step.split('\n')
  const at = lines.findIndex((line) => /^\s+run:\s*\|\s*$/.test(line))
  if (at === -1) return []
  const indent = /^ */.exec(lines[at + 1] ?? '')![0].length
  const body: string[] = []
  for (const line of lines.slice(at + 1)) {
    if (line.trim() !== '' && /^ */.exec(line)![0].length < indent) break
    body.push(line.slice(indent))
  }
  let cwd = /working-directory:\s*(\S+)/.exec(step)?.[1] ?? '${GITHUB_WORKSPACE}'
  const commands: { cwd: string; words: string[] }[] = []
  for (const command of body
    .join('\n')
    .replace(/\\\n\s*/g, ' ')
    .split(/\n|&&|;/)) {
    const words = command
      .trim()
      .split(/\s+/)
      .filter((word) => word !== '')
      .map((word) => word.replace(/["']/g, ''))
    if (words.length === 0 || words[0]!.startsWith('#')) continue
    if (words[0] === 'cd') cwd = words[1] ?? '~'
    else commands.push({ cwd, words })
  }
  return commands
}

describe('the release workflow', () => {
  test('is the file being checked, and publishes something', () => {
    // A guard on the guard: a renamed workflow would make everything below pass
    // for the wrong reason.
    expect(release).toContain('pnpm publish')
    expect(release.length).toBeGreaterThan(500)
  })

  test('hands GitHub a release body it will accept', () => {
    /*
     * Found in the preflight for 0.2.0, before the tag was pushed. `body_path` pointed
     * at `CHANGELOG.md` entire: 164,422 characters against GitHub's documented limit of
     * 125,000 for a release body. The API answers 422 and the step fails.
     *
     * Where it fails is the whole problem. Creating the release is the LAST step, after
     * fourteen packages are on npm and the signed image is in the registry — neither of
     * which can be taken back, and a version number can never be reused. The release
     * carrying the SBOM would simply not exist, which is the one artefact a manufacturer
     * characterising this software is told to fetch.
     *
     * So: the body is the section for this version, and the size is measured rather
     * than assumed. This asserts the file the workflow actually names, so pointing it
     * back at the changelog fails here rather than on the release run.
     */
    const LIMIT = 125_000

    const named = /body_path:\s*(\S+)/.exec(release)?.[1]
    expect(named, 'the workflow names no release body').toBeDefined()

    if (named === 'CHANGELOG.md') {
      throw new Error('the release body is the whole changelog; GitHub refuses a body over 125,000 characters, and it refuses it after npm has published')
    }

    // The body is written by a step rather than committed, so what is checked is the
    // generator and the section it will produce for the version being released.
    const version = JSON.parse(readFileSync(join(repo, 'packages', 'core', 'package.json'), 'utf8')).version as string
    const notes = releaseNotes(readFileSync(join(repo, 'CHANGELOG.md'), 'utf8'), version)

    // A guard on the guard: an extractor returning nothing would be under the limit.
    expect(notes.length).toBeGreaterThan(200)
    expect(notes).toContain(version)
    expect(notes.length).toBeLessThan(LIMIT)

    // And the workflow runs that same extractor, rather than a second one that agrees
    // with this only today.
    expect(release).toContain('scripts/release-notes.mjs')
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

  test('makes the SBOM from what a consumer installs, and checks it before publishing', () => {
    /*
     * cdxgen over the pnpm workspace described the workbench: 0.6.0's SBOM named none of
     * the packages it released, marked Playwright, TypeScript and Vite as required, and
     * left out tslib, which both Angular packages depend on (0187). So the step packs
     * what the release publishes with the helper the install gates use, installs those
     * tarballs with npm in a project of their own outside the checkout -- no lifecycle
     * script, no peer -- and runs cdxgen over that, and `scripts/sbom.mjs` checks the
     * result. All of it before `pnpm publish`: a refusal after it stopped a release
     * whose version was already on npm, without its SBOM, image or GitHub release.
     *
     * Where cdxgen runs is followed through the step's `cd`s rather than looked for as a
     * phrase: a step that installed under RUNNER_TEMP and then ran cdxgen over the
     * checkout would hold every phrase and describe the workspace again.
     */
    const steps = release.split(/\n(?= {6}- )/)
    const sbomAt = steps.findIndex((step) => step.includes('@cyclonedx/cdxgen'))
    const checkAt = steps.findIndex((step) => step.includes('scripts/sbom.mjs'))
    const publishAt = steps.findIndex((step) => /\bpnpm publish\b/.test(step))
    expect(sbomAt, 'no step runs cdxgen').toBeGreaterThan(-1)
    expect(publishAt, 'no step publishes').toBeGreaterThan(-1)
    expect(checkAt, 'no step runs scripts/sbom.mjs after cdxgen').toBeGreaterThan(sbomAt)
    expect(checkAt, 'the SBOM is checked after publishing').toBeLessThan(publishAt)

    const commands = shell(steps[sbomAt]!)
    const packed = commands.find(({ words }) => words[0] === 'node' && words[1] === 'scripts/pack.mjs')
    const install = commands.find(({ words }) => words[0] === 'npm' && ['install', 'i', 'ci'].includes(words[1]!))
    const cdxgen = commands.find(({ words }) => words.some((word) => word.startsWith('@cyclonedx/cdxgen')))
    expect(packed, 'the step packs nothing with scripts/pack.mjs').toBeDefined()
    expect(install, 'the step installs nothing with npm').toBeDefined()
    expect(cdxgen).toBeDefined()

    // The tarballs it installs are the ones it packed.
    const tarballs = packed!.words[2]!
    expect(install!.words.some((word) => word.startsWith(`${tarballs}/`) && word.endsWith('.tgz'))).toBe(true)
    // As a consumer installs them, with no install script run and no peer, the host's.
    expect(install!.words).toContain('--ignore-scripts')
    expect(install!.words.some((word) => word === '--legacy-peer-deps' || word === '--omit=peer')).toBe(true)
    // Into a directory outside the checkout, which cdxgen then reads, required only.
    expect(install!.cwd).toMatch(/RUNNER_TEMP|runner\.temp/)
    const target = cdxgen!.words.at(-1) === '.' ? cdxgen!.cwd : cdxgen!.words.at(-1)
    expect(target).toBe(install!.cwd)
    expect(cdxgen!.words).toContain('--required-only')
  })

  test('attaches the SBOM to the image, not only to the release page', () => {
    // The SBOM was already built and signed as a loose file on the GitHub
    // release. A file beside a download is a file somebody has to know to look
    // for; an attestation travels with the image and `cosign verify-attestation`
    // finds it without being told where it is.
    expect(release).toContain('cosign attest')
    expect(release).toMatch(/cyclonedx/i)
  })

  test('makes the attestation RELEASING.md tells a verifier to check', () => {
    // RELEASING.md said the image carried GitHub's own build provenance and gave
    // `gh attestation verify` to check it, and no step made one: `provenance: mode=max` is
    // BuildKit's, kept in the image's index, which that command does not read. It answered
    // 404 for every image from v0.2.0 to v0.8.0 on 2026-10-28. The command is an
    // instruction only while a step makes what it looks for: `actions/attest`, about the
    // digest the image step pushed, in a job allowed to write attestations.
    const releasing = readFileSync(join(repo, 'RELEASING.md'), 'utf8')
    expect(releasing).toContain('gh attestation verify')

    const steps = release.split(/\n(?= {6}- )/)
    const image = steps.find((step) => step.includes('docker/build-push-action'))
    const imageId = /\bid:\s*(\S+)/.exec(image ?? '')?.[1]
    expect(imageId, 'the step that pushes the image has no id to read its digest by').toBeDefined()

    const attest = steps.find((step) => /uses:\s*actions\/attest(?:-build-provenance)?@/.test(step))
    expect(attest, 'no step runs actions/attest').toBeDefined()
    expect(attest).toMatch(new RegExp(`subject-digest:\\s*\\$\\{\\{\\s*steps\\.${imageId}\\.outputs\\.digest\\s*\\}\\}`))
    expect(attest).toMatch(/subject-name:\s*ghcr\.io\/\$\{\{\s*github\.repository_owner\s*\}\}\/formancy-server\s*$/m)
    expect(release).toMatch(/^\s+attestations:\s*write\b/m)
    expect(release).toMatch(/^\s+id-token:\s*write\b/m)
  })

  test('does not publish a mutable tag the documents tell people not to use', () => {
    // The SOUP declaration tells a manufacturer to pin an exact version and says
    // `latest` is not characterised software. Publishing one anyway would be the
    // project contradicting its own advice in the most convenient place to do it.
    //
    // The first version matched /:latest|latest\s*$/, where the $ binds only to
    // the second alternative -- so the first half matched ':latest' anywhere,
    // including inside a longer word. CodeQL flagged the precedence as a missing
    // anchor and was right. Grouped now, with \b rather than $, so it also
    // catches a tag that has something after it on the line.
    const tagLines = release.match(new RegExp('tags:[^' + '\\n' + ']*', 'g')) ?? []
    for (const line of tagLines) {
      expect(line).not.toMatch(/(?::latest|\blatest)\b/)
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

describe('the published compose file', () => {
  const compose = readFileSync(join(repo, 'compose.published.yaml'), 'utf8')

  test('names the image the release actually pushes', () => {
    // Two files naming one image is a drift the next rename would cause
    // silently: the workflow would push somewhere the compose file does not
    // pull from, and the symptom is a manifest-unknown error for whoever tried
    // to follow the instructions.
    //
    // A substring, not a pattern. My first attempt matched
    // /ghcr\.io\/[^\s:"]*formancy-server/, which cannot span the
    // `${{ github.repository_owner }}` expression in the middle because that
    // contains spaces -- so it failed on a workflow that was correct. The fifth
    // regex in this repository to be the thing at fault; the name is the whole
    // property, so match the name.
    expect(release).toContain('formancy-server')
    expect(compose).toContain('formancy-server:')
  })

  test('refuses to run without a pinned version', () => {
    // No `latest` exists to fall back on, and defaulting to one would be this
    // file quietly undoing the advice the SOUP declaration gives. Compose's
    // `:?` stops instead of starting something nobody chose.
    expect(compose).toMatch(/FORMANCY_VERSION:\?/)
    expect(compose).not.toMatch(/FORMANCY_VERSION:-/)
  })

  test('does not build, because the point is not needing a checkout', () => {
    // `compose.yaml` builds from source and is right for somebody with the
    // repository. This one exists for somebody who has neither the repository
    // nor a build toolchain.
    expect(compose).not.toMatch(/^\s*build:/m)
  })

  test('keeps the secrets mandatory, as the source compose file does', () => {
    // The easiest mistake in a second copy of a compose file is relaxing what
    // the first one refused to default.
    for (const required of ['FORMANCY_AUTH_SECRET', 'FORMANCY_ADMIN_EMAIL', 'FORMANCY_ADMIN_PASSWORD']) {
      expect(compose).toContain(`${required}: \${${required}:?`)
    }
  })

  test('does not publish the database to every interface', () => {
    // The same reasoning as the source compose file: a default bind is a
    // database on whatever network the machine is on.
    expect(compose).toContain('127.0.0.1:5439:5432')
  })
})
