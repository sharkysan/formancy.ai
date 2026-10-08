import { createRequire } from 'node:module'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
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

/**
 * The version this server reports.
 *
 * From the manifest, not typed. It said `0.1.0` while the package was on 0.3.0 —
 * a wrong statement in the one field a client uses to tell two installations
 * apart, and exactly the hand-written number this repository keeps finding
 * stale.
 *
 * `createRequire` rather than a JSON import: `../package.json` resolves to the
 * package root from both `src/server.ts` and `dist/index.mjs`, so the same line
 * is right in a test and in the published package.
 */
export const PACKAGE_VERSION: string = (
  createRequire(import.meta.url)('../package.json') as { version: string }
).version

/**
 * What a client is told a result looks like, before it reads one.
 *
 * One envelope for every tool rather than a schema each. The shape is the same
 * everywhere — did it work, one sentence a person can read, and the part an
 * agent acts on — so a client that has learned it once has learned it for all
 * nine. A schema per tool would be nine places for `data` to drift from what
 * the tool returns.
 */
const RESULT_SHAPE = {
  ok: z.boolean().describe('Whether the tool did what was asked.'),
  summary: z.string().describe('One or two sentences a person can read.'),
  data: z.unknown().optional().describe('The part an agent acts on, when there is one.'),
}

/**
 * Both readings of the answer: prose and structure.
 *
 * `content` is what a model reads; `structuredContent` is what a client parses
 * without pulling JSON back out of a string. Both travel — prose alone throws
 * away the part an agent acts on, and structure alone makes every refusal a
 * parsing exercise.
 */
function respond(result: ToolResult): {
  content: { type: 'text'; text: string }[]
  structuredContent: Record<string, unknown>
  isError?: boolean
} {
  const text =
    result.data === undefined
      ? result.summary
      : `${result.summary}\n\n${JSON.stringify(result.data, null, 2)}`
  return {
    content: [{ type: 'text', text }],
    structuredContent: {
      ok: result.ok,
      summary: result.summary,
      ...(result.data === undefined ? {} : { data: result.data }),
    },
    // `isError` rather than a thrown exception: a refusal is an answer the model
    // should read and act on, not a transport failure.
    ...(result.ok ? {} : { isError: true }),
  }
}

/**
 * What a tool will do, for a client deciding whether to ask first.
 *
 * The only thing a host has to tell `validate_form` from `publish_form` before
 * calling either. Without them a tool defaults to `readOnlyHint: false`,
 * `destructiveHint: true`, `openWorldHint: true` — so this server’s local,
 * read-only checks were all advertised as potentially destructive calls into an
 * open world, which is the opposite of true in every case.
 */
const LOCAL_CHECK: ToolAnnotations = {
  readOnlyHint: true,
  // No network and no server: these are the ones that work before anything is
  // deployed, and saying so is what lets a host run them without asking.
  openWorldHint: false,
}

const SERVER_READ: ToolAnnotations = { readOnlyHint: true, openWorldHint: true }

/**
 * Publishing. `destructiveHint: false` is not optimism: a published version is
 * immutable and a publish inserts a new row, so nothing is overwritten
 * ([0025](../../../docs/decisions/0025-immutability-in-the-database.md)).
 *
 * Not idempotent, though — publishing the same document twice makes a second
 * version rather than the same one, and saying otherwise would invite a client
 * to retry it freely.
 */
