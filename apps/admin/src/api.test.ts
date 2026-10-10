import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  Unauthorized,
  currentToken,
  exportUrl,
  fetchForm,
  fetchForms,
  fetchSubmissions,
  fetchVersions,
  login,
  publish,
  setToken,
  uploadFile,
} from './api.js'

/**
 * The admin's one door to the server.
 *
 * Worth testing rather than trusting because three of its behaviours are
 * security-shaped and silent when wrong: the token has to reach every
 * management call, a 401 has to clear it rather than leave a dead session in
 * storage, and a path has to be encoded before it goes into a URL.
 */
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

let fetched: Array<{ url: string; init: RequestInit | undefined }>

const answering = (respond: (url: string) => Response): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit) => {
      fetched.push({ url: input, init })
      return Promise.resolve(respond(input))
    }),
  )
}

/** What a file field hands an uploader: this field, nothing cancelled, progress ignored. */
const sending = () => ({
  field: 'evidence',
  signal: new AbortController().signal,
  onProgress: () => {},
})

const headerOf = (name: string, at = 0): string | undefined =>
  (fetched[at]?.init?.headers as Record<string, string> | undefined)?.[name]

beforeEach(() => {
  fetched = []
  sessionStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the token', () => {
  test('round-trips, and starts absent', () => {
    expect(currentToken()).toBeNull()

    setToken('t_1')
    expect(currentToken()).toBe('t_1')

    setToken(null)
    expect(currentToken()).toBeNull()
  })

  test('a storage that throws is a session that does not persist, not an admin that will not load', () => {
    const broken = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })

    expect(currentToken()).toBeNull()
    broken.mockRestore()
  })
})

describe('login', () => {
  test('stores the token it is given', async () => {
    answering(() => json({ token: 't_abc' }))

    expect(await login('admin@example.ch', 'hunter2')).toBe('signed-in')
    expect(currentToken()).toBe('t_abc')
  })

  test('a refusal is refused, and leaves no token behind', async () => {
    answering(() => json({ error: 'invalid_credentials' }, 401))

    expect(await login('admin@example.ch', 'wrong')).toBe('refused')
    expect(currentToken()).toBeNull()
  })

  test.each([429, 503])('a %i is not a refusal: the password was never looked at', async (status) => {
    // The login limit answers before the handler does (0170). Reported as a refusal, it would
    // tell somebody whose password is right that it is wrong.
    answering(() => json({ error: 'limited' }, status))

    expect(await login('admin@example.ch', 'hunter2')).toBe('unavailable')
    expect(currentToken()).toBeNull()
  })

  test('does not send an authorization header, because there is nothing to send', async () => {
    answering(() => json({ token: 't_abc' }))

    await login('admin@example.ch', 'hunter2')

    expect(headerOf('authorization')).toBeUndefined()
  })
})

describe('authenticated calls', () => {
  beforeEach(() => setToken('t_abc'))

  test('every one carries the token', async () => {
    answering((url) =>
      url.endsWith('/forms')
        ? json({ forms: [] })
        : url.includes('/versions')
          ? json({ versions: [] })
          : url.includes('/submissions')
            ? json({ submissions: [] })
            : json({ version: 1, schemaHash: 'h', schema: {} }),
    )

    await fetchForms()
    await fetchForm('contact')
    await fetchVersions('contact')
    await fetchSubmissions('contact')

    // The header belongs in one place for exactly this reason: four call sites
    // and none of them can forget it.
    expect(fetched).toHaveLength(4)
    for (let at = 0; at < fetched.length; at += 1) {
      expect(headerOf('authorization', at)).toBe('Bearer t_abc')
    }
  })

  test('a 401 throws Unauthorized and clears the token', async () => {
    answering(() => json({ error: 'unauthorized' }, 401))

    await expect(fetchForms()).rejects.toBeInstanceOf(Unauthorized)
    // Left in place, a dead token means every later call fails the same way
    // and the admin never shows the sign-in form.
    expect(currentToken()).toBeNull()
  })

  test('another failure says which call and what status', async () => {
    answering(() => json({}, 500))

    await expect(fetchForms()).rejects.toThrow('500')
  })

  test('a path is encoded before it goes into a URL', async () => {
    answering(() => json({ version: 1, schemaHash: 'h', schema: {} }))

    await fetchForm('a form/with slashes')

    expect(fetched[0]?.url).toBe('/api/f/a%20form%2Fwith%20slashes')
  })
})

