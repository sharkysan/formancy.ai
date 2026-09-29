import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core'
import { narrowOptionsByLabel } from '@formancy/spec'
import { injectField } from '../field.js'
import { FieldComponentBase, FormancyFieldShell } from './field-shell.js'


/**
 * A combobox over the same answer a select holds.
 *
 * One file per control, because a control changes for its own reasons.
 * These were one 1,909-line file — the second largest in the repository,
 * and the place things went.
 */
/**
 * `widget: "typeahead"` - the same select, narrowed by typing.
 *
 * An ARIA 1.2 editable combobox over a listbox popup: a text box with
 * `role="combobox"` and a `<ul role="listbox">` of `<li role="option">`. DOM focus
 * never leaves the text box, so the arrowed-over option is named by
 * `aria-activedescendant` - the only thing that says where somebody is when what
 * they are moving through does not hold focus.
 *
 * **The list element exists while the popup is collapsed.** `aria-expanded` and
 * `aria-controls` are required properties of the role, and an `aria-controls`
 * pointing at an element that is not there is an unresolvable IDREF - so the
 * listbox is rendered and `hidden` rather than created when it opens.
 *
 * `aria-autocomplete="list"`, never `"both"`: nothing is written into the box on
 * the person's behalf, and `"both"` announces an inline completion that does not
 * exist. No `aria-haspopup`: `listbox` is the role's implicit popup.
 *
 * While a source is being asked, the box carries `aria-busy` and is never disabled:
 * disabling the element somebody just typed into blurs it, and the browser then
 * resets focus to the document body — the same reason the scanner's button stays
 * enabled while a scan is in flight.
 *
 * `aria-selected` is on the CHOSEN option and nothing else. Following the arrow
 * keys with it tells a screen reader the answer changed every time somebody
 * pressed Down to read the next row.
 *
 * **It cannot store what somebody typed.** `setValue` is reached from two places
 * here, with an option's own value or with `null`, and the text goes nowhere but
 * the filter - which is what makes
 * [0065](../../../docs/decisions/0065-a-widget-is-authored-not-registered.md)
 * structural rather than remembered. The filter itself is
 * `narrowOptionsByLabel` from `@formancy/spec`, the same function React calls, so
 * a query cannot narrow one way here and another way there.
 *
 * Every piece of state is a signal, and the field's own state arrives through
 * `injectField`, which is a signal fed by `engine.subscribeField`. Reading
 * `engine.getFieldSnapshot` instead - or wrapping a plain call in `computed()`,
 * which has no reactive dependency at all - renders this once and never again.
 * That bug has been written twice in this repository.
 */
