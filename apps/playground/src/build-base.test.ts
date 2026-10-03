import { describe, expect, test, vi } from 'vitest'
import type { ConfigEnv, UserConfig } from 'vite'

/*
 * The Angular plugin, stubbed — and only here.
 *
 * This file imports the REAL `vite.config.ts`, which is the whole point: a test
 * that restated the base value would pass while the build used another one. The
 * config now also imports Vite's Angular plugin, which reaches `@angular/build`
 * and through it `listr2` — an ES module shipped inside a CommonJS package, so
 * Node refuses its `import` statement and the suite fails to load the config at
 * all.
 *
 * Stubbed rather than worked around in the vitest config, because what this
 * file asserts is one string and the plugin has nothing to do with it. Inlining
 * the dependency for the whole suite was tried first and made it worse: with
 * `inline: true` Vitest went on to try to transform TypeScript itself.
 */
vi.mock('@analogjs/vite-plugin-angular', () => ({
  default: () => ({ name: 'angular-stub' }),
}))

const { default: config } = await import('../vite.config.js')

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
