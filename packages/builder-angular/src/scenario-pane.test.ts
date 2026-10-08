import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { render, screen, waitFor } from '@testing-library/angular'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createBuilderSession } from '@formancy/builder-core'
import type { Scenario } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyScenarioPane } from './scenario-pane.js'

/**
 * The same assertions as packages/builder-react/src/scenario-pane.test.tsx.
 *
 * Written twice on purpose, and what is written twice is only the part a
 * person touches. The runner belongs to `@formancy/core` and is tested there
 * against eighteen real templates; what counts as a regression belongs to
 * `@formancy/builder-core` and is tested there. What these two files hold is
 * that the pane reruns when the document changes and names what stopped
 * holding — the two things a panel adds, and the two a renderer could get
 * wrong on its own
 * ([0110](../../../docs/decisions/0110-a-form-is-checked-against-examples.md)).
 */
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

const form: FormSchema = {
  specVersion: '2',
  id: 'leave',
  title: 'Leave',
  model: {
    fields: [
      {
        key: 'kind',
        type: 'radio',
        label: 'Kind',
        options: [
          { value: 'holiday', label: 'Holiday' },
          { value: 'other', label: 'Other' },
        ],
      },
      { key: 'reason', type: 'text', label: 'Reason' },
    ],
  },
  logic: { rules: [{ target: 'reason', kind: 'visible', cel: "kind == 'other'" }] },
}

const SCENARIOS: Scenario[] = [
  { name: 'other shows the reason', changes: { kind: 'other' }, valid: true, visible: { reason: true } },
  { name: 'holiday hides it', changes: { kind: 'holiday' }, valid: true, visible: { reason: false } },
]

const inverted = (): FormSchema => {
  const next = JSON.parse(JSON.stringify(form)) as FormSchema
  next.logic!.rules[0]!.cel = "kind != 'other'"
  return next
}

async function mount(
  session: ReturnType<typeof createBuilderSession>,
  inputs: Record<string, unknown> = {},
): Promise<void> {
  await render(FormancyScenarioPane, {
    inputs: { session, ...inputs } as Record<string, unknown>,
    providers: [provideZonelessChangeDetection()],
  })
}

describe('when the host has no scenarios', () => {
  test('the pane is not there at all', async () => {
    // Rather than an empty table, which is how the prompt pane treats a model
    // nobody configured.
    await mount(createBuilderSession(form))

    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('with scenarios', () => {
  test('says they hold, and says it out loud', async () => {
    await mount(createBuilderSession(form), { scenarios: SCENARIOS })

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('All 2 scenarios hold'),
    )
  })

  test('names what stopped holding when the document changes under it', async () => {
    /*
     * The whole pane in one case. Inverting the rule passes every other gate
     * here: the expression compiles, the document validates, the engine opens
     * it. Only an example with its answer written down notices.
     */
    const session = createBuilderSession(form)
    await mount(session, { scenarios: SCENARIOS })
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('All 2'))

    session.replaceDocument(inverted())

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Stopped holding'))
    expect(screen.getByRole('status').textContent).toContain('other shows the reason')
  })

  test('and says when one holds again, so a repair is visible as a repair', async () => {
    const session = createBuilderSession(inverted())
    await mount(session, { scenarios: SCENARIOS })
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('do not hold'))

    session.replaceDocument(form)

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Holds again'))
  })

  test('a form that arrives with failing scenarios has not regressed', async () => {
    // It arrived that way. A list of things somebody is not responsible for
    // is how a panel stops being read.
    await mount(createBuilderSession(inverted()), { scenarios: SCENARIOS })

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('do not hold'))
    expect(screen.getByRole('status').textContent).not.toContain('Stopped holding')
  })

  test('shows what was expected and what happened, not that something failed', async () => {
    await mount(createBuilderSession(inverted()), { scenarios: SCENARIOS })

    await waitFor(() => expect(screen.getAllByRole('listitem').length).toBeGreaterThan(2))
    const text = screen.getAllByRole('listitem').map((item) => item.textContent ?? '').join(' ')
    expect(text).toContain('reason')
    expect(text).toMatch(/expected to be visible|expected to be hidden/)
  })

  test('and removing one goes back to the host rather than being swallowed', async () => {
    const user = userEvent.setup()
    const changed = vi.fn()
    await render(FormancyScenarioPane, {
      inputs: { session: createBuilderSession(form), scenarios: SCENARIOS, removable: true } as Record<
        string,
        unknown
      >,
      on: { scenariosChange: changed },
      providers: [provideZonelessChangeDetection()],
    })

    await user.click(screen.getByRole('button', { name: 'Remove holiday hides it' }))

    expect(changed).toHaveBeenCalledWith([SCENARIOS[0]])
  })

  test('and is read-only unless the host asks for the buttons', async () => {
    // A button whose event goes nowhere is worse than no button.
    await mount(createBuilderSession(form), { scenarios: SCENARIOS })

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('hold'))
    expect(screen.queryByRole('button')).toBeNull()
  })
})