@Component({
  selector: 'formancy-typeahead-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyFieldShell],
  template: `
    <formancy-field-shell [field]="field" [label]="context.label" [path]="context.path">
      <!-- The popup's containing block, and the reason it is an element rather than
           nothing at all.

           The popup was absolutely positioned with 'top: auto', on the reasoning that
           it would then land at its STATIC position -- where it would have sat in the
           flow, directly under the box. That holds inside a block container and NOT
           inside a grid or flex one, and every theme lays a field out with
           'display: grid'. For an absolutely positioned child of a grid container the
           static position is the container's own content-box origin, so the list opened
           over its own label and box rather than under them. Measured in the playground
           before the fix: the field's top edge was 457px, an in-flow child would have
           sat at 537px, and the popup sat at 459px.

           So the popup is given a containing block that wraps the control and nothing
           else, and every theme positions it against that explicitly. The status region
           stays OUTSIDE it, because it is a row of the field's grid exactly as the
           error region is. The React binding does the same, for the same reason. -->
      <div data-formancy-part="typeahead-anchor">
        <input
          type="text"
          role="combobox"
          [id]="control().id"
          [attr.name]="control().name"
          [attr.aria-invalid]="control()['aria-invalid']"
          [attr.aria-required]="control()['aria-required']"
          [attr.aria-describedby]="control()['aria-describedby']"
          [disabled]="control().disabled === true"
          data-formancy-part="typeahead"
          autocomplete="off"
          aria-autocomplete="list"
          [attr.aria-busy]="remote.busy() ? 'true' : null"
          [attr.aria-expanded]="expanded()"
          [attr.aria-controls]="listboxId()"
          [attr.aria-activedescendant]="activeId()"
          [value]="text()"
          (input)="onInput($event)"
          (click)="open.set(true)"
          (keydown)="onKeyDown($event)"
          (blur)="onBlur()"
        />
        <!-- Named, because the listbox role is one whose accessible name is required.
             Not with the name the field already has: two elements answering to the
             same accessible name make every query by that name ambiguous. -->
        <ul
          [id]="listboxId()"
          role="listbox"
          [attr.aria-label]="popupLabel()"
          data-formancy-part="typeahead-listbox"
          [hidden]="!expanded()"
        >
          @for (option of matches(); track option.value) {
            <li [id]="optionId(option.value)" role="option" data-formancy-part="typeahead-option" [attr.data-active]="option.value === activeValue() ? 'true' : null" [attr.aria-selected]="chosen()?.value === option.value ? 'true' : null" (mousedown)="$event.preventDefault()" (click)="choose(option.value)">{{ option.label }}</li>
          }
        </ul>
      </div>
      <!-- Present from the start and empty until there is something to say: a live
           region created at the moment it gets its text is one several screen
           readers never announce. -->
      <!-- ONE region, four things it may say, and never the error region: a source
           being down is not a wrong answer, and the error region is the control's
           describedby target carrying the engine's verdict. -->
      <p role="status" data-formancy-part="typeahead-status" [attr.data-state]="statusState()">{{ statusMessage() }}</p>
    </formancy-field-shell>
  `,
})
export class FormancyTypeaheadSelect extends FieldComponentBase {
  /**
   * What is in the box while somebody types, or null when the box is simply
   * showing the answer.
   *
   * Two states rather than one string, because "empty because they cleared it" and
   * "empty because there is no answer" are different facts, and only the first
   * clears the answer on the way out.
   */
  protected readonly query = signal<string | null>(null)
  protected readonly open = signal(false)
  /** The arrowed-over option by VALUE, not by index: the filtered list changes on
   *  every keystroke and an index would point at a different row after one. */
  protected readonly activeValue = signal<string | null>(null)

  /**
   * The option the form currently holds, looked up in what is OFFERED.
   *
   * `options()` is the document's list alone, and a field with `optionsSource` has
   * none — the schema forbids both — so looking there made `chosen` permanently
   * undefined for a sourced field, and the box showed an empty string over a stored
   * answer. React looked it up in the offered list from the start; this is the
   * divergence that made them two different controls.
   */
  protected readonly chosen = computed(() => {
    const value = this.field.snapshot().value
    return this.offered().find((option) => option.value === value)
  })

  /**
   * A source is the AUTHORITY on what matches: it was handed the query, and
   * re-folding its rows here would drop ones it matched on data the person cannot
   * see. A host wanting fetch-once-filter-locally composes `narrowOptionsByLabel` in
   * its own resolver, which is why that function lives in `@formancy/spec`.
   */
  protected readonly matches = computed(() =>
    this.remote.sourced()
      ? this.offered()
      : narrowOptionsByLabel(this.options(), this.query() ?? ''),
  )

  /** Collapsed whenever there is nothing on the screen, so `aria-expanded` never
   *  claims a popup a person cannot see. */
  protected readonly expanded = computed(() => this.open() && this.matches().length > 0)

  protected readonly text = computed(() => this.query() ?? this.chosen()?.label ?? '')

  protected readonly listboxId = computed(() => `${this.control().id}:listbox`)

  protected readonly popupLabel = computed(() => `${this.context.label} suggestions`)

  private readonly activeIndex = computed(() =>
    this.matches().findIndex((option) => option.value === this.activeValue()),
  )

  /** Absent rather than empty when nothing is active: an empty IDREF is a broken
   *  reference, not a way of saying "nothing". Angular omits an attribute bound to
   *  null, which is exactly that. */
  protected readonly activeId = computed(() => {
    const index = this.activeIndex()
    if (!this.expanded() || index === -1) return null
    return this.optionId(this.matches()[index]!.value)
  })

