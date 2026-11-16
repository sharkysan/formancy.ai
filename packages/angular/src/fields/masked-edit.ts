import { editMasked, formatMasked } from '@formancy/spec'

/**
 * Applies an edit to a masked control and returns the answer it leaves: the one place a
 * masked control's text and caret are written, for the text field and the typed temporal
 * control alike, so two controls cannot answer one keystroke differently (0125). React's
 * binding has the same function under the same name.
 *
 * Written to the control here rather than left to the binding: a refused character leaves
 * the answer, and so the bound text, unchanged, and Angular writes a bound value only when
 * it changes, so the character would stay on screen. And the caret can only be placed in
 * text that is already there.
 */
export function applyMaskedEdit(
  input: HTMLInputElement,
  mask: string,
  answer: string,
  next: string,
  { caret, forward }: { caret: number | null; forward: boolean },
): string {
  const edit = editMasked(mask, answer, next, { caret, direction: forward ? 'forward' : 'backward' })
  input.value = formatMasked(mask, edit.answer)
  input.setSelectionRange(edit.caret, edit.caret)
  return edit.answer
}
