import { describe, expect, test, vi } from 'vitest'
import {
  describeSpec,
  diffForms,
  getForm,
  listForms,
  publishForm,
  validateForm,
} from './tools.js'
import type { ServerAccess } from './tools.js'
import { FIELD_TYPES } from '@formancy/spec'

/**
 * What an agent is actually told.
 *
 * These are not tests of the protocol — that is a transport, and the tools are
 * plain functions so that it can be. They are tests of the two things that
 * make this worth building instead of wrapping the REST API in tool
 * definitions: that a document is checked BEFORE it exists, and that what
 * comes back is something a model can act on rather than a status code.
 */
const valid = {
  specVersion: '2',
  id: 'quote',
  title: 'Quote',
  model: {
    fields: [
      { key: 'company', type: 'text', label: 'Company', required: true },
      { key: 'seats', type: 'number', label: 'Seats' },
    ],
  },
}

const access = (handler: (url: string, init?: RequestInit) => Response): ServerAccess => ({
  baseUrl: 'http://localhost:4380',
  apiKey: 'k_test',
  fetch: vi.fn((url: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(handler(String(url), init)),
  ) as unknown as typeof globalThis.fetch,
})

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('describe_spec', () => {
  test('lists every field type the spec has, so the model does not invent one', () => {
    const result = describeSpec()
    const data = result.data as { fieldTypes: readonly string[] }

    // The cheapest tool here and probably the most valuable: without it a
    // model reaches for `type: "email"` from its memory of other builders.
    expect(data.fieldTypes).toEqual([...FIELD_TYPES])
    expect(result.summary).toContain('format "email"')
  })

  test('says the things that are counter-intuitive rather than leaving them to be discovered', () => {
    const notes = (describeSpec().data as { notes: readonly string[] }).notes.join(' ')

    // Each of these has cost somebody real time in this repository.
    expect(notes).toContain('version 1 document may not contain a version 2 construct')
    expect(notes).toContain('[], never null')
    expect(notes).toContain('4.0 rather than 4')
  })
})

describe('validate_form', () => {
  test('a good document passes, expressions and all', () => {
    expect(validateForm(valid)).toMatchObject({ ok: true })
  })

  test('a structural error comes back with the path to it', () => {
    const result = validateForm({ ...valid, model: { fields: [{ key: 'a' }] } })

    expect(result.ok).toBe(false)
    const { errors } = result.data as { errors: { path: string }[] }
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]?.path).toBeTruthy()
  })

  test('an expression that compiles and never runs is reported separately', () => {
    // The whole reason this tool exists rather than a JSON Schema check. CEL
    // is strongly typed and a JSON number is a double, so `seats * 4` is
    // double times int: no overload, and at runtime the computed field just
    // stays empty with nothing anywhere saying why.
    const result = validateForm({
      ...valid,
      model: { fields: [...valid.model.fields, { key: 'total', type: 'number', label: 'Total' }] },
      logic: { rules: [{ target: 'total', kind: 'computed', cel: 'seats * 4' }] },
    })

    expect(result.ok).toBe(false)
    const { expressionProblems } = result.data as { expressionProblems: { cel: string }[] }
    expect(expressionProblems).toHaveLength(1)
    expect(expressionProblems[0]?.cel).toBe('seats * 4')
    // Structurally fine. The two failures are different and are reported so.
    expect((result.data as { valid: boolean }).valid).toBe(true)
  })

  test('and the summary says why nothing would report it at runtime', () => {
    // A total, not `seats` computed from itself: that is a cycle, which the
    // engine refuses before this check is ever reached — as the server does.
    const result = validateForm({
      ...valid,
      model: { fields: [...valid.model.fields, { key: 'total', type: 'number', label: 'Total' }] },
      logic: { rules: [{ target: 'total', kind: 'computed', cel: 'seats * 4' }] },
    })

    expect(result.summary).toContain('never')
  })
  describe('what the engine would refuse, it refuses', () => {
    // These three used to come back "Valid, and every expression type-checks":
    // the validator does not read CEL, and the expression check skips what the
    // engine refuses — so nothing here asked the engine. The server's publish
    // gate did, and refused every one of them.
    const withRules = (
      fields: readonly object[],
      rules: readonly object[],
    ): Record<string, unknown> => ({
      ...valid,
      model: { fields: [...valid.model.fields, ...fields] },
      logic: { rules },
    })

    test('a misspelled field name — the mistake a model makes most', () => {
      const result = validateForm(
        withRules([{ key: 'notes', type: 'text', label: 'Notes' }], [
          { target: 'notes', kind: 'visible', cel: "compnay != ''" },
        ]),
      )

      expect(result.ok).toBe(false)
      expect(result.summary).toContain('compnay')
      // Structurally the document is fine; it is the engine that says no, and
      // the answer says which so the model looks in the right place.
      expect(result.data).toMatchObject({ valid: true })
      expect((result.data as { engineRefusal: string }).engineRefusal).toContain('compnay')
    })

    test('a checkbox written as a condition on its own, with what to write instead', () => {
      const result = validateForm(
        withRules(
          [
            { key: 'callback', type: 'checkbox', label: 'Call me back' },
            { key: 'phone', type: 'text', label: 'Phone' },
          ],
          [{ target: 'phone', kind: 'visible', cel: 'callback' }],
        ),
      )

      expect(result.ok).toBe(false)
      expect(result.summary).toContain('write callback == true')
    })

    test('a cycle between computed fields', () => {
      const result = validateForm(
        withRules(
          [{ key: 'total', type: 'number', label: 'Total' }],
          [
            { target: 'total', kind: 'computed', cel: 'seats * 4.0' },
            { target: 'seats', kind: 'computed', cel: 'total / 4.0' },
          ],
        ),
      )

      expect(result.ok).toBe(false)
      expect(result.summary).toMatch(/cycle/i)
    })

    test('and the same compile the server runs passes what it would open', () => {
      const result = validateForm(
        withRules(
          [
            { key: 'callback', type: 'checkbox', label: 'Call me back' },
            { key: 'phone', type: 'text', label: 'Phone' },
          ],
          [{ target: 'phone', kind: 'visible', cel: 'callback == true' }],
        ),
      )

      expect(result).toMatchObject({ ok: true })
    })
  })
})

