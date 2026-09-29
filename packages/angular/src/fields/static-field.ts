import { ChangeDetectionStrategy, Component } from '@angular/core'
import { injectFieldContext } from '../registry.js'


/**
 * Text the reader sees that collects nothing.
 *
 * One file per control, because a control changes for its own reasons.
 * These were one 1,909-line file — the second largest in the repository,
 * and the place things went.
 */
/**
 * The built-in unstyled components. `null` means the type renders nothing here:
 * hidden and static are non-inputs, and the container types are laid out by
 * their own machinery, not by a leaf slot.
 */
/**
 * Text the reader sees that collects nothing — a heading, an explanation, a
 * notice.
 *
 * Not a label, because there is no control for one to label. Not a heading
 * element either: the spec does not say what level it would be, and guessing
 * produces a document outline that skips levels.
 */
@Component({
  selector: 'formancy-static-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p data-formancy-part="static">{{ context.label }}</p>`,
})
export class FormancyStaticField {
  protected readonly context = injectFieldContext()
}
