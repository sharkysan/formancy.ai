import type { ConformanceSchema, JsonValue, SubmitStatus } from './types.js'

/**
 * A driver is the adapter between one fixture suite and one implementation.
 *
 * The same fixtures run through the engine in Node, the engine in a browser,
 * the React renderer, the Angular renderer and the server's revalidation
 * endpoint. Five drivers, one suite: that is the only mechanism that keeps two
 * renderers from drifting apart, because a behaviour is written down once and
 * every implementation is measured against the same words.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────
 *
 * A DRIVER RESOLVES A FIELD BY ACCESSIBLE NAME AND ROLE. NOTHING ELSE.
 *
 * `getByRole('textbox', { name })`, `getByLabelText(name)`. Never a test id,
 * never a CSS selector, never a component instance, never a framework-internal
 * handle.
 *
 * The consequence is the point: a renderer whose markup cannot be queried by
 * role and accessible name FAILS CONFORMANCE. An input with no label, a custom
 * combobox built from unlabelled divs, an error message not associated with its
 * control — none of them can be driven, so none of them can pass. Accessibility
 * stops being a workstream somebody schedules and becomes a structural property
 * of a passing test run.
 *
 * A future contributor will hit a renderer that is awkward to query and reach
 * for `data-testid` to unblock themselves. That escape hatch deletes the whole
 * guarantee: the suite would then pass over markup no screen reader can use,
 * and it would pass for years before anyone noticed. If a control cannot be
 * found by name and role, the bug is in the renderer. Fix the renderer.
 *
 * The one place a driver may use its own knowledge is the mapping from the
 * fixture's data path to the accessible name to query for: the driver mounted
 * the schema, so it can read `fieldAtPath(schema, path).label`. What it may not
 * do is reach into the implementation to find the control.
 *
 * The fixture format backs the rule up mechanically: `validateFixture` refuses
 * a fixture whose visible leaf fields lack a `label`, and refuses an
 * addItem/removeItem step on a repeater without `addLabel`/`removeLabel`. So
 * every runnable case CARRIES the accessible names, and the names a driver
 * must resolve by are exactly the fixture's `label`, `addLabel` and
 * `removeLabel` — never a name it invents or translates itself.
 *
 * NOTE: that validator check is the minimum enforcement, not the mechanism.
 * The full driver-contract kit is follow-up work: a shared driver test suite
 * that mounts deliberately broken markup (an unlabelled input, an unassociated
 * error message) and asserts the driver CANNOT find it, plus an aria-snapshot
 * golden per fixture. Until it exists, a driver that queries by test id
 * passes undetected; the rule above is enforced by review.
 */
export interface RendererDriver {
  /**
   * Render the schema and resolve once the form is interactive — after the
   * first calculation pass, so `valueOf` on a calculated field is meaningful.
   */
  mount(schema: ConformanceSchema, options?: MountOptions): Promise<void>

  /**
   * Put a value into the control at `path` the way a person would: focus it,
   * change it, and let it blur. A driver that writes the value into the
   * engine's state directly tests nothing about the renderer.
   */
  fill(path: string, value: JsonValue): Promise<void>

  /**
   * Press a control. Either a field path, or a command path such as
   * `contacts#add`, `contacts[1]#remove`, `#next` or `#back`; see
   * `COMMAND_SEPARATOR`. The accessible name to press comes from the schema —
   * a repeater's `addLabel` and `removeLabel`.
   */
  activate(path: string): Promise<void>

  /**
   * The data paths currently in the accessible tree.
   *
   * The reference implementation is: for every field path in the mounted
   * schema, query by that field's role and accessible name, and keep the ones
   * that are found. So "visible" means "reachable by a person using the form",
   * not `display !== 'none'` — a field hidden with `aria-hidden` or moved off
   * screen is correctly reported as hidden.
   */
  visibleFields(): Promise<readonly string[]>

  /**
   * The value shown by the control at `path`, read through the control rather
   * than from the engine, so a renderer that fails to reflect a calculated
   * value into its input fails the case.
   */
  valueOf(path: string): Promise<JsonValue>

