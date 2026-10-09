/**
 * An input mask: the shape a single-line answer is typed into.
 *
 * `9` takes a digit, `a` a letter and `*` either; every other character is one the
 * control writes for the person, and a backslash makes the character after it one of
 * those — `\9` writes a 9. **The answer holds only what was typed into the positions**:
 * `(999) 999-9999` stores `5551234567`. So the characters a mask writes can change
 * without a stored answer changing, and what reaches an export or the server is the
 * number rather than one of its spellings
 * ([0125](../../../docs/decisions/0125-a-mask-stores-what-was-typed.md)).
 *
 * Here, in the data contract, because three things act on a mask and must agree: the
 * engine refuses an answer that does not fill it, and both renderers decide where a
 * typed or pasted character lands. Two implementations of that would be two answers to
 * one keystroke ([0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md)).
 * Pure, and in code points throughout — a letter outside the Basic Multilingual Plane is
 * one position, not two — converting to the DOM's UTF-16 offsets only for the caret.
 */

/** What a position takes. */
export type MaskSlot = 'digit' | 'letter' | 'either'

/** One position of a mask: a place to type, or a character the control writes. */
export type MaskPosition = { readonly slot: MaskSlot } | { readonly literal: string }

const SLOTS: Readonly<Record<string, MaskSlot>> = { '9': 'digit', a: 'letter', '*': 'either' }

/** The positions a mask describes, in order. A trailing backslash writes itself. */
export function maskPositions(mask: string): MaskPosition[] {
  const characters = [...mask]
  const positions: MaskPosition[] = []
  for (let at = 0; at < characters.length; at += 1) {
    const character = characters[at]!
    if (character === '\\' && at + 1 < characters.length) {
      at += 1
      positions.push({ literal: characters[at]! })
    } else {
      const slot = SLOTS[character]
      positions.push(slot === undefined ? { literal: character } : { slot })
    }
  }
  return positions
}

/** Whether one character may go in a position. ASCII digits: a mask is for codes. */
export function fitsSlot(slot: MaskSlot, character: string): boolean {
  if (slot === 'digit') return /^[0-9]$/.test(character)
  if (slot === 'letter') return /^\p{L}$/u.test(character)
  return /^[\p{L}0-9]$/u.test(character)
}

const slotsOf = (positions: readonly MaskPosition[]): MaskSlot[] =>
  positions.flatMap((position) => ('slot' in position ? [position.slot] : []))

/** Whether a mask has anywhere to type. One without is a label, not a mask. */
export function maskHasPositions(mask: string): boolean {
  return slotsOf(maskPositions(mask)).length > 0
}

/**
 * Whether an answer fills the mask: a character in every position, each one the
 * position takes. The engine's check, so the server's verdict is this one.
 */
export function fitsMask(mask: string, answer: string): boolean {
  const slots = slotsOf(maskPositions(mask))
  const characters = [...answer]
  return (
    characters.length === slots.length &&
    characters.every((character, at) => fitsSlot(slots[at]!, character))
  )
}

/**
 * An answer as the control shows it: each typed character in its position and the
 * mask's own characters between them — up to the last character typed, and no further.
 *
 * Not to the end of the mask: a written character after the last typed one would sit
 * under the caret, and a backspace there would delete it and nothing else — a key that
 * appears to do nothing.
 */
export function formatMasked(mask: string, answer: string): string {
  const characters = [...answer]
  let shown = ''
  let next = 0
  for (const position of maskPositions(mask)) {
    if (next >= characters.length) break
    shown += 'slot' in position ? characters[next++]! : position.literal
  }
  return shown
}

/** The mask with its positions shown as `_`, for a control's placeholder. */
export function maskPlaceholder(mask: string): string {
  return maskPositions(mask)
    .map((position) => ('slot' in position ? '_' : position.literal))
    .join('')
}

/** Whether every position takes a digit, so a phone keypad is the right keyboard. */
export function maskIsNumeric(mask: string): boolean {
  const slots = slotsOf(maskPositions(mask))
  return slots.length > 0 && slots.every((slot) => slot === 'digit')
}

