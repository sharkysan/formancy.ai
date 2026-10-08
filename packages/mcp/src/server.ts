import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  checkScenarios,
  describeSpec,
  diffForms,
  getForm,
  listForms,
  listSubmissions,
  proposeFormEdit,
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
  check_scenarios:
    'Run a form against examples with their answers written down, and report which stopped ' +
    'holding. The ONE check that catches a condition which compiles and is the opposite of ' +
    'what was asked for — validate_form cannot, because both spellings are valid CEL. Needs no ' +
    'server. Write a scenario for every rule you add: a set of answers, whether the form is ' +
    'valid, which errors it gives, which fields are visible, and what the submission carries.',
  propose_form_edit:
    'Hold an edit up against the form that is published, WITHOUT publishing it. Answers with ' +
    'what the edit would do to submissions already collected, and with a basedOn hash. ' +
    'Call this instead of publish_form whenever you are changing a form that already exists: ' +
    'show the changes to the person, get their agreement, then publish_form with the basedOn ' +
    'it gave you.',
  publish_form:
    'Publish a form document to a formancy server. Validates locally first and refuses to send ' +
    'an invalid document, so the reason comes back as something to fix rather than as a 422. ' +
    'Pass basedOn when changing an existing form: a document is the WHOLE form, so publishing ' +
    'one based on an older version silently discards whatever was published in between, and ' +
    'the publish succeeds so nothing reports it.',
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
/*
 * The scenarios arrive loosely typed for the reason a document does: their
 * shape belongs to `@formancy/core`, and describing it a second time in Zod
 * would be a second authority that eventually disagrees with the first.
 */
const SCENARIOS = z
  .array(z.unknown())
  .describe(
    'Examples with their answers: each is { name, changes, valid } and may also pin errors, ' +
      'visible, values and absent.',
  )
const BASED_ON = z
  .string()
  .optional()
  .describe(
    'The schema hash this edit was based on, from propose_form_edit or get_form. Given, the ' +
      'publish is refused if the form has changed since.',
  )

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
    'check_scenarios',
    {
      description: TOOL_DEFINITIONS.check_scenarios,
      inputSchema: { document: DOCUMENT, scenarios: SCENARIOS },
    },
    ({ document, scenarios }) => respond(checkScenarios(document, scenarios as never)),
  )

  server.registerTool(
    'propose_form_edit',
    {
      description: TOOL_DEFINITIONS.propose_form_edit,
      inputSchema: { path: FORM_PATH, document: DOCUMENT },
    },
    async ({ path, document }) =>
      respond(
        access === undefined
          ? noServer('propose_form_edit')
          : await proposeFormEdit(access, path, document),
      ),
  )

  server.registerTool(
    'publish_form',
    {
      description: TOOL_DEFINITIONS.publish_form,
      inputSchema: { path: FORM_PATH, document: DOCUMENT, basedOn: BASED_ON },
    },
    async ({ path, document, basedOn }) =>
      respond(
        access === undefined
          ? noServer('publish_form')
          : await publishForm(access, path, document, basedOn),
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
