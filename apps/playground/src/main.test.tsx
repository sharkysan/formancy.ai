import { expect, test, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { MONACO_VS } from './monaco-path.js'

/**
 * The playground as `main.tsx` starts it, with Monaco's real loader and hook.
 *
 * Every other suite here mocks `useMonaco` to return `null`, which is what its type
 * promises. Pointing the loader at this site (0154) broke that promise: `loader.config`
 * stores the instance it was given, and given only `paths` it stores `undefined` — so the
 * hook's first answer was `undefined`, a check against `null` let it through, and reading
 * `languages` off it took the whole page down. Every mocked suite stayed green; only a
 * browser showed a blank playground. So here only the editor component is replaced, for
 * the reason the other suites give: it measures a DOM jsdom does not have.
 */
vi.mock('@monaco-editor/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@monaco-editor/react')>()),
  default: ({ value }: { value?: string }) => <textarea readOnly aria-label="Schema" value={value ?? ''} />,
}))

test('the playground renders with its loader pointed at this site, and asks this site for Monaco', async () => {
  document.body.innerHTML = '<div id="root"></div>'
  await import('./main.js')

  // The page survives the loader's undefined: the form is drawn.
  await waitFor(() => {
    expect(screen.getByRole('region', { name: 'React' })).toBeTruthy()
  })

  // And the loader's script tag names this site, under the app's base, rather than the
  // CDN it defaults to. jsdom never fetches it, so the address is the whole fact.
  const script = document.querySelector<HTMLScriptElement>('script[src$="/loader.js"]')
  expect(script?.getAttribute('src')).toBe(`${import.meta.env.BASE_URL}${MONACO_VS}/loader.js`)
})