const SERVER_WRITE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
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
  const server = new McpServer({ name: 'formancy', version: PACKAGE_VERSION })
  const { access } = options

  server.registerTool('describe_spec', { description: TOOL_DEFINITIONS.describe_spec, outputSchema: RESULT_SHAPE, annotations: LOCAL_CHECK }, () =>
    respond(describeSpec()),
  )

  server.registerTool(
    'validate_form',
    { description: TOOL_DEFINITIONS.validate_form,
      outputSchema: RESULT_SHAPE,
      annotations: LOCAL_CHECK, inputSchema: { document: DOCUMENT } },
    ({ document }) => respond(validateForm(document)),
  )

  server.registerTool(
    'diff_forms',
    {
      description: TOOL_DEFINITIONS.diff_forms,
      outputSchema: RESULT_SHAPE,
      annotations: LOCAL_CHECK,
      inputSchema: { before: DOCUMENT, after: DOCUMENT },
    },
    ({ before, after }) => respond(diffForms(before, after)),
  )

  server.registerTool(
    'check_scenarios',
    {
      description: TOOL_DEFINITIONS.check_scenarios,
      outputSchema: RESULT_SHAPE,
      annotations: LOCAL_CHECK,
      inputSchema: { document: DOCUMENT, scenarios: SCENARIOS },
    },
    ({ document, scenarios }) => respond(checkScenarios(document, scenarios as never)),
  )

  server.registerTool(
    'propose_form_edit',
    {
      description: TOOL_DEFINITIONS.propose_form_edit,
      outputSchema: RESULT_SHAPE,
      annotations: SERVER_READ,
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
      outputSchema: RESULT_SHAPE,
      annotations: SERVER_WRITE,
      inputSchema: { path: FORM_PATH, document: DOCUMENT, basedOn: BASED_ON },
    },
    async ({ path, document, basedOn }) =>
      respond(
        access === undefined
          ? noServer('publish_form')
          : await publishForm(access, path, document, basedOn),
      ),
  )

  server.registerTool('list_forms', { description: TOOL_DEFINITIONS.list_forms, outputSchema: RESULT_SHAPE, annotations: SERVER_READ }, async () =>
    respond(access === undefined ? noServer('list_forms') : await listForms(access)),
  )

  server.registerTool(
    'get_form',
    { description: TOOL_DEFINITIONS.get_form,
      outputSchema: RESULT_SHAPE,
      annotations: SERVER_READ, inputSchema: { path: FORM_PATH } },
    async ({ path }) =>
      respond(access === undefined ? noServer('get_form') : await getForm(access, path)),
  )

  server.registerTool(
    'list_submissions',
    { description: TOOL_DEFINITIONS.list_submissions,
      outputSchema: RESULT_SHAPE,
      annotations: SERVER_READ, inputSchema: { path: FORM_PATH } },
    async ({ path }) =>
      respond(
        access === undefined ? noServer('list_submissions') : await listSubmissions(access, path),
      ),
  )

  /*
   * The three things somebody asks an agent to do with a form.
   *
   * A tool says what a model CAN call; a prompt says what to do with the set
   * of them, in order. That order is most of the value: a model that writes
   * the document first and calls `describe_spec` afterwards has already
   * invented `type: "email"`, and the correction costs a turn. Scenarios
   * written after the rules they check tend to agree with whatever the rules
   * happen to say.
   *
   * MCP's own answer to a skill pack, so it arrives with the server rather
   * than being documentation somebody has to find and paste
   * ([0112](../../../docs/decisions/0112-the-mcp-server-says-what-its-tools-do.md)).
   */
  server.registerPrompt(
    'build_a_form',
    {
      title: 'Build a form',
      description:
        'Write a new formancy form from a description, in the order that gets it right ' +
        'the first time: the spec, then the document, then examples that check the rules.',
      argsSchema: {
        description: z.string().min(1).describe('What the form is for, in a sentence or two.'),
      },
    },
    ({ description }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `Write a formancy form for: ${description}`,
              '',
              'Work in this order, and do not skip the first step:',
              '',
              '1. Call `describe_spec`. It lists every field type, widget, rule kind and',
              '   format the document format has. A type that is not in that list does not',
              '   exist, whatever other form builders call it — an email field is `text`',
              '   with `format: "email"`.',
              '2. Write the document.',
              '3. Call `validate_form`. It runs the schema check, the engine compile, and',
              '   the check for expressions that compile and can never evaluate. Fix what',
              '   it names and call it again.',
              '4. Write a scenario for every rule, and call `check_scenarios`. This is the',
              '   only check that catches a condition written backwards: `a == b` and',
              '   `a != b` are both valid CEL and both pass step 3. Write the scenarios',
              '   from the description above rather than from the rules you just wrote, or',
              '   they will agree with whatever the rules happen to say.',
              '5. Show the person the form and what the scenarios checked, before',
              '   publishing anything.',
            ].join('\n'),
          },
        },
      ],
    }),
  )

  server.registerPrompt(
    'change_a_form',
    {
      title: 'Change a published form',
      description:
        'Edit a form that already exists, without discarding somebody else’s work and ' +
        'without publishing a change nobody has read.',
      argsSchema: {
        path: z.string().min(1).describe("The form's path, as it appears in its URL."),
        change: z.string().min(1).describe('What should be different, in a sentence.'),
      },
    },
    ({ path, change }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `Change the form at "${path}": ${change}`,
              '',
              'A formancy document is the WHOLE form, so an edit based on an older version',
              'silently discards whatever was published in between — and the publish',
              'succeeds, so nothing reports it. Work this way:',
              '',
              '1. Call `get_form` for the current document.',
              '2. Make the change to it.',
              '3. Call `propose_form_edit`. It publishes nothing, and answers with what the',
              '   edit would cost submissions already collected, plus a `basedOn` hash.',
              '4. Show the person that list. A change marked lossy means stored answers lose',
              '   the field they live in; say so plainly before going further.',
              '5. Call `publish_form` with `basedOn` set to the hash from step 3. If it',
              '   refuses, the form moved — start again from step 1 rather than publishing',
              '   over it.',
            ].join('\n'),
          },
        },
      ],
    }),
  )

  server.registerPrompt(
    'embed_a_form',
    {
      title: 'Embed a form in an application',
      description: 'Render a formancy document in a React or Angular application.',
      argsSchema: {
        framework: z.enum(['react', 'angular']).describe('Which renderer the application uses.'),
      },
    },
    ({ framework }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            // One framework's instructions, never both: a prompt that lists
            // the alternative makes the model choose again, having just been
            // told which one this application uses.
            text:
              framework === 'angular'
                ? [
                    'Render a formancy form in an Angular application.',
                    '',
                    '- Install `@formancy/angular` and `@formancy/core`.',
                    '- Build the engine once with `createFormEngine({ schema })` and provide',
                    '  it with `provideFormancy(engine)`.',
                    '- Render `<formancy-form />`. It is zoneless and OnPush, and the engine',
                    '  is the state — there is nothing to copy into a component.',
                    '- Styling is yours: the renderer ships no CSS. A theme from',
                    '  `@formancy/themes` is one stylesheet import and a',
                    '  `data-formancy-theme` attribute, or write your own against the',
                    '  `data-formancy-part` hooks.',
                    '- The submitted value is `engine.value()`. Validate it on the server',
                    '  too: the same engine runs there, so the two cannot disagree.',
                  ].join('\n')
                : [
                    'Render a formancy form in a React application.',
                    '',
                    '- Install `@formancy/react` and `@formancy/core`.',
                    '- Build the engine once with `createFormEngine({ schema })` and put it',
                    '  in `<FormancyProvider engine={engine}>`.',
                    '- Render `<FormancyForm />`. The engine is the state; there is nothing',
                    '  to copy into component state and nothing to memoise.',
                    '- Styling is yours: the renderer ships no CSS. A theme from',
                    '  `@formancy/themes` is one stylesheet import and a',
                    '  `data-formancy-theme` attribute, or write your own against the',
                    '  `data-formancy-part` hooks.',
                    '- The submitted value is `engine.value()`. Validate it on the server',
                    '  too: the same engine runs there, so the two cannot disagree.',
                  ].join('\n'),
          },
        },
      ],
    }),
  )

  return server
}
