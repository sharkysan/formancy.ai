import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, FormancyProvider, UploaderProvider } from './index.js'
import type { StoredFile, Uploader, UploadOptions } from './index.js'

/**
 * Each file is its own upload (0130): how far it has got, a way to stop it, a way to
 * try it again, its place in the answer, and a picture of it.
 *
 * By role and accessible name only, as everywhere in the renderers (0034).
 */
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  // jsdom has no createObjectURL; a test that stands one in takes it away again.
  Reflect.deleteProperty(URL, 'createObjectURL')
})

const CAPABILITIES = { now: () => 0, today: () => '2026-10-09', random: () => 0.5 }

const schema = (fields: unknown[]): FormSchema =>
  ({ specVersion: '4', id: 'claim', title: 'Claim', model: { fields } }) as unknown as FormSchema

const EVIDENCE = { key: 'evidence', type: 'file', label: 'Evidence' }

const mount = (document: FormSchema, uploader: Uploader) => {
  const engine = createFormEngine({ schema: document, capabilities: CAPABILITIES })
  const view = render(
    <UploaderProvider value={uploader}>
      <FormancyProvider engine={engine}>
        <FormancyForm />
      </FormancyProvider>
    </UploaderProvider>,
  )
  return { engine, view }
}

const stored = (name: string): StoredFile => ({
  id: `id-${name}`,
  name,
  size: 1,
  contentType: 'application/pdf',
  storageKey: `k-${name}`,
})

const pdf = (name: string): File => new File(['x'], name, { type: 'application/pdf' })

/** An uploader that waits to be told how each upload ends. */
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
    const user = userEvent.setup()
    const { calls, uploader } = controlled()
    mount(schema([EVIDENCE]), uploader)

    await user.upload(screen.getByLabelText('Evidence'), pdf('report.pdf'))
    const bar = await screen.findByRole('progressbar', { name: 'Uploading report.pdf' })
    // No figure until the uploader gives one: an uploader that cannot measure is not
    // drawn as stuck at nothing.
    expect(bar.getAttribute('value')).toBeNull()

    calls[0]!.options.onProgress(300, 1200)

    await waitFor(() => expect(bar.getAttribute('value')).toBe('300'))
    expect(bar.getAttribute('max')).toBe('1200')
  })

  test('can be cancelled, which tells the uploader and attaches nothing', async () => {
    const user = userEvent.setup()
    const { calls, uploader } = controlled()
    const { engine } = mount(schema([EVIDENCE]), uploader)
    await user.upload(screen.getByLabelText('Evidence'), pdf('report.pdf'))

    await user.click(await screen.findByRole('button', { name: 'Cancel uploading report.pdf' }))

    expect(calls[0]!.options.signal.aborted).toBe(true)
    // An uploader that finishes anyway does not put the file back: the person took it
    // back, and bytes nobody claims are collected.
    calls[0]!.resolve(stored('report.pdf'))
    await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull())
    expect(engine.value()).toEqual({})
  })

  test('picked while another uploads, waits its turn, and says so', async () => {
    // The picker stays open during an upload; it used to be disabled until every
    // file had gone, which made a second file wait for the first to be remembered.
    const user = userEvent.setup()
    const { calls, uploader } = controlled()
    mount(schema([EVIDENCE]), uploader)
    await user.upload(screen.getByLabelText('Evidence'), pdf('first.pdf'))

    await user.upload(screen.getByLabelText('Evidence'), pdf('second.pdf'))

    expect(calls).toHaveLength(1)
    expect(await screen.findByText('second.pdf')).toBeTruthy()
    expect(screen.getByText('Waiting')).toBeTruthy()
  })

  test('that failed stays, says why, and can be tried again', async () => {
    const user = userEvent.setup()
    const upload = vi
      .fn<Uploader>()
      .mockRejectedValueOnce(new Error('the network went away'))
      .mockResolvedValueOnce(stored('report.pdf'))
    const { engine } = mount(schema([EVIDENCE]), upload)
    await user.upload(screen.getByLabelText('Evidence'), pdf('report.pdf'))

    expect(await screen.findByText('Not attached: the network went away')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Try report.pdf again' }))

    await waitFor(() => expect(engine.value()).toEqual({ evidence: [stored('report.pdf')] }))
    // The same file, not a fresh pick: the person should not have to find it again.
    expect(upload.mock.calls[1]?.[0]).toBe(upload.mock.calls[0]?.[0])
  })

  test('that failed can be dismissed instead', async () => {
    const user = userEvent.setup()
    mount(schema([EVIDENCE]), () => Promise.reject(new Error('refused')))
    await user.upload(screen.getByLabelText('Evidence'), pdf('report.pdf'))

    await user.click(await screen.findByRole('button', { name: 'Dismiss report.pdf' }))

    expect(screen.queryByText('report.pdf')).toBeNull()
  })

  test('tells the uploader which field it is for, at the path the server reads', async () => {
    // The admin's preview offered every file against the first file field in the form,
    // because the renderer never said which field a file was for.
    const user = userEvent.setup()
    const { calls, uploader } = controlled()
    mount(
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
      uploader,
    )

    await user.upload(screen.getByLabelText('Receipt'), pdf('till.pdf'))

    await waitFor(() => expect(calls[0]?.options.field).toBe('items[].receipt'))
  })

  test('lands in its own row when that row moves while it uploads', async () => {
    // A row that moves gives its file field a new path while the same control stays
    // mounted. Read from when the upload began, the file was written into whichever
    // row now sat at the old position — somebody else's receipt.
    const user = userEvent.setup()
    const { calls, uploader } = controlled()
    const { engine } = mount(
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
      uploader,
    )
    await user.type(screen.getAllByLabelText('What')[0]!, 'taxi')
    await user.upload(screen.getAllByLabelText('Receipt')[0]!, pdf('taxi.pdf'))
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
    const user = userEvent.setup()
    const { calls, uploader } = controlled()
    const { view } = mount(schema([EVIDENCE]), uploader)
    await user.upload(screen.getByLabelText('Evidence'), pdf('report.pdf'))
    await screen.findByRole('progressbar')

    view.unmount()

    expect(calls[0]!.options.signal.aborted).toBe(true)
  })
})

