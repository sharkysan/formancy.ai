import { useMemo, useState, useSyncExternalStore } from 'react'
import Editor, { useMonaco } from '@monaco-editor/react'
import { createFormEngine } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import { validateSchema } from '@formancy/spec/validate'
import type { SchemaError } from '@formancy/spec/validate'
import formancySchemaJson from '@formancy/spec/schema.json'
import { ErrorSummary, FormancyForm, FormancyProvider } from '@formancy/react'
import { STARTER_SCHEMA } from './starter.js'

/**
 * The playground: the whole thesis on one screen. A schema on the left, the
 * live rendered form in the middle, the engine's actual state on the right.
 * Monaco is wired to the spec's own JSON Schema, so autocomplete and inline
 * squiggles come from the same document that will later drive the builder's
 * property panel — nothing here is hand-maintained.
 */
export function App() {
  const [source, setSource] = useState(() => JSON.stringify(STARTER_SCHEMA, null, 2))

  const monaco = useMonaco()
  if (monaco !== null) {
    // The loader's bundled types stub `languages.json` as deprecated; at
    // runtime the namespace is there. One structural cast at the boundary.
    const json = (monaco.languages as unknown as {
      json: { jsonDefaults: { setDiagnosticsOptions(options: object): void } }
    }).json
    json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      schemas: [
        {
          uri: 'https://formancy.dev/schema/0/formancy.schema.json',
          fileMatch: ['*'],
          schema: formancySchemaJson,
        },
      ],
    })
  }

  const parsed = useMemo(() => {
    try {
      return { document: JSON.parse(source) as unknown }
    } catch (error) {
      return { parseError: error instanceof Error ? error.message : String(error) }
    }
  }, [source])

  const validated = useMemo(() => {
    if (parsed.document === undefined) return undefined
    return validateSchema(parsed.document)
  }, [parsed])

  // A fresh engine per valid schema: the playground shows what a consumer
  // gets, and a consumer gets a new engine when the schema changes.
  const built = useMemo(() => {
    if (validated === undefined || !validated.valid) return undefined
    try {
      return {
        engine: createFormEngine({
          schema: validated.schema,
          capabilities: {
            now: () => Date.now(),
            today: () => new Date().toISOString().slice(0, 10),
            random: () => Math.random(),
          },
        }),
      }
    } catch (error) {
      // validateSchema passed but the engine refused: an expression error or a
      // dependency cycle. Exactly what a form author needs to see verbatim.
      return { engineError: error instanceof Error ? error.message : String(error) }
    }
  }, [validated])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', height: '100vh', fontFamily: 'system-ui' }}>
      <section style={{ borderRight: '1px solid #ccc', display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ margin: '0.5rem' }}>Schema</h2>
        <Editor
          language="json"
          value={source}
          onChange={(next) => setSource(next ?? '')}
          options={{ minimap: { enabled: false }, scrollBeyondLastLine: false }}
        />
      </section>

      <section style={{ borderRight: '1px solid #ccc', padding: '1rem', overflow: 'auto' }}>
        <h2 style={{ marginTop: 0 }}>Form</h2>
        {parsed.parseError !== undefined ? (
          <Problem title="Not valid JSON yet" detail={parsed.parseError} />
        ) : validated !== undefined && !validated.valid ? (
          <SchemaProblems errors={validated.errors} />
        ) : built?.engineError !== undefined ? (
          <Problem title="The engine refused this schema" detail={built.engineError} />
        ) : built?.engine !== undefined ? (
          <FormancyProvider engine={built.engine} key={source}>
            <ErrorSummary />
            <FormancyForm />
          </FormancyProvider>
        ) : null}
      </section>

      <section style={{ padding: '1rem', overflow: 'auto' }}>
        <h2 style={{ marginTop: 0 }}>Engine state</h2>
        {built?.engine !== undefined ? <EngineInspector engine={built.engine} /> : <p>—</p>}
      </section>
    </div>
  )
}

function Problem({ title, detail }: { title: string; detail: string }) {
  return (
    <div>
      <h3>{title}</h3>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{detail}</pre>
    </div>
  )
}

function SchemaProblems({ errors }: { errors: SchemaError[] }) {
  return (
    <div>
      <h3>The document is not a formancy form yet</h3>
      <ul>
        {errors.map((error, index) => (
          <li key={index}>
            <code>{error.path}</code> — {error.message}
          </li>
        ))}
      </ul>
    </div>
  )
}

function EngineInspector({ engine }: { engine: FormEngine }) {
  const value = useSyncExternalStore(
    (onChange) => engine.subscribe(onChange),
    () => JSON.stringify(engine.value(), null, 2),
    () => JSON.stringify(engine.value(), null, 2),
  )
  const errors = useSyncExternalStore(
    (onChange) => engine.subscribe(onChange),
    () => engine.visibleErrors(),
    () => engine.visibleErrors(),
  )
  return (
    <div>
      <h3>Value</h3>
      <pre>{value}</pre>
      <h3>Visible errors</h3>
      <pre>{JSON.stringify(errors, null, 2)}</pre>
      <h3>Fields</h3>
      <pre>{engine.fieldPaths().join('\n')}</pre>
    </div>
  )
}
