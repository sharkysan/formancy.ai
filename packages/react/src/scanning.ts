import { createContext, useContext } from 'react'

/**
 * What a scanner is asked to read.
 *
 * Small on purpose, and everything in it is already on the screen: the field's
 * resolved label and its data path. A host's camera sheet needs to say what it is
 * looking for — "Scan" over a live viewfinder, on a form with three scannable
 * fields, tells the person holding the phone nothing — and the path is what lets a
 * host log or meter one field's scans without a second channel.
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
 * The same inversion the `file` field uses for its uploader, for the same reason:
 * a renderer cannot own camera permission policy and must not grow a decoder. So
 * the camera, the permission prompt, the viewfinder and the decoding all belong to
 * whoever mounted the form, and the whole of it arrives here as one function.
 *
 * **Resolving with `null` means nobody scanned anything** — the sheet was closed,
 * the person changed their mind. That is not a failure and the field says nothing
 * about it.
 *
 * **Rejecting means the device did not work**: permission refused, no camera, a
 * stream that died. The field says so out loud, in its own status region rather
 * than in its error region, because a hardware problem is not a wrong answer.
 *
 * What comes back is text, and it is stored exactly as typing it would be. A
 * scanner may not pre-validate: a value the field's `pattern` refuses is still what
 * the camera read, and dropping it would leave the field looking empty with no
 * record of why.
 */
export type Scanner = (request: ScanRequest) => Promise<string | null>

const ScannerContext = createContext<Scanner | undefined>(undefined)

export const ScannerProvider = ScannerContext.Provider

/**
 * The host's scanner, or undefined when there is none.
 *
 * Undefined is a supported state, not a misconfiguration — and unlike the uploader
 * it costs the person filling the form in nothing. A `scanner` widget with no
 * scanner behind it renders the ordinary text input and no button: typing was
 * always the field's primary route, so there is nothing to disable and nothing to
 * apologise for. A Scan button that opens nothing would be worse than no button.
 */
export function useScanner(): Scanner | undefined {
  return useContext(ScannerContext)
}
