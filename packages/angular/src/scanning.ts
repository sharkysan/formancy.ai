import { InjectionToken, inject } from '@angular/core'

/**
 * What a scanner is asked to read.
 *
 * The same contract the React binding declares, with the same reasoning: a host's
 * camera sheet has to say what it is looking for, and the path is what lets a host
 * log or meter one field's scans without a second channel.
 *
 * Nothing about the *format* is here. `pattern` is the field's, the engine checks
 * it, and a scanner told to pre-filter would be a second validator drifting from
 * the first.
 */
export interface ScanRequest {
  /** The field's label, resolved through the message catalogue. */
  label: string
  /** The field's data path, e.g. `serial` or `items[1].serial`. */
  path: string
}

/**
 * Reads a code and reports the text on it.
 *
 * The same inversion the `file` field uses for its uploader, for the same reason: a
 * renderer cannot own camera permission policy and must not grow a decoder. The
 * camera, the permission prompt, the viewfinder and the decoding all belong to
 * whoever mounted the form.
 *
 * **Resolving with `null` means nobody scanned anything** — the sheet was closed.
 * Not a failure, and the field says nothing about it. **Rejecting means the device
 * did not work**, and the field says so in its own status region rather than in its
 * error region, because a hardware problem is not a wrong answer.
 *
 * A scanner may not pre-validate: a value the field's `pattern` refuses is still
 * what the camera read, and dropping it would leave the field looking empty with no
 * record of why.
 */
export type Scanner = (request: ScanRequest) => Promise<string | null>

/**
 * Optional by design, and unlike the uploader it costs the person filling the form
 * in nothing: a `scanner` widget with no scanner behind it renders the ordinary text
 * input and no button. Typing was always the field's primary route, so there is
 * nothing to disable and nothing to apologise for — and a Scan button that opens
 * nothing would be worse than no button.
 */
export const FORMANCY_SCANNER = new InjectionToken<Scanner>('formancy.scanner')

export function injectScanner(): Scanner | null {
  return inject(FORMANCY_SCANNER, { optional: true })
}

/** Providing one, for a host that has a camera and a decoder. */
export function provideFormancyScanner(scan: Scanner) {
  return { provide: FORMANCY_SCANNER, useValue: scan }
}
