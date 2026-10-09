import type { BuilderText } from '@formancy/builder-core'
import type { SchemaError } from '@formancy/spec/validate'

/**
 * Why the form pane shows no form: JSON that does not parse, a document the validator
 * refuses, or one the engine does not build. Out of `app.tsx`, the composition root,
 * because they draw rather than compose.
 */
export function Problem({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="problem">
      <h3>{title}</h3>
      <pre>{detail}</pre>
    </div>
  )
}

export function SchemaProblems({ errors, text }: { errors: SchemaError[]; text: BuilderText }) {
  return (
    <div className="problem">
      <h3>{errors.length === 1 ? 'One thing to fix' : `${errors.length} things to fix`}</h3>
      <ul>
        {errors.map((error, index) => (
          <li key={index}>
            <code>{error.path}</code> {text.error(error)}
          </li>
        ))}
      </ul>
    </div>
  )
}
