import { useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react'
import type { BuilderSession } from '@formancy/builder-core'
import type { LayoutNode } from '@formancy/spec'
import {
  codeAnswers,
  describeLayoutTarget,
  insertLayoutAndSay,
  layoutAdditions,
  layoutNodeFor,
  nameOfAddition,
  nextSpecVersion,
  upgradeAndSay,
} from '@formancy/builder-core'
import { useBuilder } from './use-builder.js'

export interface LayoutAddProps {
  session: BuilderSession
  layout: string
  /**
   * A command ran, and this is what it said. The pane announces it. Moving the
   * document to a newer spec version says something and keeps the palette open,
   * because the code it unlocks is the next thing the person wants to choose.
   */
  onSaid: (said: string) => void
  /** The conversation is over: something was placed, or the person left. */
  onClose: () => void
}

/** Which question is being asked. `where` is asked about the node already built. */
type Step = { step: 'what' } | { step: 'which-answer' } | { step: 'where'; node: LayoutNode }

/**
 * Adding something to an arrangement: what, which answer a code shows, and where.
 *
 * Its own component because it is its own conversation — three dialogs with a
 * state of their own that nothing else in the pane reads — and the same seam the
 * Angular pane has. What is offered, what each new node looks like and what is
 * said afterwards are builder-core's, so the two builders cannot offer different
 * things for one document
 * ([0116](../../../docs/decisions/0116-what-a-builder-says-is-decided-once.md)).
 */
export function LayoutAdd({ session, layout, onSaid, onClose }: LayoutAddProps): ReactElement {
  const view = useBuilder(session)
  const { text } = session
  const [step, setStep] = useState<Step>({ step: 'what' })

  // Escape inside a dialog closes it — every one of the three, where the last
  // used to need Cancel. On the dialog rather than the document, so it cannot
  // swallow the key from anything else on the page.
  const onDialogKey = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    onClose()
  }

  const cancel = (
    <button type="button" onClick={onClose}>
      {text('dialog.cancel')}
    </button>
  )

  if (step.step === 'which-answer') {
    return (
      <div
        role="dialog"
        aria-label={text('layout.codeWhich')}
        data-formancy-part="layout-add-which"
        onKeyDown={onDialogKey}
      >
        <ul>
          {codeAnswers(session).map((answer) => (
            <li key={answer.path}>
              <button
                type="button"
                onClick={() =>
                  setStep({
                    step: 'where',
                    node: layoutNodeFor(session, { what: 'code', path: answer.path }),
                  })
                }
              >
                {answer.label}
              </button>
            </li>
          ))}
        </ul>
        {cancel}
      </div>
    )
  }

  if (step.step === 'where') {
    const targets = session.validLayoutTargets(layout, step.node).map((location) => ({
      location,
      label: describeLayoutTarget(view.document, location, undefined, text),
    }))
    return (
      <div
        role="dialog"
        aria-label={text('layout.addWhere', { what: nameOfAddition(session, step.node) })}
        data-formancy-part="layout-add-where"
        onKeyDown={onDialogKey}
      >
        <ul>
          {targets.map((target) => (
            <li key={`${target.location.parent.join('.')}:${String(target.location.index)}`}>
              <button
                type="button"
                onClick={() => {
                  onSaid(insertLayoutAndSay(session, step.node, target))
                  onClose()
                }}
              >
                {target.label}
              </button>
            </li>
          ))}
        </ul>
        {cancel}
      </div>
    )
  }

  return (
    <div
      role="dialog"
      aria-label={text('layout.addTitle')}
      data-formancy-part="layout-add"
      onKeyDown={onDialogKey}
    >
      <ul>
        {/* A code needs an answer to encode, so it takes a step the others do not;
            in a version 1 document it is offered with the upgrade rather than as a
            dead end, because legality is decided by trying the edit and a code in
            version 1 had no destination at all. */}
        {layoutAdditions(session, layout).map((addition) => (
          <li
            key={
              addition.what === 'field'
                ? `field:${addition.path}`
                : addition.what === 'container'
                  ? addition.kind
                  : 'code'
            }
          >
            {addition.what === 'code' && addition.locked ? (
              <>
                <span data-formancy-part="palette-locked">{addition.label}</span>
                <span data-formancy-part="palette-hint">
                  {addition.hint}{' '}
                  <button type="button" onClick={() => onSaid(upgradeAndSay(session))}>
                    {text('tree.upgrade', {
                      version: nextSpecVersion(view.document.specVersion) ?? '',
                    })}
                  </button>
                </span>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setStep(
                      addition.what === 'code'
                        ? { step: 'which-answer' }
                        : {
                            step: 'where',
                            node: layoutNodeFor(
                              session,
                              addition.what === 'field'
                                ? { what: 'field', path: addition.path }
                                : { what: 'container', kind: addition.kind },
                            ),
                          },
                    )
                  }
                >
                  {addition.label}
                </button>
                <span data-formancy-part="palette-hint">{addition.hint}</span>
              </>
            )}
          </li>
        ))}
      </ul>
      {cancel}
    </div>
  )
}