describe('diff_forms', () => {
  test('grades a change against the data already collected', () => {
    const after = {
      ...valid,
      model: { fields: [valid.model.fields[0]] },
    }

    const result = diffForms(valid, after)
    const { severity } = result.data as { severity: string }

    // Removing a field is not "compatible", and the answer is permanent once
    // published: this is the question an agent cannot work out by reading.
    expect(['lossy', 'breaking']).toContain(severity)
    expect(result.summary).toMatch(/lossy|breaking/)
  })

  test('identical documents are no change at all', () => {
    expect(diffForms(valid, { ...valid })).toMatchObject({ ok: true })
    expect((diffForms(valid, { ...valid }).data as { changes: unknown[] }).changes).toEqual([])
  })

  test('refuses to compare a document that is not valid', () => {
    // Otherwise the diff is a guess about two things, one of which is not a
    // form, and the severity it reports would be meaningless.
    const result = diffForms(valid, { specVersion: '2' })

    expect(result.ok).toBe(false)
    expect(result.summary).toContain('validate_form')
  })
})

describe('publish_form', () => {
  test('checks before it sends, and an invalid document never travels', async () => {
    let called = false
    const server = access(() => {
      called = true
      return json({})
    })

    const result = await publishForm(server, 'quote', { specVersion: '2', id: 'x' })

    expect(result.ok).toBe(false)
    // Not a 422 the model has to interpret: the reason, before the socket.
    expect(called).toBe(false)
    expect(result.summary).toContain('Not published')
  })

  test('the same check catches an expression that would never work', async () => {
    let called = false
    const server = access(() => {
      called = true
      return json({})
    })

    const result = await publishForm(server, 'quote', {
      ...valid,
      model: { fields: [...valid.model.fields, { key: 'total', type: 'number', label: 'Total' }] },
      logic: { rules: [{ target: 'total', kind: 'computed', cel: 'seats * 4' }] },
    })

    // A form that publishes cleanly and then quietly computes nothing is the
    // worst outcome available here, so it is refused at the same gate.
    expect(called).toBe(false)
    expect(JSON.stringify(result.data)).toContain('4.0')
  })

  test('and a document the engine would refuse never travels either', async () => {
    let called = false
    const server = access(() => {
      called = true
      return json({})
    })

    const result = await publishForm(server, 'quote', {
      ...valid,
      logic: { rules: [{ target: 'seats', kind: 'visible', cel: "compnay != ''" }] },
    })

    // The server would have refused it too — with a 422 the model has to
    // interpret, three turns after it last looked at the document.
    expect(called).toBe(false)
    expect(result.summary).toContain('compnay')
  })

  test('a good document is sent, with the key', async () => {
    let seen: { url: string; init: RequestInit | undefined } | undefined
    const server = access((url, init) => {
      seen = { url, init }
      return json({ version: 1, schemaHash: 'h' })
    })

    const result = await publishForm(server, 'quote', valid)

    expect(result.ok).toBe(true)
    expect(seen?.url).toBe('http://localhost:4380/forms')
    expect((seen?.init?.headers as Record<string, string>).authorization).toBe('Bearer k_test')
    expect(JSON.parse(String(seen?.init?.body))).toMatchObject({ path: 'quote' })
  })
})

describe('talking to a server', () => {
  test('a refusal comes back as something to read, not as a thrown error', async () => {
    const result = await listForms(access(() => json({ message: 'no such form' }, 404)))

    // A thrown exception reaches a model as a stack trace and tells it
    // nothing it can act on.
    expect(result.ok).toBe(false)
    expect(result.summary).toContain('no such form')
  })

  test('a 401 names the thing to fix', async () => {
    const result = await listForms(access(() => json({ error: 'unauthorized' }, 401)))

    expect(result.summary).toContain('FORMANCY_API_KEY')
  })

  test('a server that is not there says so, and says where it looked', async () => {
    const server: ServerAccess = {
      baseUrl: 'http://localhost:4380',
      apiKey: 'k',
      fetch: (() => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof globalThis.fetch,
    }

    const result = await listForms(server)

    expect(result.ok).toBe(false)
    expect(result.summary).toContain('localhost:4380')
    expect(result.summary).toContain('FORMANCY_URL')
  })

  test('a path is encoded before it goes into a URL', async () => {
    let seen = ''
    await getForm(
      access((url) => {
        seen = url
        return json({})
      }),
      'a/b c',
    )

    expect(seen).toBe('http://localhost:4380/f/a%2Fb%20c')
  })

  test('a trailing slash on the base URL does not produce a double one', async () => {
    let seen = ''
    await listForms({
      baseUrl: 'http://localhost:4380/',
      apiKey: 'k',
      fetch: vi.fn((url: string | URL | Request) => {
        seen = String(url)
        return Promise.resolve(json({}))
      }) as unknown as typeof globalThis.fetch,
    })

    expect(seen).toBe('http://localhost:4380/forms')
  })
})
