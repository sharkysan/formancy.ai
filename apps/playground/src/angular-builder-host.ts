import { ChangeDetectionStrategy, Component, InjectionToken, inject, signal } from '@angular/core'
import type { WritableSignal } from '@angular/core'
import {
  FormancyBuilder,
  FormancyLayoutPane,
  FormancyLogicPanel,
  FormancyPropertyPanel,
  FormancyRulesOverview,
  FormancyTranslationsPane,
  FormancyScenarioPane,
} from '@formancy/builder-angular'
import type { BuilderBlock, BuilderSession, Capabilities } from '@formancy/builder-core'
import type { Scenario } from '@formancy/core'
import { STARTER_SAMPLE } from './starter-scenarios.js'

/** Which tab the page is on. The React pane owns this. */
export type BuilderTab = 'fields' | 'arrangement' | 'rules' | 'translations'

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
  /** The page's blocks, pushed in the same way: one list both builders offer (0135). */
  readonly blocks: WritableSignal<readonly BuilderBlock[]>
  /** Hands a block saved here back to the page, which keeps it for both builders. */
  readonly keep: (block: BuilderBlock) => void
  /** The page's examples, pushed in like the blocks: one list both builders run (0111). */
  readonly scenarios: WritableSignal<readonly Scenario[]>
  /** Hands the shorter list back after a Remove here, for the page to keep for both. */
  readonly keepScenarios: (next: readonly Scenario[]) => void
}

/** What this builder hands back to the page, which keeps both lists for both builders. */
export type ToThePage = Pick<PlaygroundBuilder, 'keep' | 'keepScenarios'>

export const PLAYGROUND_BUILDER = new InjectionToken<PlaygroundBuilder>('playground builder')

/** Make one, for the bootstrap to provide. */
export function playgroundBuilder(
  session: BuilderSession,
  tab: BuilderTab,
  back: ToThePage,
): PlaygroundBuilder {
  return {
    session,
    tab: signal(tab),
    preview: signal(undefined),
    blocks: signal([]),
    scenarios: signal([]),
    ...back,
  }
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
 * idea: the same tabs, the same panels under each, so a difference on screen is a
 * difference of builder.
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
    FormancyTranslationsPane,
    FormancyScenarioPane,
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
    } @else if (host.tab() === 'translations') {
      <formancy-translations-pane [session]="host.session" />
    } @else {
      <formancy-builder
        [session]="host.session"
        [blocks]="host.blocks()"
        (blockSaved)="host.keep($event)"
        (selected)="selected.set($event)"
      />
      <!-- The page's examples, drawn from its list and handed back to it on Remove,
           so one taken away here is gone from the React builder too. -->
      <formancy-scenario-pane
        [session]="host.session"
        [scenarios]="host.scenarios()"
        [initialValue]="sample"
        [removable]="true"
        (scenariosChange)="host.keepScenarios($event)"
      />
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

  /** Where every example starts: the same filled-in starter the React pane is given. */
  protected readonly sample = STARTER_SAMPLE
}
