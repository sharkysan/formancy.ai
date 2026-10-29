import type { FieldDef } from '@formancy/spec'

/*
 * One function every list and tag picker calls, so no control can store an answer the engine
 * refuses, and two people choosing the same answers store the same array (0199). Block comment,
 * with one JSDoc line below for the declaration a host reads.
 */
/** A list of ticks after one tick, in the options' order; an exclusive option is chosen alone. */
export function ticked(def: FieldDef, chosen: readonly unknown[], value: string, on: boolean): string[] {
  // A list from a source has no written order and no exclusive option, so its answers stay in
  // the order they were ticked; reading the written order kept none of them (0215).
  if (def.optionsSource !== undefined) {
    const kept = chosen.filter((candidate): candidate is string => typeof candidate === 'string' && candidate !== value)
    return on ? [...kept, value] : kept
  }
  // The written order, never the order a shuffled list is shown in (0200).
  const order = (def.options ?? []).map((option) => option.value)
  const exclusive = new Set((def.options ?? []).filter((option) => option.exclusive === true).map((option) => option.value))
  const kept = (candidate: string): boolean => {
    if (candidate === value) return on
    if (!on || !chosen.includes(candidate)) return chosen.includes(candidate)
    // Ticking: an exclusive tick leaves nothing else, and any tick leaves no exclusive one.
    return !exclusive.has(value) && !exclusive.has(candidate)
  }
  return order.filter(kept)
}
