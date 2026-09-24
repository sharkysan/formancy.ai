import { describe, expect, test } from 'vitest'
import type { ConfigEnv, UserConfig } from 'vite'
import config from '../vite.config.js'

/**
 * Where the built app thinks it lives.
 *
 * This is here because the way it breaks is silent. formancy.ai is one static
 * deployment — the site at `/`, this app copied into `/playground/` — and Vite
 * writes absolute asset URLs. Built with the default base, the playground's
 * HTML asks for `/assets/index-<hash>.js`, which is the SITE's asset
 * directory: the page loads, the script 404s, and the visitor gets a blank
 * screen while the build log says everything succeeded.
 *
 * Nothing else in the suite can see that. The dev server is fine, every unit
 * test is fine, and the failure only exists in the deployed artefact.
 */
const resolve = (command: ConfigEnv['command']): UserConfig => {
  // The config is a function of its environment, so a test has to supply one.
  const factory = config as (env: ConfigEnv) => UserConfig
  return factory({ command, mode: command === 'build' ? 'production' : 'development' })
}

describe('the built playground knows it is in a subdirectory', () => {
  test('a build is based at /playground/', () => {
    // The trailing slash is Vite's requirement, not a style choice: without it
    // the asset URLs come out as `/playgroundassets/...`.
    expect(resolve('build').base).toBe('/playground/')
  })

  test('the dev server is not, because it is its own origin', () => {
    expect(resolve('serve').base).toBe('/')
  })
})
