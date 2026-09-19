import { describe, test } from 'vitest'
import { describeConformance } from '@formancy/conformance'
import { createReactDriver } from './conformance-driver.js'

/**
 * The moment the architecture pays off or does not: the SAME fixtures that
 * specify the engine's semantics, driven through the real React renderer by
 * accessible name and role only. A failure here is a renderer bug or a
 * semantics disagreement — either way, exactly what this suite exists to catch.
 */
describeConformance(() => createReactDriver(), {
  name: 'React renderer conformance',
  test: { describe, test },
})