describe('publish', () => {
  beforeEach(() => setToken('t_abc'))

  test('reports the new version', async () => {
    answering(() => json({ version: 3, schemaHash: 'h3' }))

    // `warnings: []` rather than absent, even though the server said nothing.
    // A server older than the field, and a server with nothing to say, are the
    // same thing to a caller, and giving them one shape means no pane has to
    // know which it is talking to.
    expect(await publish('contact', {})).toEqual({
      ok: true,
      version: 3,
      schemaHash: 'h3',
      warnings: [],
    })
  })

  test('and carries warnings from a publish that worked', async () => {
    /*
     * A 201 with a list, not a status of its own: the publish succeeded, and a
     * 2xx meaning "partly" is a status no client can handle. The admin tells
     * the two apart on screen instead
     * ([0097](../../../docs/decisions/0097-a-publish-may-warn.md)).
     */
    answering(() =>
      json({ version: 4, schemaHash: 'h4', warnings: ['Rule on "note" reads "address.nope".'] }),
    )

    expect(await publish('contact', {})).toMatchObject({
      ok: true,
      version: 4,
      warnings: ['Rule on "note" reads "address.nope".'],
    })
  })

  test('carries the validator’s errors through, not just a status', async () => {
    answering(() =>
      json({ error: 'invalid_schema', message: 'Two fields share the key "email".', errors: [{ path: '/model/fields/1/key', message: 'duplicate' }] }, 422),
    )

    const result = await publish('contact', {})

    // The admin shows these to a form author. A bare "publish failed" would
    // make them guess which of forty fields is wrong.
    expect(result).toEqual({
      ok: false,
      message: 'Two fields share the key "email".',
      errors: [{ path: '/model/fields/1/key', message: 'duplicate' }],
    })
  })

  test('falls back to the error code, then to something rather than nothing', async () => {
    answering(() => json({ error: 'conflict' }, 409))
    expect(await publish('contact', {})).toEqual({ ok: false, message: 'conflict' })

    fetched = []
    answering(() => json({}, 500))
    expect(await publish('contact', {})).toEqual({ ok: false, message: 'publish failed' })
  })
})

describe('exportUrl', () => {
  test('encodes the path', () => {
    expect(exportUrl('a/b')).toBe('/api/f/a%2Fb/submissions/export.csv')
  })
})

/**
 * The preview's uploader.
 *
 * Two round trips — offer the file, then send the bytes — and the answer
 * that comes back is what a submission will carry forever. Worth pinning
 * rather than trusting, because every way this goes wrong is quiet: a refusal
 * swallowed leaves somebody believing they attached evidence, and a stray
 * field in the answer ends up stored in a submission and read back years
 * later.
 */