  /**
   * Validation messages, from the accessible error text associated with the
   * control (`aria-describedby`, `aria-errormessage`, `role="alert"`). With no
   * argument, every message in the form.
   */
  errorsFor(path?: string): Promise<readonly ConformanceMessage[]>

  /**
   * The key of the wizard page a person is on, from the page's accessible
   * identity — the step marked `aria-current="step"`, or the accessible name of
   * the region. `undefined` when the form is not paginated.
   */
  currentPage(): Promise<string | undefined>

  /**
   * A stable text rendering of the accessible tree, in the shape Playwright's
   * `ariaSnapshot()` produces. The runner attaches it to a failure, because the
   * person reading the failure is usually debugging a renderer they did not
   * write and cannot see the screen.
   */
  ariaSnapshot(): Promise<string>

  /** Submit the form as a person would: press the submit control. */
  submit(): Promise<SubmitResult>

  /**
   * Audit the rendered form and report every accessibility violation in it.
   *
   * Called on the freshly mounted form and again after every step that can
   * change the DOM, because the interesting failures are not in the initial
   * render — they are in the state a form reaches after an error appears, a
   * row is added or a tab is opened, which is exactly where a hand-written
   * audit never looks.
   *
   * **The auditor belongs to the driver, not to this package.** Three reasons,
   * and the first is sufficient: this package is published and framework-free,
   * and adding axe-core to it would put a browser dependency in the tree of
   * every consumer including the Node engine driver. The second is that only
   * the driver has a DOM to audit. The third is that a third party certifying
   * a renderer may well have standardised on a different auditor, and the
   * contract here is *zero violations*, not *axe specifically*.
   *
   * Optional, because a driver with no DOM has nothing to audit: the in-process
   * engine driver and the server's revalidation driver both leave it out. A
   * driver that DOES render markup and omits it is not audited, which is a
   * choice its author is making in the open rather than one this package can
   * make for them.
   */
  audit?(): Promise<readonly AccessibilityViolation[]>

  /** Tear down. Optional: an in-process engine driver has nothing to tear down. */
  unmount?(): Promise<void>
}

/**
 * One thing wrong with the rendered markup.
 *
 * Shaped after axe-core's result because that is what nearly every
 * implementation will have to hand, but deliberately not axe's own type: a
 * published contract that imported one auditor's types would make that auditor
 * part of the contract.
 */
export interface AccessibilityViolation {
  /** The rule that failed, e.g. `label` or `aria-valid-attr-value`. Stable. */
  readonly id: string
  readonly impact?: 'minor' | 'moderate' | 'serious' | 'critical'
  /** One line the renderer's author can act on. */
  readonly help: string
  readonly helpUrl?: string
  /**
   * The offending markup, one entry per node, as a selector or an HTML
   * fragment. Never empty: a violation nobody can locate is a violation nobody
   * will fix.
   */
  readonly nodes: readonly string[]
}

export interface MountOptions {
  readonly initialValues?: Readonly<Record<string, JsonValue>>
  /** BCP 47. Drivers that render one language only may ignore it. */
  readonly locale?: string
}

/**
 * A validation message.
 *
 * Fixtures assert on `code`, never on `text`: a suite that asserted on human
 * wording would fail on every copy edit and could not run under two locales,
 * and the renderers would then quietly stop being held to anything.
 */
export interface ConformanceMessage {
  readonly path: string
  /** Machine-readable and stable, e.g. `required`, `minLength`, `pattern`. */
  readonly code: string
  /** What a person actually reads. Carried for diagnostics, never asserted. */
  readonly text?: string
  readonly severity?: 'error' | 'warning'
}

export interface SubmitResult {
  readonly status: SubmitStatus
  /** The payload, present only when accepted. */
  readonly data?: JsonValue
  readonly messages: readonly ConformanceMessage[]
}

/**
 * A driver, or a way to make one. A browser renderer wants a fresh instance per
 * case; an in-process engine is happy to be reused.
 */
export type DriverFactory = () => RendererDriver | Promise<RendererDriver>
