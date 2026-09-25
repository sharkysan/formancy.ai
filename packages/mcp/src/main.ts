#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createFormancyMcpServer } from './server.js'

/**
 * The executable. Reads the environment, wires the server, listens on stdio.
 *
 * A server is optional and its absence is a supported state: describe_spec,
 * validate_form and diff_forms need nothing but this process, so an agent can
 * author and check a whole form before anybody has deployed a backend. That is
 * deliberately the useful half.
 *
 * stdio rather than HTTP, because the client launches this process and talks
 * down its pipes. Nothing here listens on a port, so nothing here needs a
 * port's worth of thinking about who can reach it.
 */
const baseUrl = process.env['FORMANCY_URL']
const apiKey = process.env['FORMANCY_API_KEY']

if ((baseUrl === undefined) !== (apiKey === undefined)) {
  // Half-configured is the state worth refusing: a URL with no key produces a
  // 401 on every call, and a key with no URL produces nothing at all. Both
  // look like the tool being broken rather than unconfigured.
  throw new Error(
    'Set FORMANCY_URL and FORMANCY_API_KEY together, or neither. With neither, the local tools still work.',
  )
}

const server = createFormancyMcpServer(
  baseUrl === undefined || apiKey === undefined ? {} : { access: { baseUrl, apiKey } },
)

await server.connect(new StdioServerTransport())
