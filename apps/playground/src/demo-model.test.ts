import { afterEach, describe, expect, test, vi } from 'vitest'
import { authorForm } from '@formancy/builder-core'
import { DEMO_MODEL } from './demo-capabilities.js'

/**
 * The stand-in model: the person plays it, through `window.prompt`.
 *
 * Driven through `authorForm` rather than the whole page, because what is under
 * test is what the stand-in hands the loop — the dialog is the only part of it
 * that is pretend.
 */
afterEach(() => {
  vi.restoreAllMocks()
})

describe('the stand-in model', () => {
  test('a cancelled dialog ends the run at once, as a model that could not be asked', async () => {
    /*
     * It answered '' instead, and its comment said it handed back the current
     * document. An empty string is not JSON, so cancelling bought a dialog for
     * every remaining attempt and then "3 attempts, and the document still did
     * not work" — for a run nobody had answered at all.
     */
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null)

    const result = await authorForm(DEMO_MODEL, 'add a phone number')

    expect(result).toMatchObject({ ok: false, ended: 'unreachable', problems: [] })
    expect(prompt).toHaveBeenCalledTimes(1)
  })

  test('says which attempt it is, and from the second shows the complaint alone', async () => {
    // The playground is where somebody sees what a model is handed each turn,
    // so the stand-in shows the turn's own fields rather than the prompt's tail.
    const prompt = vi
      .spyOn(window, 'prompt')
      .mockReturnValueOnce('not json')
      .mockReturnValueOnce(null)

    await authorForm(DEMO_MODEL, 'add a phone number')

    const [first, second] = prompt.mock.calls.map((call) => String(call[0]))
    expect(first).toContain('attempt 1 of 3')
    expect(first).toContain('add a phone number')
    expect(second).toContain('attempt 2 of 3')
    expect(second).toContain('That was not JSON')
    expect(second).not.toContain('add a phone number')
  })
})
