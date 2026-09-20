import { useCallback, useEffect, useMemo, useState } from 'react'
import Editor from '@monaco-editor/react'
import { createFormEngine } from '@formancy/core'
import { validateSchema } from '@formancy/spec/validate'
import { ErrorSummary, FormancyForm, FormancyProvider } from '@formancy/react'
import {
  exportUrl,
  fetchForm,
  fetchForms,
  fetchSubmissions,
  fetchVersions,
  publish,
} from './api.js'
import type { FormListEntry, PublishResult, SubmissionEntry, VersionEntry } from './api.js'

/**
 * The self-hosted admin, v0.1 cut: no drag-and-drop builder — a schema editor
 * with live preview is what this release's audience (developers evaluating the
 * platform) actually needs, and it is honest about what exists. Forms on the
 * left; the selected form's editor, version history and submissions as tabs.
 */
export function App() {
  const [forms, setForms] = useState<FormListEntry[]>([])
  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [creating, setCreating] = useState('')

  const reloadForms = useCallback(async () => {
    setForms(await fetchForms())
  }, [])

  useEffect(() => {
    void reloadForms().catch(() => setForms([]))
  }, [reloadForms])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', height: '100vh', fontFamily: 'system-ui' }}>
      <nav style={{ borderRight: '1px solid #ccc', padding: '1rem', overflow: 'auto' }}>
        <h1 style={{ fontSize: '1.2rem', marginTop: 0 }}>formancy</h1>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {forms.map((form) => (
            <li key={form.path}>
              <button
                style={{ width: '100%', textAlign: 'left', padding: '0.4rem', fontWeight: form.path === selected ? 'bold' : 'normal' }}
                onClick={() => setSelected(form.path)}
              >
                {form.title} <small>v{form.version}</small>
              </button>
            </li>
          ))}
        </ul>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (creating !== '') {
              setSelected(creating)
              setCreating('')
            }
          }}
        >
          <label>
            New form path{' '}
            <input value={creating} onChange={(event) => setCreating(event.target.value)} placeholder="contact-us" />
          </label>
        </form>
      </nav>
      <main style={{ overflow: 'hidden' }}>
        {selected === undefined ? (
          <p style={{ padding: '1rem' }}>Pick a form, or type a new path on the left.</p>
        ) : (
          <FormWorkspace key={selected} path={selected} onPublished={reloadForms} />
        )}
      </main>
    </div>
  )
}

const NEW_FORM_TEMPLATE = (path: string) =>
  JSON.stringify(
    {
      specVersion: '0',
      id: path,
      title: path,
      model: { fields: [{ key: 'email', type: 'text', label: 'Email', required: true }] },
    },
    null,
    2,
  )

