import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { fireEvent, render, screen, waitFor } from '@testing-library/angular'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, provideFormancy, provideFormancyUploader } from './index'
import type { StoredFile, Uploader, UploadOptions } from './index'

/**
 * Each file is its own upload (0130), as the React binding does it: the queue is
 * `@formancy/core`'s, so these cases hold the drawing, not the decisions.
 */
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const schema = (fields: unknown[]): FormSchema =>
  ({ specVersion: '4', id: 'claim', title: 'Claim', model: { fields } }) as unknown as FormSchema

const EVIDENCE = { key: 'evidence', type: 'file', label: 'Evidence' }

const engineFor = (document: FormSchema): FormEngine =>
  createFormEngine({
    schema: document,
    capabilities: { now: () => 0, today: () => '2026-10-09', random: () => 0.5 },
  })

async function renderForm(engine: FormEngine, uploader: Uploader) {
  const view = await render(FormancyForm, {
    providers: [
      provideZonelessChangeDetection(),
      provideFormancy(engine),
      provideFormancyUploader(uploader),
    ],
  })
  await view.fixture.whenStable()
  return view
}

const stored = (name: string): StoredFile => ({
  id: `id-${name}`,
  name,
  size: 1,
  contentType: 'application/pdf',
  storageKey: `k-${name}`,
})

const pdf = (name: string): File => new File(['x'], name, { type: 'application/pdf' })

const pick = (label: string, files: File[], at = 0): void => {
  fireEvent.change(screen.getAllByLabelText(label)[at]!, { target: { files } })
}

function controlled() {
  const calls: Array<{
    file: File
    options: UploadOptions
    resolve: (file: StoredFile) => void
    reject: (error: unknown) => void
  }> = []
  const uploader: Uploader = (file, options) =>
    new Promise<StoredFile>((resolve, reject) => calls.push({ file, options, resolve, reject }))
  return { calls, uploader }
}

describe('a file on its way', () => {
  test('shows how far it has got, when the uploader says', async () => {
    const { calls, uploader } = controlled()
    await renderForm(engineFor(schema([EVIDENCE])), uploader)

    pick('Evidence', [pdf('report.pdf')])
    const bar = await screen.findByRole('progressbar', { name: 'Uploading report.pdf' })
    expect(bar.getAttribute('value')).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('Uploading report.pdf')

    calls[0]!.options.onProgress(300, 1200)

    await waitFor(() => expect(bar.getAttribute('value')).toBe('300'))
    expect(bar.getAttribute('max')).toBe('1200')
  })

  test('can be cancelled, which tells the uploader and attaches nothing', async () => {
    const { calls, uploader } = controlled()
    const engine = engineFor(schema([EVIDENCE]))
    await renderForm(engine, uploader)
    pick('Evidence', [pdf('report.pdf')])

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel uploading report.pdf' }))

    expect(calls[0]!.options.signal.aborted).toBe(true)
    calls[0]!.resolve(stored('report.pdf'))
    await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull())
    expect(engine.value()).toEqual({})
  })

  test('picked while another uploads, waits its turn, and says so', async () => {
    const { calls, uploader } = controlled()
    await renderForm(engineFor(schema([EVIDENCE])), uploader)
    pick('Evidence', [pdf('first.pdf')])
    await screen.findByRole('progressbar')
    // Asked directly: a change event reaches a disabled input in a test, though no
    // person could pick a file into one.
    expect(screen.getByLabelText('Evidence')).toHaveProperty('disabled', false)

    pick('Evidence', [pdf('second.pdf')])

    expect(calls).toHaveLength(1)
    expect(await screen.findByText('second.pdf')).toBeTruthy()
    expect(screen.getByText('Waiting')).toBeTruthy()
  })

  test('that failed stays, says why, and can be tried again', async () => {
    const upload = vi
      .fn<Uploader>()
      .mockRejectedValueOnce(new Error('the network went away'))
      .mockResolvedValueOnce(stored('report.pdf'))
    const engine = engineFor(schema([EVIDENCE]))
    await renderForm(engine, upload)
    pick('Evidence', [pdf('report.pdf')])

    expect(await screen.findByText('Not attached: the network went away')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try report.pdf again' }))

    await waitFor(() => expect(engine.value()).toEqual({ evidence: [stored('report.pdf')] }))
    expect(upload.mock.calls[1]?.[0]).toBe(upload.mock.calls[0]?.[0])
  })

  test('that failed can be dismissed instead', async () => {
    await renderForm(engineFor(schema([EVIDENCE])), () => Promise.reject(new Error('refused')))
    pick('Evidence', [pdf('report.pdf')])

    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss report.pdf' }))

    await waitFor(() => expect(screen.queryByText('report.pdf')).toBeNull())
  })

  test('tells the uploader which field it is for, at the path the server reads', async () => {
    const { calls, uploader } = controlled()
    await renderForm(
      engineFor(
        schema([
          EVIDENCE,
          {
            key: 'items',
            type: 'repeater',
            label: 'Items',
            minItems: 1,
            fields: [{ key: 'receipt', type: 'file', label: 'Receipt' }],
          },
        ]),
      ),
      uploader,
    )

    pick('Receipt', [pdf('till.pdf')])

    await waitFor(() => expect(calls[0]?.options.field).toBe('items[].receipt'))
  })

  test('lands in its own row when that row moves while it uploads', async () => {
    const { calls, uploader } = controlled()
    const engine = engineFor(
      schema([
        {
          key: 'items',
          type: 'repeater',
          label: 'Items',
          minItems: 2,
          fields: [
            { key: 'what', type: 'text', label: 'What' },
            { key: 'receipt', type: 'file', label: 'Receipt' },
          ],
        },
      ]),
    )
    await renderForm(engine, uploader)
    engine.setValue(['items', 0, 'what'], 'taxi')
    pick('Receipt', [pdf('taxi.pdf')], 0)
    await screen.findByRole('progressbar')

    engine.moveRow(['items'], 0, 1)
    await waitFor(() => expect(screen.getAllByLabelText('What')[1]).toHaveProperty('value', 'taxi'))
    calls[0]!.resolve(stored('taxi.pdf'))

    await waitFor(() =>
      expect(engine.value()).toMatchObject({
        items: [{}, { what: 'taxi', receipt: [stored('taxi.pdf')] }],
      }),
    )
    expect(
      (engine.value() as { items: Array<Record<string, unknown>> }).items[0],
    ).not.toHaveProperty('receipt')
  })

  test('is stopped when the form goes away', async () => {
    const { calls, uploader } = controlled()
    await renderForm(engineFor(schema([EVIDENCE])), uploader)
    pick('Evidence', [pdf('report.pdf')])
    await screen.findByRole('progressbar')

    TestBed.resetTestingModule()

    expect(calls[0]!.options.signal.aborted).toBe(true)
  })
})

