import type { ReactElement } from 'react'
import compatibility from '../../../compatibility.json'
import savedFormSource from '../../angular-starter/src/app/saved-form.ts?raw'
import { EDITOR, INSTALL } from './angular-snippets.js'
import { Backdrop, REPO, SiteBar, SiteFooter } from './chrome.js'
import './angular-builder-page.css'

/**
 * `/angular-form-builder/`: the page for somebody who searched for an Angular form builder.
 *
 * It makes one argument and shows the thing it is about. The demo is not a recording or a
 * mock-up: it is `apps/angular-starter`, built as it is in the repository and served beside
 * this page, so what a visitor edits there is what somebody who clones the starter gets.
 *
 * Nothing on it is typed twice. The tested versions come from `compatibility.json`, which CI
 * runs as its matrix; the save-and-reload code is the starter's own `saved-form.ts`, the file
 * the demo runs. The two snippets written by hand are in `angular-snippets.ts`, where a
 * repository check holds them to the packages they name.
 */

/** The starter: its own dev server while developing, a sibling directory in the build. */
export const STARTER = import.meta.env.DEV
  ? 'http://localhost:4383/'
  : '/angular-form-builder/demo/'

/** `["22.0.0", "^22"]` as a sentence: the lowest, and the newest of the major. */
export function testedOn(versions: readonly string[]): string {
  const said = versions.map((version) =>
    version.startsWith('^') ? `the newest ${version.slice(1)}` : version,
  )
  return said.length === 2 ? `${said[0]} and ${said[1]}` : said.join(', ')
}

export function AngularBuilderPage(): ReactElement {
  return (
    <div className="ng-page">
      <Backdrop />
      <a className="skip" href="#demo">
        Skip to the demo
      </a>
      <SiteBar current="angular" />
      <main>
        <section className="ng-hero" aria-labelledby="ng-title">
          <p className="eyebrow">Angular form builder</p>
          <h1 id="ng-title">
            A form builder for Angular, <em>open source all the way down.</em>
          </h1>
          <p className="lede">
            The builder your users edit forms in, the component that draws them and the server that
            checks what comes back — all Apache-2.0. Zoneless, signals and <code>OnPush</code>:
            written for Angular rather than wrapped for it.
          </p>
          <p className="actions">
            <a className="action primary" href="#demo">
              Try it <span aria-hidden="true">↓</span>
            </a>
            <a className="action" href="/docs/start/angular/">
              Read the Angular guide <span aria-hidden="true">→</span>
            </a>
          </p>
        </section>

        <section id="demo" className="ng-section" aria-labelledby="ng-demo">
          <h2 id="ng-demo">Try it</h2>
          <p>
            This is the Angular starter, built as it is in the repository: the builder on the left,
            the form it builds on the right, drawn with Angular Material. Change a label, add a
            field, then press Save — it opens on your form next time.
          </p>
          <iframe
            className="ng-demo"
            src={STARTER}
            title="The Angular starter: a form builder and the form it builds"
            loading="lazy"
          />
          <p className="ng-links">
            <a href={STARTER}>Open the demo on its own</a>
            <a href={`${REPO}/tree/main/apps/angular-starter`} rel="noreferrer noopener">
              The starter&rsquo;s source
            </a>
          </p>
        </section>

        <section className="ng-section" aria-labelledby="ng-install">
          <h2 id="ng-install">Install</h2>
          <pre className="ng-code" aria-label="Install command">
            <code>{INSTALL}</code>
          </pre>
          <p>
            Then a component with the builder in it. <code>myForm</code> is a form document — JSON,
            which the starter&rsquo;s <code>expense-claim.ts</code> is an example of:
          </p>
          <pre className="ng-code" aria-label="An editor component">
            <code>{EDITOR}</code>
          </pre>
          <p>
            The form it builds is drawn by <code>@formancy/angular</code> — with its own unstyled
            controls, with yours, or with Angular Material. The{' '}
            <a href="/docs/start/angular/">Angular guide</a> has both halves.
          </p>
        </section>

        <section className="ng-section" aria-labelledby="ng-save">
          <h2 id="ng-save">Save it, open it again</h2>
          <p>
            A form is a JSON document, so saving one is writing <code>session.document()</code>{' '}
            wherever you keep things, and opening it is <code>createBuilderSession(saved)</code>.
            Check it first: a session refuses an invalid document by throwing. This is the
            starter&rsquo;s <code>saved-form.ts</code>, the file the demo above runs — in the
            browser&rsquo;s storage, and yours to point at a server.
          </p>
          <pre className="ng-code" aria-label="saved-form.ts">
            <code>{savedFormSource.trim()}</code>
          </pre>
        </section>

        <section className="ng-section" aria-labelledby="ng-versions">
          <h2 id="ng-versions">Tested on</h2>
          <ul className="ng-versions">
            <li>
              <strong>Angular</strong> {testedOn(compatibility.angular)}, with Angular Material at
              the same version
            </li>
            <li>
              <strong>React</strong> {testedOn(compatibility.react)}, for the same form drawn by{' '}
              <code>@formancy/react</code>
            </li>
            <li>
              <strong>Node.js</strong> {testedOn(compatibility.node)}, for the server
            </li>
          </ul>
          <p>
            Each is a CI run on every pull request. For Angular, that is the packed packages
            installed into an Angular project at that version, built by it and run in Chromium.
            Angular server-side rendering and browsers other than Chromium are not run.{' '}
            <a href="/docs/start/compatibility/">What each run proves</a>.
          </p>
        </section>

      </main>
      <SiteFooter />
    </div>
  )
}
