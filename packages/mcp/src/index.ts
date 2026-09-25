/**
 * @formancy/mcp — formancy as tools a coding agent can use.
 *
 * Install it in Claude Code, Cursor or anything else speaking the Model
 * Context Protocol, and a model can author a form, be told exactly what is
 * wrong with it, find out what a change would do to the submissions already
 * collected, and publish it.
 *
 * The part worth caring about is the checking. A model writing a form is a
 * model writing logic, and a wrong expression does not crash — it shows the
 * wrong field to the wrong person for a year. formancy can catch that before
 * the form exists, because the document format has a published JSON Schema and
 * the expression language is statically type-checked, so the tools here check
 * first and act second.
 */

export {
  describeSpec,
  diffForms,
  getForm,
  listForms,
  listSubmissions,
  publishForm,
  validateForm,
} from './tools.js'
export type { ServerAccess, ToolResult } from './tools.js'

export { TOOL_DEFINITIONS, createFormancyMcpServer } from './server.js'
export type { McpServerOptions } from './server.js'
