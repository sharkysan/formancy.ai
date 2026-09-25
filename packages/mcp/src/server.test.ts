import { describe, expect, test } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { TOOL_DEFINITIONS, createFormancyMcpServer } from './server.js'
import type { ServerAccess } from './tools.js'

/**
 * The server, driven through the real protocol by a real client.
 *
 * `tools.test.ts` covers what the tools decide; this covers that they are
 * reachable, that their arguments survive the round trip, and that a refusal
 * arrives as a refusal. Worth doing end to end rather than by inspection: a
 * tool registered with the wrong argument name is invisible in a unit test and
 * fatal in use, because the model's call simply never matches.
 */
async function connect(access?: ServerAccess): Promise<Client> {
  const server = createFormancyMcpServer(access === undefined ? {} : { access })
  const client = new Client({ name: 'test', version: '0' })
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()

  await Promise.all([server.connect(serverSide), client.connect(clientSide)])
  return client
}

/** The text an agent would read. */
const textOf = (result: unknown): string =>
  ((result as { content: { text?: string }[] }).content ?? [])
    .map((part) => part.text ?? '')
    .join('\n')

describe('the tools a client can see', () => {
  test('all seven, each with a description', async () => {
    const client = await connect()

    const { tools } = await client.listTools()

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'describe_spec',
      'diff_forms',
      'get_form',
      'list_forms',
      'list_submissions',
      'publish_form',
      'validate_form',
    ])
    // The description is the prompt: it is the only thing telling a model when
    // to reach for a tool, so an empty one is a tool that never gets called.
    for (const tool of tools) expect(tool.description ?? '').not.toBe('')
  })

  test('the descriptions say when to call, not just what the tool is', async () => {
    // A description that names the moment is what makes the difference
    // between a tool a model uses and one it has to be told about.
    expect(TOOL_DEFINITIONS.describe_spec).toContain('BEFORE writing a form document')
    expect(TOOL_DEFINITIONS.diff_forms).toContain('before publishing over an existing form')
  })
})

describe('calling them', () => {
  test('describe_spec answers without a server', async () => {
    const client = await connect()

    const result = await client.callTool({ name: 'describe_spec', arguments: {} })

    expect(textOf(result)).toContain('selectboxes')
  })

  test('validate_form takes a document and reports on it', async () => {
    const client = await connect()

    const result = await client.callTool({
      name: 'validate_form',
      arguments: { document: { specVersion: '2', id: 'x' } },
    })

    // A refusal, not a thrown transport error: something the model reads and
    // acts on.
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('Not a valid formancy document')
  })

  test('a valid document comes back clean', async () => {
    const client = await connect()

    const result = await client.callTool({
      name: 'validate_form',
      arguments: {
        document: {
          specVersion: '2',
          id: 'x',
          title: 'X',
          model: { fields: [{ key: 'a', type: 'text', label: 'A' }] },
        },
      },
    })

    expect(result.isError).toBeUndefined()
    expect(textOf(result)).toContain('every expression type-checks')
  })

  test('diff_forms takes two documents', async () => {
    const client = await connect()
    const document = {
      specVersion: '2',
      id: 'x',
      title: 'X',
      model: { fields: [{ key: 'a', type: 'text', label: 'A' }] },
    }

    const result = await client.callTool({
      name: 'diff_forms',
      arguments: { before: document, after: document },
    })

    expect(textOf(result)).toContain('No change')
  })
})

describe('with no server configured', () => {
  test('the local tools still work, which is the point', async () => {
    const client = await connect()

    const result = await client.callTool({ name: 'describe_spec', arguments: {} })

    // A form can be authored and checked before anybody has deployed a
    // backend. That is deliberately the useful half.
    expect(result.isError).toBeUndefined()
  })

  test('a server tool says what to set rather than failing obscurely', async () => {
    const client = await connect()

    const result = await client.callTool({ name: 'list_forms', arguments: {} })

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('FORMANCY_URL')
    expect(textOf(result)).toContain('FORMANCY_API_KEY')
  })
})

describe('with a server', () => {
  test('publish_form reaches it, and carries the key', async () => {
    let seen: { url: string; authorization: string | undefined } | undefined
    const client = await connect({
      baseUrl: 'http://localhost:4380',
      apiKey: 'k_test',
      fetch: ((url: string, init?: RequestInit) => {
        seen = {
          url: String(url),
          authorization: (init?.headers as Record<string, string> | undefined)?.['authorization'],
        }
        return Promise.resolve(
          new Response(JSON.stringify({ version: 1 }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        )
      }) as unknown as typeof globalThis.fetch,
    })

    const result = await client.callTool({
      name: 'publish_form',
      arguments: {
        path: 'quote',
        document: {
          specVersion: '2',
          id: 'quote',
          title: 'Quote',
          model: { fields: [{ key: 'a', type: 'text', label: 'A' }] },
        },
      },
    })

    expect(result.isError).toBeUndefined()
    expect(seen?.url).toBe('http://localhost:4380/forms')
    expect(seen?.authorization).toBe('Bearer k_test')
  })

  test('and refuses to send a document that would not work', async () => {
    let called = false
    const client = await connect({
      baseUrl: 'http://localhost:4380',
      apiKey: 'k_test',
      fetch: (() => {
        called = true
        return Promise.resolve(new Response('{}', { status: 200 }))
      }) as unknown as typeof globalThis.fetch,
    })

    const result = await client.callTool({
      name: 'publish_form',
      arguments: { path: 'quote', document: { specVersion: '2', id: 'quote' } },
    })

    expect(result.isError).toBe(true)
    expect(called).toBe(false)
  })
})
