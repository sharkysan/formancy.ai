import { ChangeDetectionStrategy, Component } from '@angular/core'
import { FormancyForm } from '@formancy/angular'

/**
 * The Angular renderer, mounted beside the React one.
 *
 * This is the project's central claim made visible rather than asserted: *one*
 * engine build, two framework-native renderers, and the same document on screen
 * twice with nothing between them but a binding. Until now that claim lived
 * entirely in jsdom — `@formancy/angular` and `@formancy/builder-angular` were
 * complete, published, and mounted by no application, so parity was a test
 * result and the v0.1 goal of showing both in one screenshot was not met.
 *
 * Deliberately thin. Everything about how a field looks, what ARIA it carries
 * and when it appears comes from the engine and the package; what is here is a
 * host.
 *
 * **This file holds the component and nothing else**, and the bootstrap lives
 * next door in `angular-bootstrap.ts`. Not tidiness: Vite's Angular plugin
 * compiles whatever it is pointed at, and the compiler's output for a module
 * keeps the component and **drops a plain function exported beside it**. With
 * both in one file the build failed on `MISSING_EXPORT` for the bootstrap, which
 * is a confusing way to find out that a file is either Angular or not.
 */
@Component({
  selector: 'formancy-playground-angular',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyForm],
  // The same layout name the React side renders, so the two are comparable. A
  // different one would make every difference on screen a difference of
  // arrangement rather than of renderer.
  template: `<formancy-form layout="web" />`,
})
export class AngularPreview {}
