import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { ExamplesRecord, Storage } from '@formancy/server-core'
import { auditLog, auditRow, formExamples } from './db.js'

/**
 * A form's examples over PostgreSQL: one row per form in `form_examples`, replaced whole
 * (0166).
 *
 * Its own file because it changes for its own reason, and because `postgres-storage.ts`
 * would otherwise have crossed the size budget with it.
 */
export function examplesStorage(db: PostgresJsDatabase): Pick<Storage, 'getExamples' | 'keepExamples'> {
  return {
    async getExamples(formId) {
      const rows = await db.select().from(formExamples).where(eq(formExamples.formId, formId)).limit(1)
      const row = rows[0]
      if (row === undefined) return undefined
      return {
        formId: row.formId,
        scenarios: row.scenarios as ExamplesRecord['scenarios'],
        sample: row.sample as ExamplesRecord['sample'],
        updatedAt: row.updatedAt.toISOString(),
      }
    },

    async keepExamples(record, audit) {
      // ONE transaction, as a publish's: a change that rolled back leaves no row saying it
      // happened. The insert is the write whether or not a list was kept before, and the
      // foreign key refuses one for a form that is not there.
      await db.transaction(async (tx) => {
        const row = {
          formId: record.formId,
          scenarios: record.scenarios,
          sample: record.sample,
          updatedAt: new Date(record.updatedAt),
        }
        await tx
          .insert(formExamples)
          .values(row)
          .onConflictDoUpdate({
            target: formExamples.formId,
            set: { scenarios: row.scenarios, sample: row.sample, updatedAt: row.updatedAt },
          })
        if (audit !== undefined) await tx.insert(auditLog).values(auditRow(audit))
      })
    },
  }
}
