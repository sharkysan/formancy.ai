import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { App } from './app.js'

/**
 * The theme editor, as a visitor meets it.
 *
 * The arithmetic is in `theme-tokens.test.ts`; these cases are about the pane:
 * that the controls a theme gets follow the theme, that editing one is an
 * override rather than a fork, and that there is a way back.
 *
 * **What jsdom can and cannot see here**, because it decides what is worth
 * asserting:
 *
 * - It *can* read CSSOM. jsdom parses a `<style>` into rules and exposes custom
 *   properties on them, which is why the discovery works at all in this suite —
 *   checked before any of this was written.
 * - It *cannot* tell you that the form looks different. No cascade means the
 *   override changes no rendered colour here. What these cases pin is that the
 *   property lands on the themed host; that it *works* is checked in Chromium by
 *   `pnpm test:browser`, which reads the computed colour of a real control.
 */
vi.mock('@monaco-editor/react', () => ({
  default: ({ value }: { value?: string }) => (
    <textarea readOnly aria-label="Schema" value={value ?? ''} />
  ),
  useMonaco: () => null,
}))

/*
 * The shipped themes, attached by hand.
 *
 * Vitest does not process CSS by default, so the app's `import '…blueprint.css'`
 * is a no-op here and `document.styleSheets` is empty -- which is what the first
 * version of these cases found: no stylesheet, no tokens, no controls, and seven
 * failures that looked like a broken component.
 *
 * Turning CSS processing on would have made jsdom parse five theme files for
 * every suite in this package. Attaching the two that are switched between is
 * both cheaper and **stronger**: the discovery runs against the real files rather
 * than against whatever a bundler decided to emit.
 */
const here = dirname(fileURLToPath(import.meta.url))
const themesDir = join(here, '..', '..', '..', 'packages', 'themes')
const attached: HTMLStyleElement[] = []

beforeAll(() => {
  for (const name of ['blueprint', 'dusk']) {
    const style = document.createElement('style')
    style.textContent = readFileSync(join(themesDir, `${name}.css`), 'utf8')
    document.head.append(style)
    attached.push(style)
  }
})

afterAll(() => {
  while (attached.length > 0) attached.pop()?.remove()
})

afterEach(cleanup)

/** The playground with the theme editor open. */
const openEditor = async (): Promise<ReturnType<typeof userEvent.setup>> => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'Theme' }))
  return user
}

/**
 * The swatch belonging to one token.
 *
 * Scoped by name, not `querySelector` on the first match: the tokens are sorted,
 * so the first colour is `chrome` and a case that edited `ink` and read that
 * swatch was comparing two different tokens. It failed with `#eef2f6`, which is
 * chrome's value and the clearest possible message about which mistake it was.
 */
const swatchFor = (token: string): HTMLInputElement => {
  const label = [...document.querySelectorAll('.theme-token')].find(
    (candidate) => candidate.querySelector('.theme-token-name')?.textContent === token,
  )
  expect(label, `no control for ${token}`).toBeDefined()
  const swatch = label?.querySelector('input[type="color"]')
  expect(swatch, `${token} has no colour picker`).not.toBeNull()
  return swatch as HTMLInputElement
}

/** The element the overrides are applied to. */
const host = (): HTMLElement => {
  const found = document.querySelector('.sheet[data-formancy-theme]')
  expect(found, 'no themed host in the document').not.toBeNull()
  return found as HTMLElement
}

