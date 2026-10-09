import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import {
  editableLayoutPropertiesFor,
  layoutNodeAt,
  layoutPropertyHeading,
} from '@formancy/builder-core'
import type { BuilderSession, EditableProperty, LayoutAddress, LayoutNode } from './types.js'
import { FormancyProperty } from './property-panel.js'
import { injectBuilderView } from './view.js'

/**
 * The property panel for a node in the arrangement.
 *
 * Generated from the spec's JSON Schema, exactly as the field panel is and for the
 * same reason. Writes go through one generic command, `setLayoutNodeProperty`,
 * attempted against the validator — so a span wider than its table leaves the
 * document where it was, and this panel does not have to know that rule.
 *
 * It is also where the property control's **draft** earns its keep. `span` is
 * `anyOf: [integer, const "all"]`, so typing "all" offers "a", then "al", then
 * "all" — the first two are refused, and a box bound straight to the document
 * re-renders empty, putting the next keystroke into an empty box. The word cannot
 * be typed at all.
 */
@Component({
  selector: 'formancy-layout-property-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyProperty],
  template: `
    @if (node(); as current) {
      <div data-formancy-part="layout-property-panel">
        <h2>{{ heading() }}</h2>
        <p data-formancy-part="property-panel-type">{{ current.kind }}</p>

        <!-- No "nothing to configure" branch, because there is no such node:
             every layout kind the format defines can span, so the list is never
             empty. properties.test.ts derives that, so a kind added without a
             property fails there rather than reaching a branch nobody could see.
             The React panel carried one and it could never render. -->
        @for (property of properties(); track property.name) {
          <formancy-property
            [property]="property"
            [value]="valueOf(property.name)"
            [text]="session().text"
            (changed)="set(property.name, $event)"
          />
        }
      </div>
    }
  `,
})
export class FormancyLayoutPropertyPanel {
  readonly session = input.required<BuilderSession>()
  /** The node being edited, read live from the document rather than captured. */
  readonly address = input.required<LayoutAddress>()

  protected readonly view = injectBuilderView(this.session)

  protected readonly node = computed((): LayoutNode | undefined => {
    const at = this.address()
    return layoutNodeAt(this.view().document, at.layout, at.path)
  })
  /** The kind, not the node's own label, which is one of the properties edited here. */
  protected readonly heading = computed(() => {
    const node = this.node()
    return node === undefined ? '' : layoutPropertyHeading(node.kind, this.session().text)
  })
  protected readonly properties = computed((): EditableProperty[] =>
    editableLayoutPropertiesFor(this.node()?.kind ?? '', this.session().text),
  )

  protected valueOf(name: string): unknown {
    return (this.node() as unknown as Record<string, unknown> | undefined)?.[name]
  }

  protected set(name: string, value: unknown): void {
    // An empty box means "no value", not "the empty string": writing '' would put
    // a property into the document the author just cleared.
    this.session().setLayoutNodeProperty(
      this.address(),
      name,
      value === '' || value === undefined ? undefined : value,
    )
  }
}
