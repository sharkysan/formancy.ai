import { InjectionToken, inject } from '@angular/core'

/**
 * What a scanner is asked to read.
 *
 * The same contract the React binding declares: the field's resolved label, so a host's
 * camera sheet can say what it is looking for, and its data path, so a host can meter
 * one field's scans.
 *
 * **Nothing about the format is here.** `pattern` is the field's and the engine checks
 * it; a scanner told to pre-filter would be a second validator drifting from the first.
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
 * The camera, the permission prompt, the viewfinder and the decoding all belong to
 * whoever mounted the form ([0071](../../../docs/decisions/0071-a-scanner-is-supplied-not-built.md)).
 *
 * **Resolving with `null` means nobody scanned anything** — the sheet was closed. Not a
 * failure, and the field says nothing about it. **Rejecting means the device did not
 * work**, and the field says so in its status region rather than its error region,
 * because a hardware problem is not a wrong answer.
 *
 * **A scanner may not pre-validate**: a value the field's `pattern` refuses is still
 * what the camera read, and dropping it would leave the field looking empty.
 */
export type Scanner = (request: ScanRequest) => Promise<string | null>

/**
 * Optional by design. A `scanner` widget with no scanner behind it renders the ordinary
 * text input and no button — typing was always the field's primary route, so there is
 * nothing to disable and a Scan button that opened nothing would be worse.
 */
export const FORMANCY_SCANNER = new InjectionToken<Scanner>('formancy.scanner')

export function injectScanner(): Scanner | null {
  return inject(FORMANCY_SCANNER, { optional: true })
}

/** Providing one, for a host that has a camera and a decoder. */
export function provideFormancyScanner(scan: Scanner) {
  return { provide: FORMANCY_SCANNER, useValue: scan }
}
