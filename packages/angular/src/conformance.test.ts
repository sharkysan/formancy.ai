import { describe, test } from 'vitest'
import { describeConformance } from '@formancy/conformance'
import { createAngularDriver } from './conformance-driver'

/**
 * The moment the architecture pays off or does not: the SAME fixtures that
 * specify the engine's semantics and certify the React renderer, driven
 * through the real Angular renderer by accessible name and role only. A
 * failure here is a renderer bug or a semantics disagreement — either way,
 * exactly what this suite exists to catch.
 */
describeConformance(() => createAngularDriver(), {
  name: 'Angular renderer conformance',
  test: { describe, test },
})
