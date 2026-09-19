import { formatPath } from './path.js'
import type { Path } from './path.js'

/**
 * Which fields the user has interacted with.
 *
 * Touched-ness gates error presentation: `aria-invalid` and visible error text
 * appear only on fields that are both invalid AND touched, so a pristine form
 * does not open by shouting at the user. Submit calls touchMany over every
 * field, which is what makes all remaining errors appear at once.
 *
 * Notifications carry only the paths whose state actually flipped — a repeat
 * touch is silent, exactly like a value write that changes nothing.
 */
export interface InteractionState {
  isTouched(path: Path): boolean
  touch(path: Path): void
  touchMany(paths: readonly Path[]): void
  reset(): void
  subscribe(listener: (changedPaths: ReadonlySet<string>) => void): () => void
}

export function createInteractionState(): InteractionState {
  const touched = new Set<string>()
  const listeners = new Set<(changedPaths: ReadonlySet<string>) => void>()

  function notify(changed: Set<string>): void {
    if (changed.size === 0) return
    for (const listener of [...listeners]) listener(changed)
  }

  return {
    isTouched: (path) => touched.has(formatPath(path)),

    touch(path) {
      const wire = formatPath(path)
      if (touched.has(wire)) return
      touched.add(wire)
      notify(new Set([wire]))
    },

    touchMany(paths) {
      const changed = new Set<string>()
      for (const path of paths) {
        const wire = formatPath(path)
        if (!touched.has(wire)) {
          touched.add(wire)
          changed.add(wire)
        }
      }
      notify(changed)
    },

    reset() {
      if (touched.size === 0) return
      const cleared = new Set(touched)
      touched.clear()
      notify(cleared)
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
