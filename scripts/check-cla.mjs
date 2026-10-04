// Every author in a pull request has a signature on file for the terms as they
// currently stand.
//
// 0069 decided a CLA and said the part that mattered: "a CLA nobody checks is a
// document in a repository". For a week that was the state here -- the terms were
// in CONTRIBUTING.md, nothing read them, and the thing standing between the
// project and a first external contribution arriving under no terms at all was
// somebody remembering at the right moment.
//
// Run by `.github/workflows/cla.yml` on every pull request, and by
// `apps/docs/src/cla.test.ts`, which calls these functions rather than a stub of
// them. `node scripts/check-cla.mjs --hash` prints the hash a signature records.
//
// What this cannot do is say whether a signature means anything; that is a
// question for a lawyer and 0098 says so instead of implying a check settles it.
// What it does is make the absence of one loud.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The agreement itself, at the repository root. */
export const AGREEMENT = 'CLA.md'

/** The record of who has agreed to it, and to which version of it. */
export const SIGNATORIES = '.github/cla/signatories.json'

/**
 * The hash a signature records, over content rather than bytes.
 *
 * `.gitattributes` pins the working tree to LF and it holds today, so the
 * normalisation costs one call and buys the case where it does not: a contributor
 * whose git is configured differently, or an editor that rewrites on save, would
 * otherwise invalidate every signature in the file merely by checking the
 * repository out. That arrives as "the terms have changed", which is the one
 * thing this must not say falsely.
 */
export function agreementHash(text) {
  return `sha256:${createHash('sha256').update(text.replaceAll('\r\n', '\n'), 'utf8').digest('hex')}`
}

/** Throws unless `value` is a non-empty string. */
function requireText(value, where) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${SIGNATORIES}: ${where} is missing or not a string`)
  }
  return value
}

/** Throws unless `value` is a non-empty array of non-empty strings. */
function requireAddresses(value, where) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${SIGNATORIES}: ${where} has no emails array`)
  }
  return value.map((address, index) => requireText(address, `${where} emails[${String(index)}]`).trim().toLowerCase())
}

/**
 * The record, shape-checked and normalised.
 *
 * Checked once, here, rather than defensively at every read, and it throws rather
 * than skipping an entry it cannot understand. The realistic way this file goes
 * wrong is a typo'd key, and the two shapes that takes are not equally loud:
 * `email` for `emails` covers nobody and fails visibly, while a missing
 * `agreement` would make the staleness comparison pass by having nothing to
 * compare against. So neither is tolerated.
 *
 * `raw` and `agreement` are for the tests, which need records this repository
 * does not contain.
 */
export function readRecord(repoRoot, raw, agreement = AGREEMENT) {
  const record = raw ?? JSON.parse(readFileSync(join(repoRoot, SIGNATORIES), 'utf8'))

  // The record names the file it is a record of. If that stops being the file
  // being hashed, every signature is compared against the wrong text and the
  // staleness check becomes noise rather than a finding.
  if (record.agreement !== agreement) {
    throw new Error(`${SIGNATORIES}: records agreement ${String(record.agreement)}, not ${agreement}`)
  }

  const signatories = (record.signatories ?? []).map((entry, index) => {
    const where = `signatories[${String(index)}]`
    return {
      name: requireText(entry.name, `${where} name`),
      login: typeof entry.login === 'string' ? entry.login : undefined,
      emails: requireAddresses(entry.emails, where),
      signed: requireText(entry.signed, `${where} signed`),
      agreement: requireText(entry.agreement, `${where} agreement`),
    }
  })

  const machines = (record.machines ?? []).map((entry, index) => {
    const where = `machines[${String(index)}]`
    return {
      name: requireText(entry.name, `${where} name`),
      emails: requireAddresses(entry.emails, where),
      // An exemption is the one entry that grants cover without anybody having
      // agreed to anything, so the reason IS the entry. Without it the list
      // becomes somewhere to put addresses that are inconvenient.
      reason: requireText(entry.reason, `${where} reason`),
    }
  })

  return { agreement, signatories, machines }
}

