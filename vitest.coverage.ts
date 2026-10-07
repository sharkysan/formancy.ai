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
 * - **A framework's own config** (`content.config.ts`), for the same reason as a
 *   composition root: it wires a loader and a schema together and is verified by
 *   the build that reads it.
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
    // A framework's own config, which is the composition-root argument in
    // another costume: `apps/docs/src/content.config.ts` is three imports and an
    // object literal handing Astro a loader and a schema. There is nothing in it
    // a unit test could find wrong — a bad collection config fails the docs
    // build, which `pnpm build:web` runs as a gate. Excluded after reading the
    // report and finding it at 0% beside files that genuinely were untested;
    // leaving it there makes the figure mean less, which is what these
    // exclusions exist to prevent.
    'src/content.config.ts',
  ],
}

/**
 * How long a suite that renders a real component tree may take for one case.
 *
 * Written once for the same reason the coverage policy is: it is an argument
 * rather than a setting, and eight copies of a number drift until nobody can
 * say what it was chosen for.
 *
 * **It is here to catch a hang, not to police speed.** Speed is the performance
 * gate's job (`pnpm bench`, §9.3), which measures what it is measuring under
 * conditions it controls. A test timeout measured against the wall clock of a
 * shared CI runner measures the runner.
 *
 * Measured, which is why it is this large. Rendering a form into jsdom is real
 * work: the Angular suites' first `render(FormancyForm, …)` compiles the form
 * and the seventeen field components the registry pulls in, at 372ms locally,
 * and the same case was observed at **5,396ms** on a loaded runner — a factor
 * of fourteen. React's wizard conformance case measures ~630ms locally and was
 * observed failing at **5,618ms**, a factor of nine. Both failures were the 5s
 * default, and neither was a defect in the test.
 *
 * The Angular pair, the playground and the site were moved off the default when
 * the first of those turned `main` red; the React side was left on it and failed
 * the same way a week later. So every suite that mounts a real tree now shares
 * this.
 */
export const RENDER_TIMEOUT_MS = 20_000
