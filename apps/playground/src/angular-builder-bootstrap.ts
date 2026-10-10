import { provideZonelessChangeDetection } from '@angular/core'
import type { ApplicationRef } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import type { BuilderBlock, BuilderSession } from '@formancy/builder-core'
import { AngularBuilderHost, PLAYGROUND_BUILDER, playgroundBuilder } from './angular-builder-host.js'
import type { BuilderTab, FromThePage, PreviewState, ToThePage } from './angular-builder-host.js'

export type { BuilderTab, FromThePage, PreviewState }

/** A mounted Angular builder: how to retune it, and how to take it away. */
export interface MountedBuilder {
  /** Show the other tab, without tearing the application down. */
  show(tab: BuilderTab): void
  /** What the preview holds now, for the rules tab to explain. */
  explain(preview: PreviewState | undefined): void
  /** The page's blocks now, for the palette to offer. */
  offer(blocks: readonly BuilderBlock[]): void
  /** The page's examples now, and the sample they start from, for the scenario pane to run. */
  check(examples: Pick<FromThePage, 'scenarios' | 'sample'>): void
  unmount(): void
}

/**
 * Put the Angular builder in `host`, over `session`.
 *
 * The session and the tab go through the injector rather than through `input()`s,
 * because `bootstrapApplication` runs change detection before it returns and a
 * template reading an unset `input.required` throws there — see the note on
 * `PlaygroundBuilder`.
 *
 * Unlike the renderer's bootstrap, this one is created once and retuned. The
 * renderer takes its engine through the injector too, but a new *engine* means a
 * new injector; a tab is a signal, and exists to be set.
 */
export async function mountAngularBuilder(
  host: HTMLElement,
  session: BuilderSession,
  tab: BuilderTab,
  from: FromThePage,
  back: ToThePage,
): Promise<MountedBuilder> {
  // Angular bootstraps into an element matching the component's selector and
  // will not create one, so the caller does not have to know the selector.
  const root = document.createElement('formancy-playground-angular-builder')
  host.append(root)

  const state = playgroundBuilder(session, tab, from, back)

  let app: ApplicationRef
  try {
    app = await bootstrapApplication(AngularBuilderHost, {
      providers: [
        provideZonelessChangeDetection(),
        { provide: PLAYGROUND_BUILDER, useValue: state },
      ],
    })
  } catch (error) {
    // A bootstrap that throws must not leave its element behind: the next
    // attempt would append a second one and Angular would mount into the first.
    root.remove()
    throw error
  }

  return {
    show: (next) => state.tab.set(next),
    explain: (preview) => state.preview.set(preview),
    offer: (blocks) => state.blocks.set(blocks),
    check: ({ scenarios, sample }) => {
      state.scenarios.set(scenarios)
      state.sample.set(sample)
    },
    unmount: () => {
      app.destroy()
      root.remove()
    },
  }
}