describe('the theme editor', () => {
  test('is a third way into the document, beside Build and Schema', () => {
    // Not a fourth pane: the editor pane already switches modes, theming is an
    // authoring concern, and a new pane would have meant new splitters and a new
    // fold target for something that is not a different subject.
    render(<App />)

    for (const mode of ['Build', 'Schema', 'Theme']) {
      expect(screen.getByRole('button', { name: mode }), mode).toBeTruthy()
    }
  })

  test('offers a control for each token the applied theme declares, and names it', async () => {
    /*
     * The feature, and the reason it is not a fixed list: `blueprint` declares
     * `--fm-ink`, `--fm-paper`, `--fm-chrome` and `--fm-rule`, while `dusk`
     * declares `--fm-ground`, `--fm-raised`, `--fm-inset` and `--fm-edge`. A set
     * of controls written down here would be wrong for three of the four shipped
     * themes and for every theme somebody else writes.
     */
    await openEditor()

    for (const token of ['ink', 'paper', 'chrome', 'rule', 'signal', 'radius', 'step']) {
      expect(screen.getByRole('textbox', { name: token }), token).toBeTruthy()
    }
  })

  test('and nothing a theme sets on an element rather than on itself', async () => {
    /*
     * Measured in Chromium before the discovery rule was written: `blueprint`
     * declares fourteen `--fm-*` properties and two of them are `--fm-columns`
     * and `--fm-datagrid-count`, set on `[data-columns='3']` so a layout can read
     * its own column count. A control for those would be a control that breaks
     * the grid.
     */
    await openEditor()

    expect(screen.queryByRole('textbox', { name: 'columns' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'datagrid count' })).toBeNull()
  })

  test('a colour gets a picker as well as a field, because the field is the one that can say oklch', async () => {
    // The picker only speaks six-digit hex. A theme may legitimately write
    // `oklch()`, and a control that could only express part of a value would
    // destroy the rest of it on first use — so the text field is the control and
    // the picker is an assist.
    await openEditor()

    expect(screen.getByRole('textbox', { name: 'ink' })).toBeTruthy()
    expect(host().querySelector('input[type="color"]')).toBeNull()
    expect(document.querySelector('.theme-token[data-kind="colour"] input[type="color"]')).not.toBeNull()
  })

  test('editing a token puts it on the themed host as a custom property', async () => {
    /*
     * A custom property, not the resolved declaration. The lesson from the pane
     * template (0100): an inline `background` would beat the theme's own rules
     * for every element below it, including the ones that compute from the token.
     * Setting the variable leaves the declarations in the cascade.
     */
    const user = await openEditor()

    const ink = screen.getByRole('textbox', { name: 'ink' })
    await user.clear(ink)
    await user.type(ink, '#ff0000')

    expect(host().style.getPropertyValue('--fm-ink')).toBe('#ff0000')
  })

  test('and shows the patch, which is only what was changed', async () => {
    /*
     * Only the overrides. A full dump would be a fork: paste it into a project
     * and the next release of `@formancy/themes` changes nothing, because every
     * value is pinned.
     */
    const user = await openEditor()

    const radius = screen.getByRole('textbox', { name: 'radius' })
    await user.clear(radius)
    await user.type(radius, '14px')

    const output = screen.getByLabelText('Theme CSS').textContent ?? ''
    expect(output).toContain('--fm-radius: 14px;')
    expect(output, 'the patch carries a token nobody changed').not.toContain('--fm-ink')
  })

  test('and resetting gives the theme back', async () => {
    // The way out of a bad edit. Without it the only way back is a reload, which
    // also throws away the schema somebody was working on.
    const user = await openEditor()

    const ink = screen.getByRole('textbox', { name: 'ink' })
    await user.clear(ink)
    await user.type(ink, '#ff0000')
    expect(host().style.getPropertyValue('--fm-ink')).toBe('#ff0000')

    await user.click(screen.getByRole('button', { name: /^Reset/ }))

    expect(host().style.getPropertyValue('--fm-ink')).toBe('')
    expect(screen.getByLabelText('Theme CSS').textContent).toContain('nothing changed yet')
  })

  test('and a cleared field puts nothing on the host rather than an empty value', async () => {
    /*
     * The blank stays in the map so the field keeps what was typed; it must not
     * reach the element, where `--fm-ink: ''` is a declaration the browser
     * discards and a token the theme can no longer provide.
     *
     * Added after a mutation run: applying the raw map instead of `applied`
     * left the suite green, because no case cleared a field and then looked at
     * the host.
     */
    const user = await openEditor()

    const ink = screen.getByRole('textbox', { name: 'ink' })
    await user.clear(ink)
    await user.type(ink, '#ff0000')
    expect(host().style.getPropertyValue('--fm-ink')).toBe('#ff0000')

    await user.clear(ink)

    expect((ink as HTMLInputElement).value, 'clearing snapped the field back to the theme value').toBe('')
    expect(host().style.getPropertyValue('--fm-ink'), 'a blank was applied to the host').toBe('')
  })

  test('and resetting puts the theme’s own value back in the field, not the edited one', async () => {
    /*
     * The baseline is read with our overrides lifted off the host, so it is the
     * theme's value rather than whatever is currently applied. Reading through
     * them would make the first edit the new baseline: reset would return to it,
     * the control would look like it worked, and the way back would be gone.
     *
     * Added after a mutation run that removed the lifting and left the suite
     * green, because the only reset case looked at the host and not the field.
     */
    const user = await openEditor()

    const ink = screen.getByRole('textbox', { name: 'ink' })
    const themeValue = (ink as HTMLInputElement).value
    expect(themeValue, 'the control opened with no value at all').not.toBe('')

    await user.clear(ink)
    await user.type(ink, '#ff0000')

    /*
     * Away and back, which is what makes this reachable at all. The baseline is
     * read in an effect keyed on the theme and the token names, so editing alone
     * never re-runs it — the first version of this case edited and reset in place
     * and passed with the lifting removed. Switching themes changes the names, so
     * coming back re-reads the baseline **with the override applied to the host**,
     * which is exactly the moment it can be contaminated.
     *
     * The sequence is also an ordinary one: change a colour, look at another
     * theme, come back, decide against it.
     */
    const themes = screen.getByRole('combobox', { name: /theme/i })
    await user.selectOptions(themes, 'dusk')
    await user.selectOptions(themes, 'blueprint')

    await user.click(screen.getByRole('button', { name: /^Reset/ }))

    expect(
      (screen.getByRole('textbox', { name: 'ink' }) as HTMLInputElement).value,
      'reset returned to the edited value rather than the theme’s',
    ).toBe(themeValue)
  })

  test('and whitespace is not a value, so spaces reach nothing', async () => {
    /*
     * React already drops a style property whose value is the empty string, so
     * the blank case is covered twice over. It does **not** drop one that is
     * whitespace — `--fm-ink: '   '` would be set on the element, where it is a
     * token the theme can no longer provide and a control that renders with no
     * colour at all.
     *
     * **CSSOM is what enforces this, not this app.** Measured: setting a
     * whitespace-only custom property stores the empty string. The case stays
     * because the behaviour matters to somebody pasting out of a design tool,
     * and it says plainly who provides it — a mutation run showed that filtering
     * in the component changed nothing, so that call is gone rather than left
     * looking load-bearing.
     */
    const user = await openEditor()

    const ink = screen.getByRole('textbox', { name: 'ink' })
    await user.clear(ink)
    await user.type(ink, '   ')

    expect(host().style.getPropertyValue('--fm-ink'), 'whitespace was applied as a value').toBe('')
    expect(screen.getByLabelText('Theme CSS').textContent).toContain('nothing changed yet')
  })

  test('and a pasted value keeps its colour rather than its spaces', async () => {
    /*
     * Pasting out of a design tool brings whitespace with it often enough to
     * matter, and `--fm-ink:   #ff0000  ` is a value CSSOM may keep verbatim.
     *
     * Trimmed by CSSOM rather than by anything here — measured, in jsdom and in
     * Chromium. Asserted anyway, because it is the behaviour a person meets and
     * the place a future change to how overrides are applied would break it.
     */
    const user = await openEditor()

    const ink = screen.getByRole('textbox', { name: 'ink' })
    await user.clear(ink)
    await user.type(ink, '  #ff0000  ')

    expect(host().style.getPropertyValue('--fm-ink')).toBe('#ff0000')
    expect(screen.getByLabelText('Theme CSS').textContent).toContain('--fm-ink: #ff0000;')
  })

  test('and a reset button that does nothing is disabled rather than present', async () => {
    // A control that is enabled and inert is worse than one that says it has
    // nothing to do.
    await openEditor()

    // The DOM property, not `toBeDisabled`: jest-dom's matchers are not set up
    // in this workspace and the property is what the browser acts on anyway.
    expect((screen.getByRole('button', { name: /^Reset/ }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Download CSS' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('and edits to one theme do not follow you to another', async () => {
    /*
     * The four declare different vocabularies, so carrying one map across a
     * switch would apply `--fm-hair` to a theme that has never heard of it — and
     * drop the edits on the way back. Kept per theme for that reason.
     */
    const user = await openEditor()

    const ink = screen.getByRole('textbox', { name: 'ink' })
    await user.clear(ink)
    await user.type(ink, '#ff0000')

    await user.selectOptions(screen.getByRole('combobox', { name: /theme/i }), 'dusk')
    expect(host().style.getPropertyValue('--fm-ink'), 'an edit followed the theme switch').toBe('')

    await user.selectOptions(screen.getByRole('combobox', { name: /theme/i }), 'blueprint')
    expect(host().style.getPropertyValue('--fm-ink'), 'the edit was lost rather than kept').toBe('#ff0000')
  })
})

describe('the two ways a value gets in', () => {
  test('the picker writes the token, not only the field beside it', async () => {
    /*
     * Uncovered until now, and the half most people will use: a colour is chosen
     * from the swatch far more often than typed. The field and the picker are two
     * controls over one token, so either writing and the other not is a control
     * that looks like it worked.
     */
    const user = await Promise.resolve(userEvent.setup())
    await openEditor()

    fireEvent.change(swatchFor('ink'), { target: { value: '#00ff00' } })

    expect(screen.getByLabelText('Theme CSS').textContent).toContain('#00ff00')
    void user
  })

  test('and the picker shows black for a value it cannot express', async () => {
    /*
     * `<input type="color">` speaks six-digit hex and nothing else. A theme may
     * legitimately write `oklch()` or a three-digit hex, and an invalid `value`
     * makes the control report `#000000` anyway — so the swatch is wrong rather
     * than empty, which is why the text field beside it is the control and this
     * is the assist. Asserted so that nobody later "fixes" the fallback into
     * something that throws.
     */
    const user = await Promise.resolve(userEvent.setup())
    await openEditor()

    const ink = screen.getByRole('textbox', { name: 'ink' })
    fireEvent.change(ink, { target: { value: 'oklch(55% 0.1 250)' } })

    expect(swatchFor('ink').value).toBe('#000000')
    expect(screen.getByLabelText('Theme CSS').textContent).toContain('oklch(55% 0.1 250)')
    void user
  })
})

describe('taking the patch away', () => {
  test('downloads a file named after the theme, carrying only the overrides', async () => {
    /*
     * The only way out of this editor, and nothing reached it. A button that
     * builds a blob and never triggers the download is a button that looks like
     * it worked — the browser shows nothing either way.
     *
     * `createObjectURL` does not exist in jsdom and `click()` on an anchor would
     * try to navigate, so both are stubbed. What is asserted is what a person
     * ends up with: the file's name and its contents.
     */
    const user = await Promise.resolve(userEvent.setup())
    await openEditor()

    const ink = screen.getByRole('textbox', { name: 'ink' })
    fireEvent.change(ink, { target: { value: '#ff0000' } })

    let downloaded: { name: string; text: string } | undefined
    const urls: string[] = []
    const revoked: string[] = []
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
      // The real signature takes a `MediaSource` too; narrowed here because only
      // a `Blob` is ever passed and the text is what the case is about.
      const file = blob as Blob
      const url = `blob:fake/${String(urls.length)}`
      urls.push(url)
      void file.text().then((text) => {
        downloaded = { name: downloaded?.name ?? '', text }
      })
      return url
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => void revoked.push(url))
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloaded = { name: this.download, text: downloaded?.text ?? '' }
    })

    await user.click(screen.getByRole('button', { name: 'Download CSS' }))
    // The blob is read asynchronously; one microtask turn is enough.
    await Promise.resolve()
    await Promise.resolve()

    expect(downloaded?.name).toBe('formancy-blueprint-overrides.css')
    expect(urls.length, 'no object URL was made, so nothing was offered').toBe(1)
    expect(revoked, 'the object URL was never revoked, which leaks it for the page’s life').toEqual(urls)
  })

  test('and what it contains is the patch, not the whole theme', async () => {
    /*
     * The claim that makes the output worth having: paste it into a project and
     * the next release of `@formancy/themes` still reaches you, because only the
     * tokens you changed are pinned. A full dump would be a fork.
     */
    const user = await Promise.resolve(userEvent.setup())
    await openEditor()

    fireEvent.change(screen.getByRole('textbox', { name: 'radius' }), { target: { value: '14px' } })

    let text = ''
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
      // The real signature takes a `MediaSource` too; narrowed here because only
      // a `Blob` is ever passed and the text is what the case is about.
      const file = blob as Blob
      void file.text().then((read) => {
        text = read
      })
      return 'blob:fake'
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    await user.click(screen.getByRole('button', { name: 'Download CSS' }))
    await Promise.resolve()
    await Promise.resolve()

    expect(text).toContain('--fm-radius: 14px;')
    expect(text, 'the file carries a token nobody changed').not.toContain('--fm-ink')
    expect(text.startsWith("[data-formancy-theme='blueprint']")).toBe(true)
  })
})
