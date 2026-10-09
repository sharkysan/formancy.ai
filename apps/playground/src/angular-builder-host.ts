import { ChangeDetectionStrategy, Component, InjectionToken, inject, signal } from '@angular/core'
import type { WritableSignal } from '@angular/core'
import {
  FormancyBuilder,
  FormancyLayoutPane,
  FormancyLogicPanel,
  FormancyPropertyPanel,
  FormancyRulesOverview,
} from '@formancy/builder-angular'
import type { BuilderSession, Capabilities } from '@formancy/builder-core'

/** Which of the three tabs the page is on. The React pane owns this. */
export type BuilderTab = 'fields' | 'arrangement' | 'rules'

/** What the form pane's preview holds, for the rules tab to explain (0128). */
export interface PreviewState {
  answers: Readonly<Record<string, unknown>>
  capabilities: Capabilities
}

/**
 * What the playground hands the Angular builder, through the injector.
 *
 * Through the injector rather than as `input()`s, and that is forced rather than
 * stylistic: `bootstrapApplication` runs change detection before returning, so
 * a template reading an `input.required` that nothing has set yet throws during
 * the bootstrap. Provided values exist from the moment the injector does.
 *
 * `tab` is a signal so the React pane can retune the live application instead of
 * tearing it down — re-bootstrapping on every tab click would throw away the
 * Angular tree's focus and scroll position for nothing.
 */
export interface PlaygroundBuilder {
  readonly session: BuilderSession
  readonly tab: WritableSignal<BuilderTab>
  /** Pushed in by the React pane as the preview changes, so the Angular tree is not rebuilt. */
  readonly preview: WritableSignal<PreviewState | undefined>
}

export const PLAYGROUND_BUILDER = new InjectionToken<PlaygroundBuilder>('playground builder')

/** Make one, for the bootstrap to provide. */
export function playgroundBuilder(session: BuilderSession, tab: BuilderTab): PlaygroundBuilder {
  return { session, tab: signal(tab), preview: signal(undefined) }
}

/**
 * The Angular builder, over the session the React builder is already editing.
 *
 * One session, two builders. That is the demonstration, and it is stronger than
 * the renderers' one: `BuilderSession` is framework-neutral and takes more than
 * one subscriber, so an edit made here appears in the React tree, in the JSON,
 * and in both rendered forms — without either builder knowing the other exists.
 * Switching between them keeps the document *and* the undo stack, because there
 * is only one of each.
 *
 * `@formancy/builder-angular` was complete, published and mounted by no
 * application; everything about its parity with the React builder was a jsdom
 * result ([0094](../../../docs/decisions/0094-the-second-builder-reaches-parity.md)
 * recorded that debt).
 *
 * Which panels appear mirrors the React pane rather than being this host's own
 * idea: the same two tabs, the same panels under each, so a difference on screen
 * is a difference of builder.
 */
@Component({
  selector: 'formancy-playground-angular-builder',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormancyBuilder,
    FormancyLayoutPane,
    FormancyLogicPanel,
    FormancyPropertyPanel,
    FormancyRulesOverview,
  ],
  template: `
    @if (host.tab() === 'arrangement') {
      <formancy-layout-pane [session]="host.session" layout="web" />
    } @else if (host.tab() === 'rules') {
      <formancy-rules-overview
        [session]="host.session"
        [answers]="host.preview()?.answers"
        [capabilities]="host.preview()?.capabilities"
      />
    } @else {
      <formancy-builder [session]="host.session" (selected)="selected.set($event)" />
      @if (selected(); as keyPath) {
        <formancy-property-panel [session]="host.session" [keyPath]="keyPath" />
        <formancy-logic-panel [session]="host.session" [keyPath]="keyPath" />
      }
    }
  `,
})
export class AngularBuilderHost {
  protected readonly host = inject(PLAYGROUND_BUILDER)

  /**
   * The field this builder's tree reports it is on.
   *
   * Kept here rather than pushed back to React: the selection belongs to *this*
   * tree, and the two trees have their own cursors. The document they edit is
   * shared; where somebody happens to be looking is not.
   */
  protected readonly selected = signal<readonly string[] | null>(null)
}
