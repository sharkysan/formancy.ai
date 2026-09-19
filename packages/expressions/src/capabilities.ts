/**
 * Everything impure an expression can observe, as plain frozen values.
 *
 * This package never reads a clock or a random source. It cannot: it is handed
 * the answers. That is what lets the server replay a submission and get exactly
 * what the browser got — the same expression over the same values with the same
 * capabilities is the same result, byte for byte, which is the difference
 * between a computed total you can audit and one you can only hope about.
 */
export interface Capabilities {
  /** Epoch milliseconds, what `now()` returns. */
  readonly nowMs: number
  /**
   * The civil date, `YYYY-MM-DD`, what `today()` returns. The caller decides
   * which time zone that is; the package has no opinion and no way to find out.
   */
  readonly today: string
  /** One draw in [0, 1), what `random()` returns, for the whole pass. */
  readonly random: number
}

/** Functions to draw one pass worth of capabilities from. */
export interface CapabilitySource {
  now(): number
  today(): string
  random(): number
}

const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Draw each capability once and freeze the result.
 *
 * Called once per evaluation pass, not once per expression: a form with fifty
 * computed fields must agree with itself about what time it is.
 */
export function captureCapabilities(source: CapabilitySource): Capabilities {
  return fixedCapabilities({
    nowMs: source.now(),
    today: source.today(),
    random: source.random(),
  })
}

/** Validate and freeze a capability set, typically one read back from storage. */
export function fixedCapabilities(values: Capabilities): Capabilities {
  if (!Number.isSafeInteger(values.nowMs)) {
    throw new RangeError(`now must be whole epoch milliseconds, got ${String(values.nowMs)}`)
  }
  if (!CIVIL_DATE.test(values.today)) {
    throw new RangeError(`today must be a YYYY-MM-DD date, got ${JSON.stringify(values.today)}`)
  }
  if (!(values.random >= 0 && values.random < 1)) {
    throw new RangeError(`random must be in [0, 1), got ${String(values.random)}`)
  }
  return Object.freeze({ nowMs: values.nowMs, today: values.today, random: values.random })
}
