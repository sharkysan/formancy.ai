import type { ViteUserConfig } from 'vitest/config'

/**
 * One coverage policy for every package, and the reasons for its exclusions.
 *
 * Written once because it is an argument, not a setting: a coverage number is
 * only worth reading if what it counts is defensible, and ten copies of a list
 * drift until nobody can say what the number means.
 *
 * What is excluded, and why:
 *
 * - **Barrels** (`index.ts` that only re-exports). They have no behaviour.
 *   Nothing in a package imports its own barrel, so v8 reports every line as
 *   uncovered and the package's number goes down for a file that cannot be
 *   wrong.
 * - **Composition roots** (`main.ts`, `main.tsx`). Reading environment
 *   variables, wiring adapters together and listening on a port. A unit test
 *   of one is a test of the test: it would assert the wiring it just wrote.
 *   They are covered where it counts, by `docker compose up` actually working,
 *   and pretending otherwise with a mock-heavy test would raise the number
 *   without raising the confidence.
 * - **Generated and declaration files**, which have no source to cover.
 *
 * Everything else counts, including the parts that are awkward to reach. When
 * a file is hard to cover that is usually the file saying something about its
 * own design.
 */
export const coverage: NonNullable<NonNullable<ViteUserConfig['test']>['coverage']> = {
  provider: 'v8',
  reporter: ['text', ['lcov', { projectRoot: '../..' }]],
  include: ['src/**/*.{ts,tsx}'],
  exclude: [
    'src/**/*.test.{ts,tsx}',
    'src/**/*.spec.{ts,tsx}',
    'src/**/*.d.ts',
    'src/test-setup.ts',
    'src/index.ts',
    'src/main.ts',
    'src/main.tsx',
  ],
}