describe('the files in the answer', () => {
  const twoStored = async () => {
    const engine = engineFor(schema([EVIDENCE]))
    await renderForm(engine, (file) => Promise.resolve(stored(file.name)))
    pick('Evidence', [pdf('a.pdf'), pdf('b.pdf')])
    await screen.findByRole('button', { name: 'Remove b.pdf' })
    return engine
  }

  test('can be put in order, with the position in each button’s name', async () => {
    const engine = await twoStored()

    fireEvent.click(screen.getByRole('button', { name: 'Move a.pdf, 1 of 2, down' }))

    await waitFor(() =>
      expect(
        (engine.value() as { evidence: StoredFile[] }).evidence.map((file) => file.name),
      ).toEqual(['b.pdf', 'a.pdf']),
    )
  })

  test('and a file that cannot move that way has no button for it', async () => {
    await twoStored()

    expect(screen.queryByRole('button', { name: 'Move a.pdf, 1 of 2, up' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Move b.pdf, 2 of 2, down' })).toBeNull()
  })
})

describe('a picture of an image', () => {
  const drawing = () => {
    const bitmap = { width: 400, height: 200, close: vi.fn() }
    const drawImage = vi.fn()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.resolve(bitmap)),
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D)
    return { bitmap, drawImage }
  }

  test('is drawn from the file’s own bytes, at the size the React binding draws', async () => {
    const { bitmap, drawImage } = drawing()
    await renderForm(engineFor(schema([EVIDENCE])), (file) =>
      Promise.resolve({ ...stored(file.name), contentType: 'image/png' }),
    )

    pick('Evidence', [new File(['png'], 'photo.png', { type: 'image/png' })])

    await waitFor(() => expect(drawImage).toHaveBeenCalled())
    expect(drawImage.mock.calls[0]?.[0]).toBe(bitmap)
    expect(bitmap.close).toHaveBeenCalled()
    const picture = document.querySelector('canvas')!
    expect(picture.getAttribute('aria-hidden')).toBe('true')
    expect([picture.width, picture.height]).toEqual([64, 32])
  })

  test('and only of an image', async () => {
    drawing()
    await renderForm(engineFor(schema([EVIDENCE])), (file) => Promise.resolve(stored(file.name)))

    pick('Evidence', [pdf('report.pdf')])
    await screen.findByRole('button', { name: 'Remove report.pdf' })

    expect(document.querySelector('canvas')).toBeNull()
  })
})
