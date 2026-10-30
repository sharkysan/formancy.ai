import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, signal } from '@angular/core'
import type { FieldSnapshot } from '@formancy/core'
import { countSentence } from '@formancy/core/words'
import { injectFormText } from '../text.js'

/** How long typing pauses before the count is spoken: long enough not to talk over a word. */
const PAUSE_MS = 1000

/**
 * A character count under a box with a `maxLength` (0203) — the React binding's
 * `CharacterCount`, sentence for sentence, since both call `countSentence`. Shown at once and
 * read with the control; spoken in a polite live region once typing pauses, and never before
 * the person has typed. Exported, so a host's own control counts as the shipped ones do.
 */
@Component({
  selector: 'formancy-character-count',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (said(); as said) {<p [id]="snapshot().props.count.id" data-formancy-part="count">{{ said }}</p><p role="status" data-formancy-part="visually-hidden">{{ spoken() }}</p>}`,
})
export class FormancyCharacterCount {
  readonly snapshot = input.required<FieldSnapshot>()
  private readonly text = injectFormText()

  protected readonly said = computed(() => countSentence(this.text, this.snapshot().def, this.snapshot().value))
  protected readonly spoken = signal('')

  constructor() {
    // The host takes no part in layout: the two paragraphs are the field's, as React draws them.
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement.style.setProperty('display', 'contents')
    // What it said when the field was drawn is not news; anything after it is, once typing pauses.
    let unchanged: string | undefined | null = null
    effect((onCleanup) => {
      const said = this.said()
      if (unchanged === null) {
        unchanged = said
        return
      }
      if (said === undefined || said === unchanged) return
      unchanged = undefined
      const timer = setTimeout(() => this.spoken.set(said), PAUSE_MS)
      onCleanup(() => clearTimeout(timer))
    })
  }
}
