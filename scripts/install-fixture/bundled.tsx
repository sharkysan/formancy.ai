/**
 * The same packages, handed to a bundler.
 *
 * Resolving under Node and resolving under a bundler are different questions —
 * the `exports` maps carry a `bundler` condition that nothing else here
 * exercises — and a stylesheet shipped by `@formancy/themes` is only reachable
 * this way at all.
 *
 * Never executed. What is proved is that a consumer's ordinary Vite build
 * resolves and compiles every one of these, JSX and CSS included.
 */
import { createRoot } from 'react-dom/client'
import { createFormEngine } from '@formancy/core'
import { FormancyForm, FormancyProvider } from '@formancy/react'
import { PropertyPanel } from '@formancy/builder-react'
import { createBuilderSession } from '@formancy/builder-core'
import type { FormSchema } from '@formancy/spec'
import '@formancy/themes/blueprint.css'

const schema = {
  specVersion: '1',
  id: 'bundled',
  title: 'Bundled',
  model: { fields: [{ key: 'email', type: 'text', label: 'Email' }] },
} as unknown as FormSchema

const engine = createFormEngine({
  schema,
  capabilities: { now: () => 0, today: () => '2026-10-04', random: () => 0.5 },
})

const session = createBuilderSession(schema)

export function mount(host: HTMLElement): void {
  createRoot(host).render(
    <FormancyProvider engine={engine}>
      <FormancyForm layout="web" />
      <PropertyPanel session={session} keyPath={['email']} />
    </FormancyProvider>,
  )
}
