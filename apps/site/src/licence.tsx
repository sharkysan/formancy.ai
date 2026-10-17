import type { ReactElement } from 'react'
import { REPO } from './chrome.js'

/**
 * The licence section: what is free, and the two modules built on it that are not.
 *
 * A file of its own because `app.tsx` is at its ceiling in `size.test.ts`, whose
 * note names the seam as one section per file. The section wrapper stays in the
 * page, which owns the journey it reports to; this is what goes inside it.
 */

/*
 * The paid modules, each deployed onto formancy.ai by its own repository rather
 * than by this build — so the addresses are absolute: a relative `/report/` would
 * 404 in development and on a preview deployment, where nothing else is served.
 *
 * Their terms are read from each repository's `LICENSE.md` (Formancy Data 1.1,
 * Formancy Report 1) on 2026-10-16. Nothing here checks them against those texts;
 * if either licence changes, this changes by hand. What `site.test.tsx` holds is
 * that every link to a module sits beside the words saying it is not free.
 */
const MODULES = [
  {
    name: 'Formancy Data',
    does: 'Turns an existing PostgreSQL or SQL Server database into formancy forms: it discovers what an account may do, serves lookups under a policy asked on every request, and edits records.',
    demo: { href: 'https://formancy.ai/data/examples/', label: 'Try the examples' },
    repo: 'formancy.ai-data',
  },
  {
    name: 'Formancy Report',
    does: 'Paginated PDF reports from formancy forms, Formancy Data datasets or your own JSON, designed in native Angular and React editors and rendered on your server.',
    demo: { href: 'https://formancy.ai/report/', label: 'Open the Studio' },
    repo: 'formancy.ai-report',
  },
] as const

export function Licence(): ReactElement {
  return (
    <>
      <div className="licence-claim">
        <p className="eyebrow">Licence</p>
        <h2>Apache-2.0. The whole thing.</h2>
        <p className="lede">
          The spec, the engine, both renderers, the builder and the backend. No paywalled
          accessibility, no premium components, no clause that turns running it for your own
          users into distribution.
        </p>
        <div className="actions">
          <a className="action" href={REPO} rel="noreferrer noopener">
            github.com/sharkysan/formancy.ai
          </a>
        </div>
      </div>

      {/* What the licence actually gives, beside the claim rather than under it: the
          section was a centred paragraph with a screen of air around it, and the three
          things below are the reason Apache-2.0 was chosen over MIT rather than
          decoration. */}
      <dl className="licence-terms">
        <div>
          <dt>An express patent grant</dt>
          <dd>
            With a retaliation clause, which is the term an acquirer&rsquo;s open-source
            office looks for first. MIT has none.
          </dd>
        </div>
        <div>
          <dt>Running it is not distributing it</dt>
          <dd>
            Offering a form to your own users triggers nothing. No source disclosure, no
            obligation that arrives with your first visitor.
          </dd>
        </div>
        <div>
          <dt>Attribution that travels</dt>
          <dd>
            A NOTICE file ships in every package, and the licence text with it — checked
            before a release can publish.
          </dd>
        </div>
      </dl>

      {/* Right under "the whole thing", because that is where a visitor decides what is
          free: a paid module met anywhere else on the page would read as part of it.
          Each item carries its own terms rather than leaning on the paragraph above it,
          since a link is often reached alone — by tab, or from a list of links. */}
      <div className="licence-modules">
        <p className="licence-modules-lede">
          <strong>Not free: two modules built on formancy.</strong> Each has a repository and a
          source-available licence of its own, not Apache-2.0. Reading the source, evaluating
          and developing with it cost nothing, in a company too; running it in production needs
          a paid licence. There is no published price yet — ask at{' '}
          <a href="mailto:info@formancy.ai">info@formancy.ai</a>.
        </p>
        <ul>
          {MODULES.map((module) => (
            <li key={module.name}>
              <h3>{module.name}</h3>
              <p className="licence-module-terms">Not free · paid in production</p>
              <p>{module.does}</p>
              <p className="licence-module-links">
                <a href={module.demo.href}>{module.demo.label}</a>
                <a href={`https://github.com/sharkysan/${module.repo}`} rel="noreferrer noopener">
                  github.com/sharkysan/{module.repo}
                </a>
              </p>
            </li>
          ))}
        </ul>
      </div>

      {/* The paragraph a buyer with a regulator behind them is looking for, and the
          disclaimer is half of it rather than a hedge on it: conformity attaches to a
          device with an intended purpose, a component cannot have one, and a supplier
          who claims otherwise is the one to be suspicious of. The two halves travel
          together -- `apps/docs/src/claims.test.ts` fails if either is left behind,
          and if a document named here is not where the link says. */}
      <p className="licence-provenance">
        <strong>Built to be incorporated.</strong> formancy is not a medical device and
        claims no conformity. It ships the characterisation a manufacturer needs under
        IEC 62304 to treat it as software of known provenance — a{' '}
        <a href={`${REPO}/blob/main/docs/regulatory/SOUP-DECLARATION.md`} rel="noreferrer noopener">
          SOUP declaration
        </a>
        , a{' '}
        <a href={`${REPO}/blob/main/docs/regulatory/SAFETY-ANALYSIS.md`} rel="noreferrer noopener">
          safety analysis
        </a>
        , the{' '}
        <a href={`${REPO}/blob/main/docs/regulatory/LIFECYCLE.md`} rel="noreferrer noopener">
          lifecycle
        </a>{' '}
        and the{' '}
        <a href={`${REPO}/tree/main/docs/decisions`} rel="noreferrer noopener">
          design rationale
        </a>{' '}
        — as an input to your risk analysis, not a substitute for it.
      </p>
    </>
  )
}
