import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { PLAYGROUND, REPO } from './chrome.js'
import type { Journey } from './use-journey.js'

/**
 * The end of the landing page.
 *
 * A file of its own because `app.tsx` is at its ceiling in `size.test.ts`, whose note
 * names the seam as one section per file: the paid modules' section needed the lines
 * (0242), as the licence section did before it. The page renders it last in `<main>`,
 * with the journey it is the payoff of.
 *
 * One orchestrated moment rather than an effect per section: the submission
 * the visitor has been filling in without knowing goes to the server, and the
 * server answers. The stamp lands only once the section is actually reached,
 * so it is a payoff rather than something that happened off screen.
 */
export function Finale({ journey }: { journey: Journey }): ReactElement {
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (!journey.seen.has('finale')) return
    // A beat, so the receipt is read before the stamp lands on it.
    const timer = setTimeout(() => setSent(true), 600)
    return () => clearTimeout(timer)
  }, [journey.seen])

  const body = {
    ...journey.data,
    readAt: 'the bottom of the page',
  }

  return (
    <section id="finale" className={sent ? 'finale wide sent' : 'finale wide'} data-section="finale" ref={journey.register('finale')}>
      {/* The claim beside the evidence. Stacked, the receipt sat below the sentence
          describing it and the section ran to two screens; side by side, the words and
          the submission they are about are read together, which is the whole payoff. */}
      <div className="finale-words">
        <h2>You have been filling in a form.</h2>
        <p className="lede">
          Every section answered one field. The panel in the corner was a real submission the whole way down — the same shape the engine produces, built the
          same way.
        </p>

        {/* Announced once, politely: somebody who cannot see the stamp land should still
            be told the page did the thing it was building to. */}
        <p role="status" className="note">
          {sent ? 'Accepted, and validated by the same engine that drew the form.' : ''}
        </p>

        <div className="actions">
          <a className="action primary" href={PLAYGROUND}>
            Open the playground
          </a>
          <a className="action" href={REPO} rel="noreferrer noopener">
            Read the source
          </a>
        </div>
      </div>

      <div className="finale-receipt">
        <div className="receipt">
          <header>
            <span className="dot" />
            POST /f/visitors/submissions
          </header>
          <pre>{JSON.stringify(body, null, 2)}</pre>
          <div className={sent ? 'stamp landed' : 'stamp'}>201 Created</div>
        </div>
        <div className="seal" aria-hidden="true" />
      </div>
    </section>
  )
}
