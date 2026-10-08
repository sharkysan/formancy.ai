import { describe, expect, test } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { PACKAGE_VERSION, TOOL_DEFINITIONS, createFormancyMcpServer } from './server.js'
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

/**
 * What a prompt actually says, narrowed to its text parts.
 *
 * A prompt message's content is a union — text, image, audio, a resource —
 * and only one of them has words in it. Narrowed rather than cast: a cast
 * would keep compiling the day a prompt grows a second kind of part, and
 * would quietly stop reading half of it.
 */
const promptText = (messages: readonly { content: { type: string; text?: string } }[]): string =>
  messages
    .map((message) => (message.content.type === 'text' ? (message.content.text ?? '') : ''))
    .join('\n')

describe('the tools a client can see', () => {
  test('all nine, each with a description', async () => {
    const client = await connect()

    const { tools } = await client.listTools()

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'check_scenarios',
      'describe_spec',
      'diff_forms',
      'get_form',
      'list_forms',
      'list_submissions',
      'propose_form_edit',
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

/**
 * What a client is told about a tool before it calls one.
 *
 * A description says when to reach for a tool. **Annotations say what it will
 * do**, and they are the only thing a client has to decide whether a call
 * needs a person's agreement: a host that auto-approves read-only tools and
 * asks about the rest cannot tell `validate_form` from `publish_form` without
 * them, so it either asks about everything or asks about nothing.
 *
 * Every one of these was absent. An unannotated tool defaults to
 * `readOnlyHint: false`, `destructiveHint: true`, `openWorldHint: true` — so
 * the eight local, read-only checks in this server were all advertised as
 * potentially destructive calls into an open world, which is the opposite of
 * true in every case ([0112](../../../docs/decisions/0112-the-mcp-server-says-what-its-tools-do.md)).
 */
describe('what a tool says about itself', () => {
  test('every one carries annotations, because an unannotated tool reads as destructive', async () => {
    const client = await connect()

    const { tools } = await client.listTools()

    const unannotated = tools.filter((tool) => tool.annotations === undefined).map((t) => t.name)
    expect(unannotated).toEqual([])
  })

  test('the local checks say they change nothing and reach nowhere', async () => {
    /*
     * Four tools that need no server and no credentials. Saying so is what
     * lets a host run them without asking, which is the difference between an
     * agent that checks its work and one that checks it once.
     */
    const client = await connect()
    const { tools } = await client.listTools()
    const by = new Map(tools.map((tool) => [tool.name, tool.annotations]))

    for (const name of ['describe_spec', 'validate_form', 'diff_forms', 'check_scenarios']) {
      expect(by.get(name)?.readOnlyHint, name).toBe(true)
      // No network: these are the ones that work before a server exists.
      expect(by.get(name)?.openWorldHint, name).toBe(false)
    }
  })

  test('and the one that writes says so, without claiming to be destructive', async () => {
    /*
     * Publishing is additive by construction: a published version is
     * immutable and a publish inserts a new row
     * ([0025](../../../docs/decisions/0025-immutability-in-the-database.md)).
     * Nothing is overwritten, so `destructiveHint: false` is the truth — and
     * it is the kind of claim worth a test, because the default is the
     * opposite and the default would be wrong in the cautious direction.
     */
    const client = await connect()
    const { tools } = await client.listTools()
    const publish = tools.find((tool) => tool.name === 'publish_form')?.annotations

    expect(publish?.readOnlyHint).toBe(false)
    expect(publish?.destructiveHint).toBe(false)
    expect(publish?.openWorldHint).toBe(true)
  })

  test('and the server reports the version it actually is', async () => {
    /*
     * It said `0.1.0` while the package was on 0.3.0 — a wrong statement in
     * the one field a client uses to tell two installations apart, and
     * exactly the hand-typed number this repository keeps finding stale.
     * Derived from the manifest now.
     */
    const client = await connect()

    const info = client.getServerVersion()

    expect(info?.name).toBe('formancy')
    expect(info?.version).toBe(PACKAGE_VERSION)
  })
})

/**
 * The answer, in both readings.
 *
 * Every tool used to answer with prose and a JSON blob glued to the end of
 * it, so a client wanting the structure had to find the blank line and parse
 * what came after. `structuredContent` is the protocol's own answer to that,
 * and the envelope is the same for all nine tools: did it work, one sentence
 * a person can read, and the part an agent acts on
 * ([0112](../../../docs/decisions/0112-the-mcp-server-says-what-its-tools-do.md)).
 */
describe('the shape of an answer', () => {
  test('carries the structure beside the prose, not inside it', async () => {
    const client = await connect()

    const result = await client.callTool({ name: 'describe_spec', arguments: {} })

    const structured = (result as { structuredContent?: Record<string, unknown> }).structuredContent
    expect(structured, 'a client has to parse the text to get at the data').toBeDefined()
    expect(structured?.ok).toBe(true)
    expect(typeof structured?.summary).toBe('string')
    expect(structured?.data).toBeDefined()
    // And the prose is still there: it is what the model reads.
    expect(textOf(result).length).toBeGreaterThan(20)
  })

  test('and a refusal is structured too, rather than being only a sentence', async () => {
    /*
     * The half that is easy to leave out. A refusal is the answer a client
     * most needs to act on — retry, ask a person, give up — and one that
     * arrives as prose alone makes that a reading-comprehension problem.
     */
    const client = await connect()

    const result = await client.callTool({
      name: 'validate_form',
      arguments: { document: { specVersion: '2', id: 'x' } },
    })

    expect((result as { isError?: boolean }).isError).toBe(true)
    const structured = (result as { structuredContent?: Record<string, unknown> }).structuredContent
    expect(structured?.ok).toBe(false)
    expect(structured?.data).toBeDefined()
  })

  test('and every tool declares that shape, so a client learns it once', async () => {
    // Nine schemas would be nine places for `data` to drift from what the
    // tool returns.
    const client = await connect()

    const { tools } = await client.listTools()

    const without = tools.filter((tool) => tool.outputSchema === undefined).map((t) => t.name)
    expect(without).toEqual([])
  })
})

/**
 * The three things somebody asks an agent to do with a form.
 *
 * A tool says what a model *can* call. A prompt says what the model should do
 * with the set of them, in order — which is the difference between an agent
 * that calls `describe_spec` because it happened to and one that calls it
 * first because writing a form starts there.
 *
 * MCP's own answer to a skill pack, so it arrives with the server rather than
 * being documentation somebody has to find and paste
 * ([0112](../../../docs/decisions/0112-the-mcp-server-says-what-its-tools-do.md)).
 */
describe('the prompts a client can see', () => {
  test('three, named for what somebody is doing rather than for the tools', async () => {
    const client = await connect()

    const { prompts } = await client.listPrompts()

    expect(prompts.map((prompt) => prompt.name).sort()).toEqual([
      'build_a_form',
      'change_a_form',
      'embed_a_form',
    ])
    for (const prompt of prompts) expect(prompt.description ?? '').not.toBe('')
  })

  test('and building one tells the model the order, not just the tool names', async () => {
    /*
     * The order is the whole value. A model that writes the document first
     * and calls `describe_spec` afterwards has already invented
     * `type: "email"`, and the correction costs a turn. The same for
     * scenarios: written after the rules they are supposed to check, they
     * tend to agree with whatever the rules happen to say.
     */
    const client = await connect()

    const { messages } = await client.getPrompt({
      name: 'build_a_form',
      arguments: { description: 'a contact form with an optional phone number' },
    })

    const said = promptText(messages)
    expect(said).toContain('describe_spec')
    expect(said).toContain('check_scenarios')
    // And the instruction itself, so the prompt is about this form rather
    // than a lecture the model has to apply.
    expect(said).toContain('optional phone number')
  })

  test('and changing one points at the two-step path rather than at publish', async () => {
    // The lost update is the mistake an agent makes that nobody sees until
    // the form is wrong, and the prompt is where it is cheapest to prevent.
    const client = await connect()

    const { messages } = await client.getPrompt({
      name: 'change_a_form',
      arguments: { path: 'contact-us', change: 'make the phone number required' },
    })

    const said = promptText(messages)
    expect(said).toContain('propose_form_edit')
    expect(said).toContain('contact-us')
    /*
     * The two in ONE line, not both somewhere in the text. The first version
     * asked for `basedOn` anywhere, and removing the instruction that
     * actually matters — publish with the hash — left the word in step 3's
     * description and the case stayed green. Found by mutating it.
     */
    const instruction = said
      .split('\n')
      .find((line) => line.includes('publish_form') && line.includes('basedOn'))
    expect(instruction, 'nothing tells the model to publish with the hash').toBeDefined()
  })

  test('and embedding one says which package, in which framework', async () => {
    const client = await connect()

    const { messages } = await client.getPrompt({
      name: 'embed_a_form',
      arguments: { framework: 'angular' },
    })

    const said = promptText(messages)
    expect(said).toContain('@formancy/angular')
    // And not the other one: a prompt that lists both makes the model choose
    // again, having just been told.
    expect(said).not.toContain('@formancy/react')
  })
})
