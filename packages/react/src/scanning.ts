import { createContext, useContext } from 'react'

/**
 * What a scanner is asked to read.
 *
 * The field's resolved label and its data path, and nothing else. A host's camera sheet
 * needs to say what it is looking for, and the path lets a host meter one field's scans.
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
 * **Resolving with `null` means nobody scanned anything** — the sheet was closed. That
 * is not a failure and the field says nothing about it.
 *
 * **Rejecting means the device did not work**: permission refused, no camera, a stream
 * that died. The field says so in its status region rather than its error region,
 * because a hardware problem is not a wrong answer.
 *
 * What comes back is stored exactly as typing it would be. **A scanner may not
 * pre-validate**: a value the field's `pattern` refuses is still what the camera read,
 * and dropping it would leave the field looking empty with no record of why.
 */
export type Scanner = (request: ScanRequest) => Promise<string | null>

const ScannerContext = createContext<Scanner | undefined>(undefined)

export const ScannerProvider = ScannerContext.Provider

/**
 * The host's scanner, or undefined when there is none.
 *
 * Undefined is a supported state. A `scanner` widget with no scanner behind it renders
 * the ordinary text input and no button — typing was always the field's primary route,
 * so there is nothing to disable and a Scan button that opened nothing would be worse.
 */
export function useScanner(): Scanner | undefined {
  return useContext(ScannerContext)
}
