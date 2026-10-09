/**
 * The React renderer, run — under the React this consumer installed.
 *
 * `bundled.tsx` proves a bundler compiles the renderer and is never executed, which
 * says nothing about whether it works with the React a consumer has. This renders a
 * form to HTML under Node, so the hooks run and the engine's ids reach the markup: the
 * part of "works with React 19.0.0" that a type check cannot answer (0134).
 */
import { renderToString } from 'react-dom/server'
import { createFormEngine } from '@formancy/core'
import { FormancyForm, FormancyProvider } from '@formancy/react'
import type { FormSchema } from '@formancy/spec'

const schema = {
  specVersion: '1',
  id: 'rendered',
  title: 'Rendered',
  model: {
    fields: [
      { key: 'email', type: 'text', label: 'Email', required: true },
      { key: 'agree', type: 'checkbox', label: 'I agree' },
    ],
  },
} as unknown as FormSchema

const engine = createFormEngine({
  schema,
  capabilities: { now: () => 0, today: () => '2026-10-09', random: () => 0.5 },
})

const html = renderToString(
  <FormancyProvider engine={engine}>
    <FormancyForm />
  </FormancyProvider>,
)

// The label names the control the engine minted, and the required field says so.
const expected = [
  'for="f:rendered:email:control"',
  'id="f:rendered:email:control"',
  'aria-required="true"',
  '>Email<',
  '>I agree<',
]
const missing = expected.filter((fragment) => !html.includes(fragment))
if (missing.length > 0) {
  throw new Error(`the rendered form is missing ${missing.join(', ')}:\n${html.slice(0, 2000)}`)
}
console.log(`rendered ${String(html.length)} characters of form`)
