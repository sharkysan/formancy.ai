import { createStop } from './answers.js'
import type { Stop } from './answers.js'

/**
 * What the three held runs share: a snapshot with a subscription, and one stop per run.
 *
 * A model is asked three ways from a builder — for a form or a change to one, for the
 * messages a language is missing, for examples — and since
 * [0164](../../../docs/decisions/0164-a-translation-is-held-for-its-language-and-a-draft-for-its-form.md)
 * each run can be held by the host rather than the pane that asked. 0163 declined to write
 * this from one holder; with three working ones, this is what they had in common, and the
 * part of it that must not differ between them: **an answer lands only on the run that asked
 * for it.** Each run gets a stop of its own, and its ending is taken only while it is still
 * the run in flight — so an answer to a stopped or forgotten run is never held as the next
 * one's (SAFETY-ANALYSIS D10), whichever of the three it is.
 *
 * Internal. What a pane can press is each holder's own — `PromptRun`, `TranslationRun`,
 * `DraftRun` — because the buttons differ; this is what is underneath all three.
 */
export interface RunHolder<S extends object> {
  /** The snapshot: the same object until something in it changes. */
  readonly state: () => S
  /** Hear each change. Returns what stops listening — a pane going, which ends nothing. */
  readonly subscribe: (listener: () => void) => () => void
  /** Take what changed; listeners hear it only when something did. */
  readonly change: (next: Partial<S>) => void
  /** A stop for a run starting now, which is then the run in flight. */
  readonly begin: () => Stop
  /**
   * Whether `stop`'s run is still the one in flight — and, if it is, it no longer is. A run
   * lands what it came to only when this says so: one stopped and asked again, or forgotten,
   * has ended already as far as anything on screen is concerned.
   */
  readonly end: (stop: Stop) => boolean
  /** Stop the run in flight, if there is one. It still ends, as stopped, through `end`. */
  readonly stop: () => void
  /** Stop the run in flight and forget it: whatever it answers later lands nowhere. */
  readonly forget: () => void
}

export function createRunHolder<S extends object>(idle: S): RunHolder<S> {
  let state = idle
  /** The stop of the run in flight. A run that finds another here, or none, was forgotten. */
  let running: Stop | undefined
  const listeners = new Set<() => void>()

  return {
    state: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    change(next) {
      const changed = (Object.keys(next) as Array<keyof S>).some((key) => next[key] !== state[key])
      if (!changed) return
      state = { ...state, ...next }
      for (const listener of [...listeners]) listener()
    },
    begin() {
      const stop = createStop()
      running = stop
      return stop
    },
    end(stop) {
      if (running !== stop) return false
      running = undefined
      return true
    },
    stop() {
      running?.stop()
    },
    forget() {
      const stop = running
      running = undefined
      stop?.stop()
    },
  }
}
