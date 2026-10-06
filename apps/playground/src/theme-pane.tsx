import { useEffect, useMemo, useState } from 'react'
import { applied, classify, declarationsOf, exportCss, resolve, themeTokens } from './theme-tokens.js'

/**
 * Editing the theme that is on screen, token by token.
 *
 * **The control list is discovered, not written down.** The four shipped themes
 * declare different vocabularies on purpose, so a fixed set of controls could
 * not edit them — and the version that could would have to flatten the property
 * that makes them worth shipping
 * ([0103](../../../docs/decisions/0103-a-theme-editor-edits-what-a-theme-declares.md)).
 * The side effect is the better feature: this works on a theme somebody else
 * wrote, with no registration step.
 *
 * **An override is a custom property set inline on the host**, which is the
 * lesson from the pane template: set the variable and leave the declarations to
 * the cascade ([0100](../../../docs/decisions/0100-a-pane-boundary-is-dragged.md)).
 * Setting the resolved property instead would win against the theme's own rules
 * for every element below, including the ones that compute from it.
 *
 * It does not persist. Nothing in this app does, and what comes out is a CSS
 * patch to paste into a project rather than a saved setting.
 */
export function ThemePane({
  theme,
  host,
  overrides,
  onChange,
}: {
  /** The theme currently applied, which is the one being edited. */
  theme: string
  /**
   * The element carrying `data-formancy-theme`, or null before the form has
   * mounted. Read for the values a control opens at, because what a rule
   * *declares* and what the browser *resolved* are different questions.
   */
  host: Element | null
  overrides: Readonly<Record<string, string>>
  onChange: (next: Record<string, string>) => void
}) {
  /*
   * Discovered once per theme rather than per render.
   *
   * Walking every rule in every stylesheet is ~1,800 rules in the playground.
   * That is nothing once and visible per keystroke, and the set of names a theme
   * declares cannot change while the page is open — only the values can, which
   * is what `resolve` is for.
   */
  const declared = useMemo(
    () => themeTokens(declarationsOf(document.styleSheets)).get(theme) ?? {},
    [theme],
  )

  const names = useMemo(() => Object.keys(declared).sort(), [declared])

  /** What each token resolves to with no override of ours applied. */
  const [base, setBase] = useState<Record<string, string>>({})
  useEffect(() => {
    if (host === null) return
    /*
     * Read with our overrides lifted, so the baseline is the theme's own value.
     * Reading through them would make the first edit the new baseline and a
     * reset return to it — the control would look like it worked and quietly
     * lose the way back.
     */
    const lifted = Object.keys(overrides).map((token) => {
      const was = (host as HTMLElement).style.getPropertyValue(token)
      ;(host as HTMLElement).style.removeProperty(token)
      return [token, was] as const
    })
    setBase(resolve(host, names))
    for (const [token, was] of lifted) (host as HTMLElement).style.setProperty(token, was)
    // `overrides` is deliberately not a dependency: this is the theme's own
    // value, which does not change when somebody edits one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, names])

  // Whatever was typed, blank included. See `applied` for why the blank stays.
  const set = (token: string, value: string): void => onChange({ ...overrides, [token]: value })

  const css = exportCss(theme, overrides)
  const changed = Object.keys(applied(overrides)).length

  return (
    <div className="theme-editor">
      <p className="theme-intro">
        Every token the <strong>{theme}</strong> theme declares, read from its stylesheet. The four
        shipped themes declare different ones on purpose, so this list follows the theme rather than
        the other way round — including a theme of your own.
      </p>

      <div className="theme-tokens">
        {names.map((token) => {
          const current = overrides[token] ?? base[token] ?? declared[token] ?? ''
          const kind = classify(base[token] ?? declared[token] ?? '')
          const label = token.replace('--fm-', '').replace(/-/g, ' ')

          return (
            <label key={token} className="theme-token" data-kind={kind}>
              <span className="theme-token-name">{label}</span>
              {kind === 'colour' ? (
                <span className="theme-token-colour">
                  {/* A picker needs a hex; a theme may legitimately write
                      `oklch()`, which it cannot show. The text field beside it is
                      the one that can express the value either way, so the picker
                      is an assist rather than the control. */}
                  <input
                    type="color"
                    aria-label={`${label} colour`}
                    value={/^#[0-9a-f]{6}$/i.test(current) ? current : '#000000'}
                    onChange={(event) => set(token, event.target.value)}
                  />
                  <input
                    type="text"
                    aria-label={label}
                    value={current}
                    onChange={(event) => set(token, event.target.value)}
                  />
                </span>
              ) : (
                <input
                  type="text"
                  aria-label={label}
                  inputMode={kind === 'number' ? 'decimal' : undefined}
                  value={current}
                  onChange={(event) => set(token, event.target.value)}
                />
              )}
            </label>
          )
        })}
      </div>

      <div className="theme-actions">
        <button type="button" onClick={() => onChange({})} disabled={changed === 0}>
          Reset {changed === 0 ? '' : `(${String(changed)})`}
        </button>
        <button
          type="button"
          disabled={css === ''}
          onClick={() => {
            // A file rather than the clipboard: a clipboard write needs a
            // permission prompt in some browsers and fails silently in others,
            // and there is nowhere here to report that it did.
            const blob = new Blob([css], { type: 'text/css' })
            const link = document.createElement('a')
            link.href = URL.createObjectURL(blob)
            link.download = `formancy-${theme}-overrides.css`
            link.click()
            URL.revokeObjectURL(link.href)
          }}
        >
          Download CSS
        </button>
      </div>

      {/* The patch itself, because somebody reading it is how they learn there
          is nothing proprietary in the output. Only what was changed: a full
          dump would be a fork that stops inheriting the next release. */}
      <pre className="theme-output" aria-label="Theme CSS">
        {css === '' ? '/* nothing changed yet */' : css}
      </pre>
    </div>
  )
}