describe('uploadFile', () => {
  beforeEach(() => setToken('t_abc'))

  const stored = {
    id: 'f1',
    name: 'plan.pdf',
    size: 12,
    contentType: 'application/pdf',
    storageKey: 'forms/contact/f1',
    uploadUrl: '/f/contact/files/f1',
  }

  const pdf = (): File =>
    new File([new Uint8Array(12)], 'plan.pdf', { type: 'application/pdf' })

  /**
   * The bytes go by XHR, because fetch cannot report an upload's progress. This stands
   * in for one: it records what was asked and answers with `status` once sent.
   */
  let sent: FakeRequest[]
  class FakeRequest {
    method = ''
    url = ''
    headers: Record<string, string> = {}
    body: unknown
    status = 0
    responseText = ''
    aborted = false
    readonly upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null }
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    onabort: (() => void) | null = null
    constructor() {
      sent.push(this)
    }
    open(method: string, url: string): void {
      this.method = method
      this.url = url
    }
    setRequestHeader(name: string, value: string): void {
      this.headers[name] = value
    }
    send(body: unknown): void {
      this.body = body
      if (answerAtOnce) queueMicrotask(() => this.finish())
    }
    finish(): void {
      if (this.aborted) return
      this.status = putStatus
      this.responseText = putBody
      this.onload?.()
    }
    abort(): void {
      this.aborted = true
      this.onabort?.()
    }
  }
  let putStatus = 204
  let putBody = ''
  /** Off for a test that has something to do while the bytes are on their way. */
  let answerAtOnce = true

  beforeEach(() => {
    sent = []
    putStatus = 204
    putBody = ''
    answerAtOnce = true
    vi.stubGlobal('XMLHttpRequest', FakeRequest)
  })

  test('offers the file, then sends the bytes', async () => {
    answering(() => json(stored, 201))

    await uploadFile('contact', pdf(), sending())

    expect(fetched[0]?.init?.method).toBe('POST')
    expect(JSON.parse(String(fetched[0]?.init?.body))).toMatchObject({
      field: 'evidence',
      name: 'plan.pdf',
      size: 12,
      contentType: 'application/pdf',
    })
    // The bytes go to the address the offer handed back, not to one the
    // client made up — with the session, as every management call carries it.
    expect(sent[0]?.url).toContain('/f/contact/files/f1')
    expect(sent[0]?.method).toBe('PUT')
    expect(sent[0]?.headers['authorization']).toBe('Bearer t_abc')
  })

  test('offers it for the field the renderer named, whichever that is', async () => {
    // It offered every file against the first file field in the form, because the
    // renderer never said which field a file was for (0130).
    answering(() => json(stored, 201))

    await uploadFile('contact', pdf(), { ...sending(), field: 'items[].receipt' })

    expect(JSON.parse(String(fetched[0]?.init?.body))).toMatchObject({ field: 'items[].receipt' })
  })

  test('reports how far the bytes have got', async () => {
    answering(() => json(stored, 201))
    answerAtOnce = false
    const progress: Array<[number, number]> = []
    const uploading = uploadFile('contact', pdf(), {
      ...sending(),
      onProgress: (done, total) => progress.push([done, total]),
    })
    await vi.waitFor(() => expect(sent).toHaveLength(1))

    sent[0]!.upload.onprogress?.({ lengthComputable: true, loaded: 6, total: 12 } as ProgressEvent)
    sent[0]!.finish()
    await uploading

    expect(progress).toEqual([[6, 12]])
  })

  test('stops sending when cancelled', async () => {
    answering(() => json(stored, 201))
    answerAtOnce = false
    const controller = new AbortController()
    const uploading = uploadFile('contact', pdf(), { ...sending(), signal: controller.signal })
    await vi.waitFor(() => expect(sent).toHaveLength(1))

    controller.abort()

    await expect(uploading).rejects.toThrow('Cancelled.')
    expect(sent[0]?.aborted).toBe(true)
  })

  test('the answer does not carry the upload address', async () => {
    answering(() => json(stored, 201))

    const answer = await uploadFile('contact', pdf(), sending())

    // `uploadUrl` is how to send the bytes, not part of what was attached.
    // Kept, it would write a route into somebody's submission data and sit
    // there long after the route stopped existing.
    expect(answer).not.toHaveProperty('uploadUrl')
    expect(answer).toMatchObject({ id: 'f1', name: 'plan.pdf', storageKey: 'forms/contact/f1' })
  })

  test('a refused offer throws what the server said', async () => {
    answering(() => json({ error: 'not_accepted', message: 'This field takes PDFs only.' }, 400))

    // The field says this out loud. Swallowed, it would leave somebody
    // believing their attachment went with the form.
    await expect(uploadFile('contact', pdf(), sending())).rejects.toThrow('This field takes PDFs only.')
  })

  test('a refusal with no message still says something useful', async () => {
    answering(() => new Response('gateway timeout', { status: 504 }))

    await expect(uploadFile('contact', pdf(), sending())).rejects.toThrow('504')
  })

  test('bytes that do not land are an error, not a silent success', async () => {
    answering(() => json(stored, 201))
    putStatus = 413

    // The offer succeeding and the PUT failing is the worst case to get wrong:
    // there is a row in the database and no bytes behind it.
    await expect(uploadFile('contact', pdf(), sending())).rejects.toThrow('413')
  })

  test('bytes the server refused once they arrived say why, in the server’s words', async () => {
    // A scanner's refusal is decided after the bytes land (0131). "The upload failed
    // (422)" would leave somebody guessing whether to try again.
    answering(() => json(stored, 201))
    putStatus = 422
    putBody = JSON.stringify({
      error: 'refused_by_scanner',
      message: "This file was refused by the deployment's virus scanner (Eicar-Test-Signature).",
    })

    await expect(uploadFile('contact', pdf(), sending())).rejects.toThrow(
      "This file was refused by the deployment's virus scanner (Eicar-Test-Signature).",
    )
  })

  test('a session that ended while the bytes were on their way ends here too', async () => {
    // Every management call clears a refused token; the bytes go a different way
    // now, and must not be the one call that leaves a dead session in storage.
    answering(() => json(stored, 201))
    putStatus = 401

    await expect(uploadFile('contact', pdf(), sending())).rejects.toThrow()
    expect(currentToken()).toBeNull()
  })

  test('a file the browser cannot type still gets one', async () => {
    answering(() => json(stored, 201))

    await uploadFile('contact', new File([new Uint8Array(1)], 'notes', { type: '' }), sending())

    // A submission that says nothing about what was attached is worse than one
    // that admits it could not tell.
    expect(JSON.parse(String(fetched[0]?.init?.body))).toMatchObject({
      contentType: 'application/octet-stream',
    })
  })
})