function FormWorkspace({ path, onPublished }: { path: string; onPublished: () => Promise<void> }) {
  const [tab, setTab] = useState<'editor' | 'versions' | 'submissions'>('editor')
  const [source, setSource] = useState<string | undefined>(undefined)
  const [serverHash, setServerHash] = useState<string | undefined>(undefined)
  const [publishState, setPublishState] = useState<PublishResult | undefined>(undefined)

  useEffect(() => {
    fetchForm(path)
      .then((resolved) => {
        setSource(JSON.stringify(resolved.schema, null, 2))
        setServerHash(resolved.schemaHash)
      })
      .catch(() => setSource(NEW_FORM_TEMPLATE(path)))
  }, [path])

  if (source === undefined) return <p style={{ padding: '1rem' }}>Loading…</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ borderBottom: '1px solid #ccc', padding: '0.5rem 1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <strong>{path}</strong>
        {(['editor', 'versions', 'submissions'] as const).map((candidate) => (
          <button key={candidate} onClick={() => setTab(candidate)} aria-pressed={tab === candidate}>
            {candidate}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#666' }}>
          {serverHash === undefined ? 'never published' : `published ${serverHash.slice(0, 12)}…`}
        </span>
      </div>
      {tab === 'editor' ? (
        <EditorPane
          source={source}
          onChange={setSource}
          publishState={publishState}
          onPublish={async () => {
            try {
              const outcome = await publish(path, JSON.parse(source))
              setPublishState(outcome)
              if (outcome.ok) {
                setServerHash(outcome.schemaHash)
                await onPublished()
              }
            } catch (error) {
              setPublishState({ ok: false, message: error instanceof Error ? error.message : String(error) })
            }
          }}
        />
      ) : tab === 'versions' ? (
        <VersionsPane path={path} />
      ) : (
        <SubmissionsPane path={path} />
      )}
    </div>
  )
}

function EditorPane({
  source,
  onChange,
  onPublish,
  publishState,
}: {
  source: string
  onChange: (next: string) => void
  onPublish: () => Promise<void>
  publishState: PublishResult | undefined
}) {
  const preview = useMemo(() => {
    try {
      const validated = validateSchema(JSON.parse(source))
      if (!validated.valid) return { problems: validated.errors.map((e) => `${e.path} — ${e.message}`) }
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
      return { problems: [error instanceof Error ? error.message : String(error)] }
    }
  }, [source])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid #ccc' }}>
        <div style={{ padding: '0.5rem' }}>
          <button onClick={() => void onPublish()} disabled={'problems' in preview}>
            Publish
          </button>{' '}
          {publishState !== undefined &&
            (publishState.ok ? (
              <span>published as v{publishState.version}</span>
            ) : (
              <span style={{ color: '#a00' }}>{publishState.message}</span>
            ))}
        </div>
        <Editor
          language="json"
          value={source}
          onChange={(next) => onChange(next ?? '')}
          options={{ minimap: { enabled: false }, scrollBeyondLastLine: false }}
        />
      </div>
      <div style={{ padding: '1rem', overflow: 'auto' }}>
        {'problems' in preview ? (
          <ul>
            {preview.problems.map((problem, index) => (
              <li key={index}>{problem}</li>
            ))}
          </ul>
        ) : (
          <FormancyProvider engine={preview.engine} key={source}>
            <ErrorSummary />
            <FormancyForm />
          </FormancyProvider>
        )}
      </div>
    </div>
  )
}

function VersionsPane({ path }: { path: string }) {
  const [versions, setVersions] = useState<VersionEntry[]>([])
  useEffect(() => {
    fetchVersions(path).then(setVersions).catch(() => setVersions([]))
  }, [path])
  return (
    <table style={{ margin: '1rem', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ textAlign: 'left', padding: '0.3rem 1rem' }}>Version</th>
          <th style={{ textAlign: 'left', padding: '0.3rem 1rem' }}>Title</th>
          <th style={{ textAlign: 'left', padding: '0.3rem 1rem' }}>Schema hash</th>
        </tr>
      </thead>
      <tbody>
        {versions.map((version) => (
          <tr key={version.version}>
            <td style={{ padding: '0.3rem 1rem' }}>v{version.version}</td>
            <td style={{ padding: '0.3rem 1rem' }}>{version.title}</td>
            <td style={{ padding: '0.3rem 1rem' }}>
              <code>{version.schemaHash.slice(0, 16)}…</code>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SubmissionsPane({ path }: { path: string }) {
  const [submissions, setSubmissions] = useState<SubmissionEntry[]>([])
  useEffect(() => {
    fetchSubmissions(path).then(setSubmissions).catch(() => setSubmissions([]))
  }, [path])
  return (
    <div style={{ padding: '1rem', overflow: 'auto' }}>
      <p>
        <a href={exportUrl(path)}>Download CSV (columns unioned across versions)</a>
      </p>
      <table style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '0.3rem 1rem' }}>Submitted</th>
            <th style={{ textAlign: 'left', padding: '0.3rem 1rem' }}>Version</th>
            <th style={{ textAlign: 'left', padding: '0.3rem 1rem' }}>Data</th>
          </tr>
        </thead>
        <tbody>
          {submissions.map((submission) => (
            <tr key={submission.id}>
              <td style={{ padding: '0.3rem 1rem', whiteSpace: 'nowrap' }}>{submission.submittedAt}</td>
              <td style={{ padding: '0.3rem 1rem' }}>v{submission.version}</td>
              <td style={{ padding: '0.3rem 1rem' }}>
                <code>{JSON.stringify(submission.data)}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
