/**
 * The engine pane's contents: the submission value, and every field it tracks.
 *
 * Its own file for the reason `app.tsx`'s size ceiling gives — one pane per
 * file. It is also the clearest of the three to read alone: two
 * `useSyncExternalStore` subscriptions over one engine, which is the protocol
 * the React binding is built on, in about forty lines.
 */
import { useSyncExternalStore } from 'react'
import { parsePath } from '@formancy/core'
import type { FormEngine } from '@formancy/core'

export function EngineInspector({ engine }: { engine: FormEngine }) {
  const value = useSyncExternalStore(
    (onChange) => engine.subscribe(onChange),
    () => JSON.stringify(engine.value(), null, 2),
    () => JSON.stringify(engine.value(), null, 2),
  )
  const errors = useSyncExternalStore(
    (onChange) => engine.subscribe(onChange),
    () => engine.visibleErrors(),
    () => engine.visibleErrors(),
  )

  return (
    <div>
      <h3>Submission value</h3>
      <pre>{value}</pre>

      <h3>Errors a person can see</h3>
      {errors.length === 0 ? (
        <p className="empty">None — nothing invalid has been touched yet.</p>
      ) : (
        <ul>
          {errors.map((entry) => (
            <li key={entry.path}>
              {entry.path} <span className="code">{entry.codes.join(', ')}</span>
            </li>
          ))}
        </ul>
      )}

      <h3>Fields the engine is tracking</h3>
      <ul>
        {engine.fieldPaths().map((path) => {
          const hidden = !engine.getFieldSnapshot(parsePath(path)).visible
          return (
            <li key={path} className={hidden ? 'hidden-field' : undefined}>
              {path}
              {hidden ? <span className="tag">hidden</span> : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
