import { describe, expect, test, vi } from 'vitest'
import {
  describeSpec,
  diffForms,
  getForm,
  listForms,
  checkScenarios,
  proposeFormEdit,
  publishForm,
  validateForm,
} from './tools.js'
import type { ServerAccess } from './tools.js'
import { FIELD_TYPES, schemaHash } from '@formancy/spec'

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
    // Shorter than the sentence it checks, on purpose: this said
    // "version 1 document may not contain a version 2 construct", which stopped
    // being the note's wording the moment there were three versions and the
    // sentence had to be written per version instead of per pair.
    expect(notes).toContain('construct from a later version')
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

/**
 * Proposing an edit through MCP, and refusing a stale one.
 *
 * The builders got a review step: a model's answer is held, shown as a change
 * list and applied only when somebody says so
 * ([0109](../../../docs/decisions/0109-an-ai-edit-is-reviewed-before-it-lands.md)).
 * An agent editing through MCP has the same two problems and one more.
 *
 * **It cannot see what its own edit does.** `validate_form` says the document
 * works; it does not say that the rewrite dropped an option somebody has
 * already chosen. `propose_form_edit` fetches what is published, diffs against
 * it, and hands back the change list — so the agent can put *that* in front of
 * a person rather than "I updated your form".
 *
 * **And it cannot see that the form moved.** Between fetching and publishing,
 * somebody else publishes. A document is the whole form, so the agent's
 * publish silently reverts their work. `publish_form` now takes the hash the
 * edit was based on and refuses when the server is no longer on it — the same
 * check `applyProposal` makes in a builder, against a server rather than a
 * session.
 */
describe('proposing an edit to a published form', () => {
  const published = {
    specVersion: '2',
    id: 'contact',
    title: 'Contact us',
    model: {
      fields: [
        { key: 'email', type: 'text', label: 'Email', required: true },
        {
          key: 'contactBy',
          type: 'radio',
          label: 'How should we reach you?',
          options: [
            { value: 'email', label: 'By email' },
            { value: 'post', label: 'By post' },
          ],
        },
      ],
    },
  }

  const serving = (body: unknown) =>
    ({
      baseUrl: 'https://forms.example',
      apiKey: 'k',
      fetch: vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })),
      ),
    }) as unknown as ServerAccess

  test('reports what the edit would do to answers already collected, and publishes nothing', async () => {
    const access = serving({ schema: published, version: 3 })
    const edited = structuredClone(published)
    edited.model.fields[1]!.options!.pop()

    const result = await proposeFormEdit(access, 'contact', edited)

    expect(result.ok).toBe(true)
    const data = result.data as { severity: string; changes: { kind: string }[]; basedOn: string }
    // The whole point: withdrawing an option is the edit a model makes while
    // doing something else, and it leaves stored answers outside the
    // document's vocabulary.
    expect(data.changes.map((change) => change.kind)).toContain('field.optionRemoved')
    expect(data.severity).toBe('lossy')
    expect(data.basedOn).toBe(schemaHash(published as never))
    // One call: the GET. Nothing was published.
    expect((access.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(1)
  })

  test('and refuses an edit that would not have worked, before anybody reads a change list', async () => {
    // A change list for a document that cannot be published is a list of
    // things that will not happen.
    const access = serving({ schema: published, version: 3 })

    const result = await proposeFormEdit(access, 'contact', { specVersion: '2', id: 'x' })

    expect(result.ok).toBe(false)
    expect(result.summary).toMatch(/would not have worked/i)
  })
})

