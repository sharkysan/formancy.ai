import { describe, test } from 'vitest'
import { describeConformance } from '@formancy/conformance'
import { createAngularDriver } from '../../src/conformance-driver'
import { provideFormancyMaterial } from './index'

/**
 * The fixtures every renderer is held to, with Material drawing the fields (0132).
 *
 * The same suite, the same driver, the same rule — every control found by role and
 * accessible name — with one provider added. A design system that drew a field
 * differently enough for a person to fill it in differently fails here, which is the
 * claim a Material adapter has to be able to make.
 */
describeConformance(() => createAngularDriver({ providers: [provideFormancyMaterial()] }), {
  name: 'Angular Material conformance',
  test: { describe, test },
})
