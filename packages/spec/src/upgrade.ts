import { CURRENT_SPEC_VERSION } from './types.js'
import type { FormSchema, SpecVersion } from './types.js'

/**
 * Moving a document to a newer spec version.
 *
 * One line long, and that is the point rather than an accident: version 2 is a
 * superset of version 1, so upgrading is declaring the version and nothing
 * else. If this function ever needs to rewrite the document, the version it is
 * rewriting for was not a superset and the compatibility story in
 * `SPEC_VERSIONS` is no longer true.
 *
 * Downgrading is deliberately absent. A document using a version 2 construct
 * cannot be expressed in version 1 by any rewriting, and the plausible-looking
 * answers — drop the field, or turn it into a text box — are both silent data
 * loss dressed up as a conversion.
 */
export function upgradeSpecVersion(
  document: FormSchema,
  to: SpecVersion = CURRENT_SPEC_VERSION,
): FormSchema {
  if (document.specVersion === to) return document
  if (document.specVersion > to) {
    throw new Error(
      `Cannot move a spec ${document.specVersion} document back to ${to}: version ${document.specVersion} has constructs version ${to} cannot express, and dropping them would be data loss rather than a conversion.`,
    )
  }
  return { ...document, specVersion: to }
}
