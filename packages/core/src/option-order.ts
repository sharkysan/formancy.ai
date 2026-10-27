import { modelDataFields } from '@formancy/spec'
import type { FieldDef, FormModel } from '@formancy/spec'
import type { CapabilitySource } from '@formancy/expressions'

/*
 * The order a shuffled field's options are shown in (0200), chosen once when the engine is
 * built and kept for its life — an order that moved while somebody read it would move the
 * option under their pointer. By the fields' own paths, so every row of a repeater shows its
 * options in one order.
 *
 * From the `random()` the engine is given and never from `Math.random()`, for the reason the
 * clock is injected: an order nobody can reproduce is one nobody can explain. Presentation
 * only — what is stored is in the options' written order (`ticked`), and the server's replay
 * neither needs nor reads an order.
 */
export function optionOrders(model: FormModel, capabilities: CapabilitySource | undefined): ReadonlyMap<string, readonly string[]> {
  const shuffled = modelDataFields(model).filter(({ def }) => def.shuffle === true)
  if (shuffled.length > 0 && capabilities === undefined) {
    throw new Error(
      `"${shuffled[0]!.path}" shows its options in a shuffled order, so createFormEngine needs a capabilities source: ` +
        'random() is injected, never ambient.',
    )
  }
  return new Map(shuffled.map(({ path, def }) => [path, Object.freeze(shuffle(def, () => capabilities!.random()))]))
}

/* Fisher–Yates over the options that move; the ones that keep their place stay at their index. */
function shuffle(def: FieldDef, random: () => number): string[] {
  const options = def.options ?? []
  const moving = options.filter((option) => option.keepPlace !== true).map((option) => option.value)
  for (let last = moving.length - 1; last > 0; last--) {
    // Clamped: a random() answering 1 would otherwise reach past the end.
    const other = Math.min(last, Math.floor(random() * (last + 1)))
    ;[moving[last], moving[other]] = [moving[other]!, moving[last]!]
  }
  let next = 0
  return options.map((option) => (option.keepPlace === true ? option.value : moving[next++]!))
}

/** Options in the order a field shows them: its `optionOrder` when shuffled, as written otherwise. */
export function inOptionOrder<T extends { value: string }>(options: readonly T[], order: readonly string[] | undefined): T[] {
  if (order === undefined) return [...options]
  const at = new Map(order.map((value, index) => [value, index]))
  return [...options].sort((a, b) => (at.get(a.value) ?? order.length) - (at.get(b.value) ?? order.length))
}