/**
 * The answer a control's new text means, and where its caret goes.
 *
 * `shown` is what the control showed for `answer`; `next` is what it holds after an
 * edit — a key, a deletion, a paste. The edit is found as the part of `next` that
 * differs from what was shown, and applied to the answer rather than to the text, so a
 * character the mask writes can neither be typed over nor stored.
 *
 * - **A deletion of only written characters removes the typed one beside them**, in
 *   the direction of the deletion. Otherwise a backspace just after `)` would remove
 *   the `)`, the control would write it straight back, and the key would do nothing.
 * - **Text replacing everything is read as a whole when it lines up with the mask** —
 *   a pasted `+41 79 123 45 67` into `+41 99 999 99 99` — because read a character at
 *   a time, the `4` and `1` the mask writes would be taken as the first two digits.
 *   Otherwise a character goes in the next position that takes it, and one no position
 *   takes is dropped.
 * - `caret` is where the control's caret is in `next`, if known: it says which of two
 *   identical neighbours was typed, so the caret stays where the person is typing.
 *
 * Returns the caret as a UTF-16 offset into the formatted answer, which is what
 * `setSelectionRange` takes.
 */
export function editMasked(
  mask: string,
  answer: string,
  next: string,
  {
    caret,
    direction = 'backward',
  }: { caret?: number | null; direction?: 'backward' | 'forward' } = {},
): { answer: string; caret: number } {
  const positions = maskPositions(mask)
  const slots = slotsOf(positions)
  const typed = [...answer]
  const before = [...formatMasked(mask, answer)]
  const after = [...next]

  // Where the edit is. With the caret known, the text after it is what the edit left
  // alone, so the common end is found first and bounded by it — of "(55" becoming
  // "(555" with the caret after the second 5, the new 5 is the middle one. Without it,
  // the longest common start, then the longest common end that leaves room for it.
  const caretAt = caret == null ? undefined : [...next.slice(0, caret)].length
  const sameFromEnd = (offset: number): boolean =>
    before[before.length - 1 - offset] === after[after.length - 1 - offset]
  let start = 0
  let end = 0
  if (caretAt === undefined) {
    while (start < before.length && start < after.length && before[start] === after[start]) {
      start += 1
    }
    while (end < before.length - start && end < after.length - start && sameFromEnd(end)) end += 1
  } else {
    while (end < before.length && end < after.length - caretAt && sameFromEnd(end)) end += 1
    while (start < before.length - end && start < caretAt && before[start] === after[start]) {
      start += 1
    }
  }

  const slotsBefore = (index: number): number =>
    positions.slice(0, index).filter((position) => 'slot' in position).length
  let from = slotsBefore(start)
  let to = slotsBefore(before.length - end)
  const inserted = after.slice(start, after.length - end)

  if (inserted.length === 0 && from === to) {
    if (direction === 'backward' && from > 0) from -= 1
    else if (direction === 'forward' && to < typed.length) to += 1
  }

  const whole = start === 0 && end === 0 ? linedUp(positions, inserted) : undefined
  const incoming = whole ?? inserted

  // Placed in order, each in the next position that takes it; what the edit
  // shifted along is re-placed too, since a position may take less than its new
  // neighbour did.
  const candidate = [...typed.slice(0, from), ...incoming, ...typed.slice(to)]
  const placed: string[] = []
  let placedFromEdit = 0
  candidate.forEach((character, index) => {
    if (placed.length >= slots.length || !fitsSlot(slots[placed.length]!, character)) return
    placed.push(character)
    if (index >= from && index < from + incoming.length) placedFromEdit += 1
  })

  const result = placed.join('')
  const shown = [...formatMasked(mask, result)]
  // After the last character the edit placed: the start of the position after it,
  // or the end of what is shown when that position is not shown yet.
  const slotIndex = from + placedFromEdit
  let position = shown.length
  let counted = 0
  for (let index = 0; index < positions.length; index += 1) {
    if (!('slot' in positions[index]!)) continue
    if (counted === slotIndex) {
      position = Math.min(index, shown.length)
      break
    }
    counted += 1
  }
  return { answer: result, caret: shown.slice(0, position).join('').length }
}

/** The answer in `text` when it lines up with the mask from its first position. */
function linedUp(
  positions: readonly MaskPosition[],
  text: readonly string[],
): string[] | undefined {
  if (text.length > positions.length) return undefined
  const answer: string[] = []
  for (let at = 0; at < text.length; at += 1) {
    const position = positions[at]!
    const character = text[at]!
    if ('slot' in position) {
      if (!fitsSlot(position.slot, character)) return undefined
      answer.push(character)
    } else if (position.literal !== character) {
      return undefined
    }
  }
  return answer
}

/** The answer text means when it replaces whatever was there: a scan, say. */
export function answerFromText(mask: string, text: string): string {
  return editMasked(mask, '', text).answer
}
