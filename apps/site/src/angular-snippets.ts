/**
 * The two snippets the Angular page writes by hand, in a module of their own so that
 * `apps/docs/src/site-snippets.test.ts` can hold them to the packages they name: that
 * the command installs only published packages, and the component imports only what those
 * packages export. Prose code goes stale while the page goes on rendering it.
 */

export const INSTALL =
  'npm install @formancy/angular @formancy/builder-angular @formancy/builder-core @formancy/core'

export const EDITOR = `import { Component, signal } from '@angular/core'
import { FormancyBuilder, FormancyPropertyPanel } from '@formancy/builder-angular'
import { createBuilderSession } from '@formancy/builder-core'
import { myForm } from './my-form'

@Component({
  selector: 'app-editor',
  imports: [FormancyBuilder, FormancyPropertyPanel],
  template: \`
    <formancy-builder [session]="session" (selected)="selected.set($event)" />
    @if (selected(); as keyPath) {
      <formancy-property-panel [session]="session" [keyPath]="keyPath" />
    }
  \`,
})
export class Editor {
  protected readonly session = createBuilderSession(myForm)
  protected readonly selected = signal<readonly string[] | null>(null)
}`
