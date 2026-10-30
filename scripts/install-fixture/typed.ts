/**
 * The type `formancy types` printed from `form.json`, used the way a consumer uses it.
 *
 * `answers.ts` is not in this directory: the install test writes it by running the
 * installed `formancy` bin, so what is on trial is the command end to end — the bin runs
 * from its tarball, and what it prints compiles against the installed `@formancy/spec`,
 * whose `StoredFile` and `SignatureAnswer` it imports, with `skipLibCheck` off.
 */
import type { InstallCheckAnswers } from './answers'

export const answers: InstallCheckAnswers = {
  name: 'Ada',
  country: 'CH',
  proof: [{ id: 'f1', name: 'a.pdf', size: 3, contentType: 'application/pdf', storageKey: 'k' }],
  sign: { typed: 'Ada Lovelace' },
}

// A country the form does not offer is not an answer to it, so a type that let it through
// would describe submissions the server refuses.
// @ts-expect-error -- 'DE' is not one of the form's countries, which is what this line proves
export const wrong: InstallCheckAnswers = { country: 'DE' }
