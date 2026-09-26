import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * How many decision records the repository holds, counted when the site is
 * built rather than written into the page.
 *
 * The landing page shows the number, and a literal went stale three times:
 * every branch that adds a record changes the count, and the branch that
 * shows it is never the same one. Counted here, a new record is on the page
 * the moment it is merged.
 */
export function countDecisionRecords(): number {
  const directory = fileURLToPath(new URL('../../docs/decisions/', import.meta.url))
  return readdirSync(directory).filter((name) => /^\d{4}-.*\.md$/.test(name)).length
}