  /**
   * A source's own words win over "no options match": while a request is in flight,
   * "nothing matched" is not yet true.
   */
  protected readonly statusMessage = computed(() => {
    const fromSource = this.remote.status()
    if (fromSource !== '') return fromSource
    return this.open() && this.matches().length === 0 && !this.remote.busy()
      ? 'No options match'
      : ''
  })

  /** What the region is saying, as a word a theme can select on. */
  protected readonly statusState = computed(() => {
    if (this.remote.busy()) return 'busy'
    const message = this.remote.status()
    if (message.startsWith('The options could not')) return 'failed'
    if (message !== '') return 'hint'
    return this.open() && this.matches().length === 0 ? 'empty' : null
  })

  /** One option's element id, in the shape the radio group already uses. */
  protected optionId(value: string): string {
    return `${this.control().id}:option:${value}`
  }

  /**
   * The one place the query changes, because it is two facts that must never disagree:
   * what the box shows, and what the source is asked for.
   *
   * They were separate signals and only typing wrote the second, so after choosing a
   * row or leaving the field the source kept answering the abandoned query while the
   * box showed the answer — and the popup on the next click held rows for a word
   * nobody had typed. React derives both from one piece of state, which is why it
   * never had this.
   */
  private setQuery(next: string | null): void {
    this.query.set(next)
    this.sourceQuery.set(next ?? '')
  }

  protected onInput(event: Event): void {
    this.setQuery((event.target as HTMLInputElement).value)
    this.open.set(true)
    // Nothing is active on a keystroke: aria-activedescendant is ABSENT rather
    // than pointing at a row the person has not moved to.
    this.activeValue.set(null)
  }

  protected onKeyDown(event: KeyboardEvent): void {
    const matches = this.matches()

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!this.open()) {
        this.open.set(true)
        // Opens ON the answer when there is one, so Down then Enter cannot
        // quietly change an answer somebody only wanted to look at.
        const fallback = event.key === 'ArrowDown' ? matches[0] : matches[matches.length - 1]
        this.activeValue.set(this.chosen()?.value ?? fallback?.value ?? null)
        return
      }
      this.moveActive(event.key === 'ArrowDown' ? 1 : -1)
      return
    }

    if ((event.key === 'Home' || event.key === 'End') && this.expanded()) {
      // The popup's keys while it is open. Left to the caret, a long list is
      // reachable only by holding Down.
      event.preventDefault()
      this.activeValue.set(
        (event.key === 'Home' ? matches[0]! : matches[matches.length - 1]!).value,
      )
      return
    }

    if (event.key === 'Enter') {
      // Only while the list is showing. Otherwise Enter belongs to the form, and a
      // control that swallowed it would break submitting from the keyboard.
      if (!this.expanded()) return
      event.preventDefault()
      const index = this.activeIndex()
      if (index === -1) {
        this.open.set(false)
        return
      }
      this.choose(matches[index]!.value)
      return
    }

    if (event.key === 'Escape') {
      if (!this.open() && this.query() === null) return
      event.preventDefault()
      // "Never mind about this list", not "delete what I chose earlier": the query
      // is abandoned and the ANSWER is untouched.
      this.open.set(false)
      this.activeValue.set(null)
      this.setQuery(null)
    }
  }

  protected choose(value: string): void {
    this.field.setValue(value)
    this.setQuery(null)
    this.open.set(false)
    this.activeValue.set(null)
  }

  protected onBlur(): void {
    this.open.set(false)
    this.activeValue.set(null)
    const typed = this.query()
    if (typed !== null) {
      // An emptied box is the empty option, and the only route to null. Anything
      // else typed is abandoned - it was never an answer.
      if (typed.trim() === '') this.field.setValue(null)
      this.setQuery(null)
    }
    this.field.touch()
  }

  private moveActive(delta: number): void {
    const matches = this.matches()
    if (matches.length === 0) return
    const index = this.activeIndex()
    const from = index === -1 ? (delta > 0 ? -1 : matches.length) : index
    // Clamped, not wrapped: Down means further down the list, and a list that
    // jumps back to the top moves somebody past the end without saying so.
    const next = Math.min(Math.max(from + delta, 0), matches.length - 1)
    this.activeValue.set(matches[next]!.value)
  }
}
