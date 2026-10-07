import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { App } from './app.js'
import { defineNightTheme } from './editor-pane.js'

/**
 * The Schema mode, which no test reached.
 *
 * **Monaco is mocked in every suite in this package**, so the wiring between the
 * editor and the document was covered by nothing — and that is how the Schema
 * view shipped broken: the theme editor's `display: flex` beat `[hidden]` and
 * rendered over it, and the only thing that noticed was somebody opening the
 * page ([0100](../../../docs/decisions/0100-a-pane-boundary-is-dragged.md) is the
 * same cascade class). The layout half is now held in Chromium by
 * `pnpm test:browser`; these are the halves a mock can still answer for.
 */
const schemaTextarea = vi.hoisted(() => ({ onChange: undefined as ((value?: string) => void) | undefined }))

/*
 * A mock that actually calls `onChange`.
 *
 * The other suites' mock renders a read-only textarea, which is enough to assert
 * that the schema is *shown* and asserts nothing about editing it. This one wires
 * the textarea to the prop, so typing reaches the real handler — the one thing a
 * mocked editor can still prove about the pane that owns it.
 */
vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }: { value?: string; onChange?: (value?: string) => void }) => {
    schemaTextarea.onChange = onChange
    return (
      <textarea
        aria-label="Schema"
        value={value ?? ''}
        onChange={(event) => onChange?.(event.target.value)}
      />
    )
  },
  useMonaco: () => null,
}))

afterEach(cleanup)

describe('the Monaco theme the Schema view asks for', () => {
  test('is the one that gets defined, which is two places claiming one string', () => {
    /*
     * `theme="formancy-night"` on the editor and `defineTheme('formancy-night')`
     * in the function beside it. If those ever disagree Monaco **silently falls
     * back** to its default — no error, no warning, just the wrong colours and a
     * reader who assumes the theme is what the project ships.
     *
     * The question this repository asks of any pair: if these two disagreed,
     * would anybody find out? Until now, no.
     */
    const defined: string[] = []
    defineNightTheme({ editor: { defineTheme: (name: string) => defined.push(name) } } as never)

    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'editor-pane.tsx'),
      'utf8',
    )
    const asked = /theme="([^"]+)"/.exec(source)?.[1]

    expect(asked, 'the editor asks for no theme at all').toBeDefined()
    expect(defined, 'the editor asks for a theme nothing defines').toContain(asked)
  })

  test('and it is a dark theme that inherits, so unlisted tokens still have colours', () => {
    /*
     * `inherit: false` would leave every token this palette does not name
     * unstyled — a JSON document is mostly punctuation, and the parts nobody
     * thought to list are the parts that would vanish.
     */
    let captured: { base?: string; inherit?: boolean; rules?: unknown[] } | undefined
    defineNightTheme({
      editor: { defineTheme: (_name: string, theme: typeof captured) => void (captured = theme) },
    } as never)

    expect(captured?.base).toBe('vs-dark')
    expect(captured?.inherit).toBe(true)
    expect((captured?.rules ?? []).length, 'the palette names no tokens').toBeGreaterThan(0)
  })
})

describe('editing the schema by hand', () => {
  test('reaches the document, which is what the Build pane then reads', async () => {
    /*
     * The pane's whole purpose, and it was uncovered: `onChange` is the line that
     * carries a typed character from the editor into the engine. A pane that
     * rendered the text and dropped the edits would look entirely correct until
     * somebody typed.
     */
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Schema' }))

    const before = (screen.getByRole('textbox', { name: 'Schema' }) as HTMLTextAreaElement).value
    expect(before, 'the schema editor opened empty').toContain('specVersion')

    const edited = before.replace('"title"', '"title2"')
    fireEvent.change(screen.getByRole('textbox', { name: 'Schema' }), { target: { value: edited } })

    expect((screen.getByRole('textbox', { name: 'Schema' }) as HTMLTextAreaElement).value).toBe(edited)
  })

  test('and an editor that reports no text at all leaves the document alone', () => {
    /*
     * Monaco's `onChange` gives `string | undefined`, and the pane answers
     * `next ?? ''`. That branch is reachable only from Monaco itself — it fires
     * with `undefined` when a model is disposed — so a mock is the only way to
     * ask about it. Without the fallback the document would become `undefined`
     * and the engine would be rebuilt from nothing.
     */
    render(<App />)
    expect(schemaTextarea.onChange, 'the editor was never given an onChange').toBeTypeOf('function')

    schemaTextarea.onChange?.(undefined)

    expect(() => screen.getByRole('button', { name: 'Schema' })).not.toThrow()
  })
})