/**
 * The authors this record does not cover, each named once.
 *
 * **Throws when it was given nothing to check.** That is the failure mode worth
 * being deliberate about, because it is the one that looks like success:
 * `git log base..head` answering nothing is indistinguishable from a range that
 * is genuinely empty, and both happen -- a wrong base SHA, a shallow clone
 * without the base commit, a rebase that moved the range. An empty list of
 * offenders would turn every one of those into a pass.
 */
export function unsigned({ authors, record, hash }) {
  // Keyed on the lowercased address, because git addresses are not
  // case-sensitive and a signatory who capitalises one would otherwise be a
  // stranger. The map is also what deduplicates: twelve commits by one unsigned
  // contributor is one thing to fix, and a failure repeating the address twelve
  // times reads as twelve problems. The value is the spelling the commit used,
  // so the message names the address as it appears in the log.
  const byAddress = new Map()
  for (const raw of authors) {
    const key = raw.trim().toLowerCase()
    if (key === '') continue
    byAddress.set(key, raw.trim())
  }

  if (byAddress.size === 0) {
    throw new Error('no commit authors were read; refusing rather than passing a range this cannot see')
  }

  const out = []
  for (const [key, spelling] of byAddress) {
    if (record.machines.some((machine) => machine.emails.includes(key))) continue

    const signatory = record.signatories.find((entry) => entry.emails.includes(key))
    if (signatory === undefined) {
      out.push({ email: spelling, reason: 'unsigned' })
      continue
    }
    // Stale is reported separately from unsigned because the two ask the
    // contributor for different things: one is "sign this", the other is "the
    // terms moved under you, read them again". One message for both would tell
    // somebody who has already signed that they have not.
    if (signatory.agreement !== hash) out.push({ email: spelling, reason: 'stale' })
  }
  return out
}

/** Every commit author in `base..head`, merges included. */
function authorsBetween(base, head) {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
  // The fork point rather than the base SHA the event carried. A branch that has
  // merged a newer `main` would otherwise drag in every commit made to `main`
  // since the pull request was opened -- all of them signed, all of them noise.
  const from = git('merge-base', base, head)
  return git('log', '--format=%ae', `${from}..${head}`).split('\n')
}

// `node scripts/check-cla.mjs --hash`, or with BASE_SHA and HEAD_SHA set.
if (process.argv[1]?.endsWith('check-cla.mjs')) {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
  const hash = agreementHash(readFileSync(join(repoRoot, AGREEMENT), 'utf8'))

  if (process.argv.includes('--hash')) {
    console.log(hash)
  } else {
    const base = process.env.BASE_SHA
    const head = process.env.HEAD_SHA
    if (base === undefined || head === undefined) {
      throw new Error('usage: BASE_SHA=… HEAD_SHA=… check-cla.mjs, or check-cla.mjs --hash')
    }

    const record = readRecord(repoRoot)
    const missing = unsigned({ authors: authorsBetween(base, head), record, hash })

    if (missing.length === 0) {
      console.log(`CLA: every author in ${base.slice(0, 7)}..${head.slice(0, 7)} has a signature on ${AGREEMENT}`)
    } else {
      for (const { email, reason } of missing) {
        console.error(
          reason === 'stale'
            ? `${email} signed an earlier version of ${AGREEMENT}; the terms have changed and need agreeing to again`
            : `${email} has no signature on ${AGREEMENT}`,
        )
      }
      // Deliberately not "nothing is merged until this passes". `main` carries no
      // protection rule, so no check on this repository is mechanically required
      // and saying one is would be a wrong statement where an absent one costs
      // nothing. What is true is who decides, and GOVERNANCE.md says the same.
      console.error(`\nHow to sign: ${AGREEMENT}, section "How to sign". A maintainer will not merge until this passes.`)
      process.exit(1)
    }
  }
}
