import { provideZonelessChangeDetection } from '@angular/core'
import type { ApplicationRef } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import {
  provideFormancy,
  provideFormancyOptionsSources,
  provideFormancyRichTextEditor,
  provideFormancyScanner,
  provideFormancyUploader,
} from '@formancy/angular'
import type { FormEngine } from '@formancy/core'
import { createRichTextEditor } from '@formancy/tiptap'
import { DEMO_OPTIONS_SOURCES, DEMO_SCANNER } from './demo-capabilities.js'
import { playgroundUploader } from './demo-uploader.js'
import { AngularPreview } from './angular-preview.js'

/**
 * Put the Angular renderer in `host`, over `engine`, and return how to remove it.
 *
 * Bootstrapping a whole application per engine rather than swapping the engine
 * inside a live one, and that is the cheaper correctness: the engine arrives
 * through the injector, an injector's providers are fixed once it exists, and
 * the alternative is a mutable holder every binding would have to watch. The
 * playground rebuilds its engine on every accepted change to the schema, so this
 * is also the path that cannot leave a renderer bound to a document that no
 * longer exists.
 *
 * Zoneless, which is not a preference: `@formancy/angular` is signals-based and
 * its suites run zoneless, so bootstrapping with zones here would demonstrate a
 * configuration nothing else in the repository tests.
 *
 * Separate from `angular-preview.ts` because the Angular compiler drops a plain
 * export that sits beside a component — see the note there.
 */
export async function mountAngularPreview(
  host: HTMLElement,
  engine: FormEngine,
): Promise<() => void> {
  // Angular bootstraps into an element matching the component's selector and
  // will not create one. Made here rather than asked of the caller, so the React
  // side does not have to know the selector.
  const root = document.createElement('formancy-playground-angular')
  host.append(root)

  let app: ApplicationRef
  try {
    app = await bootstrapApplication(AngularPreview, {
      providers: [
        provideZonelessChangeDetection(),
        provideFormancy(engine),
        /*
         * The same four capabilities the React half is given, and they are not
         * decoration.
         *
         * Bootstrapped with only the engine, this pane rendered **one control
         * fewer** than the React one: `deliveryPoint` is a typeahead over an
         * `optionsSource`, and with no source to resolve it renders a message
         * instead of a chooser. Nothing looked broken — the pane was full of
         * fields — and it was found by comparing the two panes by accessible
         * name rather than by eye.
         *
         * A control's real behaviour exists only where a host supplies the
         * capability, so a demo missing one shows the fallback and calls it the
         * feature. These are the deployment, and both renderers here are the
         * same deployment.
         */
        provideFormancyOptionsSources(DEMO_OPTIONS_SOURCES),
        provideFormancyScanner(DEMO_SCANNER),
        provideFormancyUploader(playgroundUploader),
        provideFormancyRichTextEditor(createRichTextEditor),
      ],
    })
  } catch (error) {
    // A bootstrap that throws must not leave its element behind: the next
    // attempt would append a second one and Angular would mount into the first.
    root.remove()
    throw error
  }

  return () => {
    app.destroy()
    root.remove()
  }
}
