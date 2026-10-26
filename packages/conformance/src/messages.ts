import type { ConformanceMessage } from './driver.js'

/** The codes a driver reported at one path, sorted, which is what an `expectErrors` step compares. */
export function codesAt(messages: readonly ConformanceMessage[], path: string): readonly string[] {
  return messages
    .filter((message) => message.path === path)
    .map((message) => message.code)
    .sort()
}

export function summarize(message: ConformanceMessage): string {
  return `${message.path}: ${message.code}`
}

/**
 * The messages a person reads as the engine's code rather than as words (0191).
 *
 * Wording is never asserted — a fixture runs under any language — but a message whose text is
 * its own code is a renderer drawing the vocabulary instead of saying it, which is the defect
 * this keeps fixed. Held where a driver reports the text, which this package's drivers do.
 */
export function shownAsCodes(messages: readonly ConformanceMessage[]): readonly ConformanceMessage[] {
  return messages.filter((message) => message.text !== undefined && message.text === message.code)
}
