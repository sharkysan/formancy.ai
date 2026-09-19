import { describe, expect, test, vi } from 'vitest'
import { createWizard } from './wizard.js'

describe('createWizard', () => {
  test('starts on the first page', () => {
    const wizard = createWizard({ pageCount: 3, validatePage: () => true })
    expect(wizard.page()).toBe(0)
    expect(wizard.pageCount).toBe(3)
  })

  test('next advances when the current page validates', async () => {
    const wizard = createWizard({ pageCount: 3, validatePage: () => true })

    await expect(wizard.next()).resolves.toBe(true)
    expect(wizard.page()).toBe(1)
  })

  test('next stays put and reports failure when the current page is invalid', async () => {
    const wizard = createWizard({ pageCount: 3, validatePage: () => false })

    await expect(wizard.next()).resolves.toBe(false)
    expect(wizard.page()).toBe(0)
  })

  test('next validates only the page being left, not the whole form', async () => {
    const validatePage = vi.fn().mockReturnValue(true)
    const wizard = createWizard({ pageCount: 3, validatePage })

    await wizard.next()

    expect(validatePage).toHaveBeenCalledTimes(1)
    expect(validatePage).toHaveBeenCalledWith(0)
  })

  test('back never validates: a user may always retreat from a broken page', async () => {
    const validatePage = vi.fn().mockReturnValue(true)
    const wizard = createWizard({ pageCount: 3, validatePage })
    await wizard.next()
    validatePage.mockClear()

    wizard.back()

    expect(wizard.page()).toBe(0)
    expect(validatePage).not.toHaveBeenCalled()
  })

  test('back on the first page is a silent no-op', () => {
    const wizard = createWizard({ pageCount: 3, validatePage: () => true })
    wizard.back()
    expect(wizard.page()).toBe(0)
  })

  test('next on the last page reports false without moving — submit is a separate act', async () => {
    const wizard = createWizard({ pageCount: 2, validatePage: () => true })
    await wizard.next()

    await expect(wizard.next()).resolves.toBe(false)
    expect(wizard.page()).toBe(1)
  })

  test('supports an async page validator', async () => {
    const wizard = createWizard({ pageCount: 2, validatePage: async () => true })

    await expect(wizard.next()).resolves.toBe(true)
    expect(wizard.page()).toBe(1)
  })

  test('notifies subscribers when the page changes, and only then', async () => {
    const invalid = createWizard({ pageCount: 2, validatePage: () => false })
    const listener = vi.fn()
    invalid.subscribe(listener)

    await invalid.next()
    expect(listener).not.toHaveBeenCalled()

    const valid = createWizard({ pageCount: 2, validatePage: () => true })
    valid.subscribe(listener)
    await valid.next()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  test('overlapping next calls cannot double-advance while an async validation is in flight', async () => {
    let resolveValidation!: (ok: boolean) => void
    const wizard = createWizard({
      pageCount: 3,
      validatePage: () => new Promise<boolean>((resolve) => (resolveValidation = resolve)),
    })

    const first = wizard.next()
    const second = wizard.next()
    resolveValidation(true)

    const outcomes = await Promise.all([first, second])
    expect(wizard.page()).toBe(1)
    expect(outcomes.filter(Boolean)).toHaveLength(1)
  })

  test('rejects a wizard with no pages', () => {
    expect(() => createWizard({ pageCount: 0, validatePage: () => true })).toThrow()
  })
})