describe('publishing against the version the edit was based on', () => {
  const document = {
    specVersion: '2',
    id: 'contact',
    title: 'Contact us',
    model: { fields: [{ key: 'email', type: 'text', label: 'Email' }] },
  }

  const serverOn = (current: unknown) => {
    const calls: string[] = []
    return {
      calls,
      access: {
        baseUrl: 'https://forms.example',
        apiKey: 'k',
        fetch: vi.fn((url: string, init?: { method?: string }) => {
          calls.push(`${init?.method ?? 'GET'} ${url}`)
          const body = init?.method === 'POST' ? { version: 4 } : { schema: current, version: 3 }
          return Promise.resolve(
            new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }),
          )
        }),
      } as unknown as ServerAccess,
    }
  }

  test('refuses when the server has moved on, rather than reverting somebody’s work', async () => {
    /*
     * The lost update, which is the one mistake an agent makes that nobody
     * sees until the form is wrong. A document is the WHOLE form, so
     * publishing an edit based on version 3 over a version 4 somebody else
     * published discards their change entirely — and the publish succeeds, so
     * nothing reports it.
     */
    const moved = structuredClone(document)
    moved.model.fields.push({ key: 'phone', type: 'text', label: 'Phone' })
    const { access, calls } = serverOn(moved)

    const result = await publishForm(access, 'contact', document, schemaHash(document as never))

    expect(result.ok).toBe(false)
    expect(result.summary).toMatch(/changed since/i)
    // The GET happened, the POST did not.
    expect(calls.filter((call) => call.startsWith('POST'))).toEqual([])
  })

  test('publishes when the server is still on it', async () => {
    const { access, calls } = serverOn(document)

    const result = await publishForm(access, 'contact', document, schemaHash(document as never))

    expect(result.ok).toBe(true)
    expect(calls.filter((call) => call.startsWith('POST'))).toHaveLength(1)
  })

  test('and without one, publishes as it always did', async () => {
    /*
     * The check is opt-in. An agent writing a NEW form has nothing to be
     * based on, and making the argument required would turn the first publish
     * into a fetch of something that is not there. Stated rather than
     * assumed: this is the path where a lost update is still possible, and
     * the tool description is what points an agent at the safer one.
     */
    const { access, calls } = serverOn(document)

    const result = await publishForm(access, 'contact', document)

    expect(result.ok).toBe(true)
    expect(calls.filter((call) => call.startsWith('GET'))).toEqual([])
  })
})

/**
 * Checking a form against examples, through MCP.
 *
 * `validate_form` says a document works. It cannot say the condition is
 * backwards, because `leaveType == 'other'` and `leaveType != 'other'` are
 * both valid CEL and the difference is between the document and what somebody
 * meant ([0110](../../../docs/decisions/0110-a-form-is-checked-against-examples.md)).
 *
 * An agent is exactly who needs telling. It writes a rule from a sentence, and
 * the one check that can catch it writing the opposite rule is an example with
 * its answer written down.
 */
describe('checking a form against examples', () => {
  const form = {
    specVersion: '2',
    id: 'leave',
    title: 'Leave',
    model: {
      fields: [
        { key: 'kind', type: 'radio', label: 'Kind', options: [
          { value: 'holiday', label: 'Holiday' },
          { value: 'other', label: 'Other' },
        ] },
        { key: 'reason', type: 'text', label: 'Reason' },
      ],
    },
    logic: { rules: [{ target: 'reason', kind: 'visible', cel: "kind == 'other'" }] },
  }
  const scenarios = [
    { name: 'other shows the reason', changes: { kind: 'other' }, valid: true, visible: { reason: true } },
  ]

  test('says which example stopped holding, and what it expected', () => {
    const backwards = structuredClone(form)
    backwards.logic.rules[0]!.cel = "kind != 'other'"

    const result = checkScenarios(backwards, scenarios)

    expect(result.ok).toBe(false)
    // Named and explained. "1 of 1 failed" sends an agent back to re-read its
    // own document, which is what it just wrote.
    expect(result.summary).toContain('other shows the reason')
    const data = result.data as { results: { failures: { detail: string }[] }[] }
    expect(data.results[0]?.failures.map((f) => f.detail).join(' ')).toMatch(/expected to be visible/)
  })

  test('and passes the form that does what the examples say', () => {
    const result = checkScenarios(form, scenarios)

    expect(result.ok).toBe(true)
    expect(result.summary).toMatch(/all|hold/i)
  })

  test('refuses a document that would not have worked, rather than reporting every example as broken', () => {
    // One fact, not one failure per example. An agent given twenty identical
    // "no such field" lines reads the noise and not the cause.
    const result = checkScenarios({ specVersion: '2', id: 'x' }, scenarios)

    expect(result.ok).toBe(false)
    expect(result.summary).toMatch(/would not have worked/i)
  })

  test('and refuses an empty set rather than reporting that everything holds', () => {
    /*
     * The vacuous pass. "All 0 scenarios hold" is true and is the single most
     * misleading thing this tool could tell an agent about to publish.
     */
    const result = checkScenarios(form, [])

    expect(result.ok).toBe(false)
    expect(result.summary).toMatch(/no scenarios/i)
  })
})
