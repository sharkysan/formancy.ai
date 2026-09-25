import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  describeSpec,
  diffForms,
  getForm,
  listForms,
  listSubmissions,
  publishForm,
  validateForm,
} from './tools.js'
import type { ServerAccess, ToolResult } from './tools.js'

/**
 * The tools, wired to the protocol.
 *
 * Thin on purpose: every one of these is a call into `tools.ts` and a
 * conversion of the answer into MCP's content shape. The logic is tested
 * without a protocol, because a use-case that can only be exercised through a
 * transport is a use-case nobody tests properly.
 */

export interface McpServerOptions {
  /**
   * Where a formancy server is, if there is one.
   *
   * Absent is a supported state and not a degraded one: the four local tools
   * — describe_spec, validate_form, diff_forms and the checking half of
   * publishing — need no server at all, which means an agent can author and
   * verify a whole form before anybody has deployed anything.
   */
  readonly access?: ServerAccess
}

/**
 * Names and descriptions, apart from the wiring.
 *
 * Exported because the description is the prompt: it is the only thing telling
 * a model when to reach for a tool, and a wrong one means a tool that is never
 * called or called for the wrong reason. Kept where it can be read and tested
 * rather than buried in a registration call.
 */
export const TOOL_DEFINITIONS = {
  describe_spec:
    'List every field type, layout kind, rule kind and format the formancy spec defines. ' +
    'Call this BEFORE writing a form document. A type not in the list does not exist, whatever ' +
    'other form builders call it.',
  validate_form:
    "Run the server's publish checks without publishing: against the spec, through the engine " +
    'that renders the form (a misspelled field name, a cycle between computed fields, a ' +
    'condition that is not certain to produce a bool), and for expressions that compile but ' +
    'can never evaluate — the failure that is silent at runtime. Each comes back separately, ' +
    'with what to change.',
  diff_forms:
    'Compare two form documents and report what the change would do to submissions already ' +
    'collected: compatible, lossy, or breaking. Call this before publishing over an existing form.',
  publish_form:
    'Publish a form document to a formancy server. Validates locally first and refuses to send ' +
    'an invalid document, so the reason comes back as something to fix rather than as a 422.',
  list_forms: 'List the forms on the formancy server, with their current version.',
  get_form: 'Fetch one form document from the formancy server, with its version and schema hash.',
  list_submissions: 'List submissions for one form.',
} as const

/** MCP wants string content; a tool that answered with prose alone would throw
 *  away the part an agent can act on, so both travel. */
function respond(result: ToolResult): {
  content: { type: 'text'; text: string }[]
  isError?: boolean
} {
  const text =
    result.data === undefined
      ? result.summary
      : `${result.summary}\n\n${JSON.stringify(result.data, null, 2)}`
  // `isError` rather than a thrown exception: a refusal is an answer the model
  // should read and act on, not a transport failure.
  return { content: [{ type: 'text', text }], ...(result.ok ? {} : { isError: true }) }
}

/** A tool that needs a server, when there is not one. */
function noServer(name: string): ToolResult {
  return {
    ok: false,
    summary:
      `${name} needs a formancy server, and none is configured. Set FORMANCY_URL and ` +
      `FORMANCY_API_KEY. The local tools — describe_spec, validate_form and diff_forms — work ` +
      `without one, so a form can be written and checked before a server exists.`,
  }
}

/**
 * The arguments each tool takes.
 *
 * A document arrives as `unknown` on purpose: it is checked by
 * `validateSchema` against the spec's own JSON Schema, which is the one
 * authority on what a formancy document is. Describing its shape a second
 * time here in Zod would be a second authority, and the day the two disagree
 * the tool would reject a document the product accepts.
 */
const DOCUMENT = z.unknown().describe('A formancy form document (the JSON schema object).')
const FORM_PATH = z.string().min(1).describe("The form's path, as it appears in its URL.")

export function createFormancyMcpServer(options: McpServerOptions = {}): McpServer {
  const server = new McpServer({ name: 'formancy', version: '0.1.0' })
  const { access } = options

  server.registerTool('describe_spec', { description: TOOL_DEFINITIONS.describe_spec }, () =>
    respond(describeSpec()),
  )

  server.registerTool(
    'validate_form',
    { description: TOOL_DEFINITIONS.validate_form, inputSchema: { document: DOCUMENT } },
    ({ document }) => respond(validateForm(document)),
  )

  server.registerTool(
    'diff_forms',
    {
      description: TOOL_DEFINITIONS.diff_forms,
      inputSchema: { before: DOCUMENT, after: DOCUMENT },
    },
    ({ before, after }) => respond(diffForms(before, after)),
  )

  server.registerTool(
    'publish_form',
    {
      description: TOOL_DEFINITIONS.publish_form,
      inputSchema: { path: FORM_PATH, document: DOCUMENT },
    },
    async ({ path, document }) =>
      respond(
        access === undefined
          ? noServer('publish_form')
          : await publishForm(access, path, document),
      ),
  )

  server.registerTool('list_forms', { description: TOOL_DEFINITIONS.list_forms }, async () =>
    respond(access === undefined ? noServer('list_forms') : await listForms(access)),
  )

  server.registerTool(
    'get_form',
    { description: TOOL_DEFINITIONS.get_form, inputSchema: { path: FORM_PATH } },
    async ({ path }) =>
      respond(access === undefined ? noServer('get_form') : await getForm(access, path)),
  )

  server.registerTool(
    'list_submissions',
    { description: TOOL_DEFINITIONS.list_submissions, inputSchema: { path: FORM_PATH } },
    async ({ path }) =>
      respond(
        access === undefined ? noServer('list_submissions') : await listSubmissions(access, path),
      ),
  )

  return server
}