describe('the files in the answer', () => {
  const twoStored = async () => {
    const user = userEvent.setup()
    const { engine } = mount(schema([EVIDENCE]), (file) => Promise.resolve(stored(file.name)))
    await user.upload(screen.getByLabelText('Evidence'), [pdf('a.pdf'), pdf('b.pdf')])
    await screen.findByRole('button', { name: 'Remove b.pdf' })
    return { user, engine }
  }

  test('can be put in order, with the position in each button’s name', async () => {
    // The order is the person's: attachments numbered in a covering note.
    const { user, engine } = await twoStored()

    await user.click(screen.getByRole('button', { name: 'Move a.pdf, 1 of 2, down' }))

    expect(
      (engine.value() as { evidence: StoredFile[] }).evidence.map((file) => file.name),
    ).toEqual(['b.pdf', 'a.pdf'])
  })

  test('and a file that cannot move that way has no button for it', async () => {
    await twoStored()

    expect(screen.queryByRole('button', { name: 'Move a.pdf, 1 of 2, up' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Move b.pdf, 2 of 2, down' })).toBeNull()
  })
})

describe('a picture of an image', () => {
  /** jsdom decodes no images and draws on no canvas, so both are stood in for. */
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
    const objectUrl = vi.fn(() => 'blob:never')
    Object.defineProperty(URL, 'createObjectURL', { value: objectUrl, configurable: true })
    return { bitmap, drawImage, objectUrl }
  }

  test('is drawn from the file’s own bytes, never loaded from a URL', async () => {
    // An <img> on an object URL is subject to the page's img-src, and a strict policy
    // without blob: shows a broken image where the picture should be. Drawing a
    // decoded bitmap involves no URL at all, so it needs no CSP change.
    const { bitmap, drawImage, objectUrl } = drawing()
    const user = userEvent.setup()
    mount(schema([EVIDENCE]), (file) =>
      Promise.resolve({ ...stored(file.name), contentType: 'image/png' }),
    )

    await user.upload(
      screen.getByLabelText('Evidence'),
      new File(['png'], 'photo.png', { type: 'image/png' }),
    )

    await waitFor(() => expect(drawImage).toHaveBeenCalled())
    expect(drawImage.mock.calls[0]?.[0]).toBe(bitmap)
    expect(bitmap.close).toHaveBeenCalled()
    expect(objectUrl).not.toHaveBeenCalled()
    // Beside the name, which is what is read out; the picture adds nothing to it.
    const picture = document.querySelector('canvas')!
    expect(picture.getAttribute('aria-hidden')).toBe('true')
    // Scaled to fit, keeping its shape.
    expect([picture.width, picture.height]).toEqual([64, 32])
  })

  test('and only of an image, picked here', async () => {
    drawing()
    const user = userEvent.setup()
    mount(schema([EVIDENCE]), (file) => Promise.resolve(stored(file.name)))

    await user.upload(screen.getByLabelText('Evidence'), pdf('report.pdf'))
    await screen.findByRole('button', { name: 'Remove report.pdf' })

    expect(document.querySelector('canvas')).toBeNull()
  })
})
