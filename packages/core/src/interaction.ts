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
  /**
   * Rewrite the wires touched-ness is stored under.
   *
   * Touched-ness is a set of wires — `items[1].name` — so it is keyed by a row's
   * POSITION, and a position is not an identity. When the rows of a repeater shift, the
   * state has to shift with them or it describes the wrong row: measured, visiting the
   * first of two required empty rows and then removing it left the surviving row, which
   * nobody had visited, reporting `touched: true` and showing a "required" error.
   *
   * Here rather than in the engine because this is where the set is. The engine decides
   * WHICH rows moved; it should not have to know how touched-ness is stored to say so.
   *
   * `transform` returns the wire's new name, or undefined to drop it — which is what a
   * removed row's own fields need.
   */
  remap(transform: (wire: string) => string | undefined): void
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

    remap(transform) {
      if (touched.size === 0) return
      const next = new Set<string>()
      for (const wire of touched) {
        const moved = transform(wire)
        if (moved !== undefined) next.add(moved)
      }

      // Everything that entered or left is a change, so a subscriber re-reads exactly
      // the fields whose presentation can differ. A symmetric difference rather than
      // the union: a wire in both sets is one nothing happened to.
      const changed = new Set<string>()
      for (const wire of touched) if (!next.has(wire)) changed.add(wire)
      for (const wire of next) if (!touched.has(wire)) changed.add(wire)

      touched.clear()
      for (const wire of next) touched.add(wire)
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
