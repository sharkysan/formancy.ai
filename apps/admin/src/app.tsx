import { useCallback, useEffect, useMemo, useState } from 'react'
import Editor from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import { BuildPane } from './build-pane.js'
import { WebhooksPane } from './webhooks-pane.js'
import { SignIn } from './sign-in.js'
import '@formancy/themes/workbench.css'
import '@formancy/themes/blueprint.css'
import './admin.css'
import { Mark } from './mark.js'
import { createFormEngine } from '@formancy/core'
import { validateSchema } from '@formancy/spec/validate'
import { CURRENT_SPEC_VERSION } from '@formancy/spec'
import { ErrorSummary, FormancyForm, FormancyProvider } from '@formancy/react'
import {
  Unauthorized,
  currentToken,
  exportUrl,
  fetchForm,
  fetchForms,
  fetchSubmissions,
  fetchVersions,
  publish,
  setToken,
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
  const [signedIn, setSignedIn] = useState(() => currentToken() !== null)

  const reloadForms = useCallback(async () => {
    setForms(await fetchForms())
  }, [])

  useEffect(() => {
    if (!signedIn) return
    // Swallowing the error used to render an empty list, which reads as "there
    // are no forms" rather than "you are not signed in". A 401 now says so.
    void reloadForms().catch((error: unknown) => {
      setForms([])
      if (error instanceof Unauthorized) setSignedIn(false)
    })
  }, [reloadForms, signedIn])

  if (!signedIn) return <SignIn onSignedIn={() => setSignedIn(true)} />

  return (
    <div className="wb-app">
      <nav className="wb-nav">
        <div className="wb-brand">
          <h1>
            <Mark />
            formancy.ai
          </h1>
          <span className="wb-badge">admin</span>
        </div>
        <button
          className="wb-quiet"
          onClick={() => {
            setToken(null)
            setSignedIn(false)
          }}
        >
          Sign out
        </button>
        <p className="wb-nav-heading" id="wb-forms-heading">
          Forms
        </p>
        <ul aria-labelledby="wb-forms-heading">
          {forms.map((form) => (
            <li key={form.path}>
              <button
                aria-current={form.path === selected}
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
      <main>
        {selected === undefined ? (
          <div className="wb-empty-state">
            <p className="wb-empty-title">No form open</p>
            <p>Pick a form, or type a new path on the left.</p>
          </div>
        ) : (
          <FormWorkspace key={selected} path={selected} onPublished={reloadForms} />
        )}
      </main>
    </div>
  )
}

/**
 * What a brand new form starts as.
 *
 * Version 2, not 1. A version 1 document may not contain a version 2
 * construct, so a form started at version 1 cannot be given tick boxes, a file
 * field or formatted text — the builder refuses them by name and offers to
 * move the document, which is correct and is also a dead end nobody asked to
 * be in. A form created today should start at the version this package speaks.
 */
const NEW_FORM_TEMPLATE = (path: string) =>
  JSON.stringify(
    {
      specVersion: CURRENT_SPEC_VERSION,
      id: path,
      title: path,
      model: { fields: [{ key: 'email', type: 'text', label: 'Email', required: true }] },
    },
    null,
    2,
  )

function FormWorkspace({ path, onPublished }: { path: string; onPublished: () => Promise<void> }) {
  const [tab, setTab] = useState<
    'build' | 'editor' | 'versions' | 'submissions' | 'webhooks'
  >('build')
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

  // One publish path for every tab. Two copies is how the builder starts
  // publishing something subtly different from the editor.
  const publishSource = async (): Promise<void> => {
    if (source === undefined) return
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
  }

  if (source === undefined) return <p className="wb-loading">Loading…</p>

  return (
    <div className="wb-main">
      <div className="wb-titlebar">
        <strong>{path}</strong>
        <div className="wb-tabs">
        {(['build', 'editor', 'versions', 'submissions', 'webhooks'] as const).map((candidate) => (
          <button key={candidate} onClick={() => setTab(candidate)} aria-pressed={tab === candidate}>
            {candidate}
          </button>
        ))}
        </div>
        <span className="wb-published" data-published={serverHash !== undefined}>
          {serverHash === undefined ? 'never published' : `published ${serverHash.slice(0, 12)}…`}
        </span>
      </div>
      {tab === 'build' ? (
        <BuildPane
          source={source}
          onChange={setSource}
          publishState={publishState}
          onPublish={() => { void publishSource() }}
          formPath={path}
        />
      ) : tab === 'editor' ? (
        <EditorPane
          source={source}
          onChange={setSource}
          publishState={publishState}
          onPublish={() => { void publishSource() }}
        />
      ) : tab === 'versions' ? (
        <VersionsPane path={path} />
      ) : tab === 'webhooks' ? (
        <WebhooksPane />
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
  onPublish: () => void
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
    <div className="wb-split">
      <div className="wb-split-source">
        <div className="wb-split-tools">
          <button className="wb-primary" onClick={() => void onPublish()} disabled={'problems' in preview}>
            Publish
          </button>
          {publishState !== undefined &&
            (publishState.ok ? (
              <span className="wb-ok">published as v{publishState.version}</span>
            ) : (
              <span className="wb-problem">{publishState.message}</span>
            ))}
        </div>
        <Editor
          language="json"
          value={source}
          onChange={(next) => onChange(next ?? '')}
          beforeMount={defineNightTheme}
          theme="formancy-night"
          options={{
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 13,
            fontFamily: "'IBM Plex Mono', ui-monospace, Consolas, monospace",
          }}
        />
      </div>
      <div className="wb-split-preview">
        {'problems' in preview ? (
          <ul className="wb-problems">
            {preview.problems.map((problem, index) => (
              <li key={index}>{problem}</li>
            ))}
          </ul>
        ) : (
          // In a theme, as the builder's canvas is: a preview in no theme at
          // all looked like a broken page rather than like the form.
          <div className="wb-sheet" data-formancy-theme="blueprint">
            <FormancyProvider engine={preview.engine} key={source}>
              <ErrorSummary />
              <FormancyForm />
            </FormancyProvider>
          </div>
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
    <div className="wb-page">
      <table className="wb-table">
        <thead>
          <tr>
            <th>Version</th>
            <th>Title</th>
            <th>Schema hash</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((version) => (
            <tr key={version.version}>
              <td>
                <span className="wb-version">v{version.version}</span>
              </td>
              <td>{version.title}</td>
              <td>
                <code>{version.schemaHash.slice(0, 16)}…</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {versions.length === 0 ? (
        <p className="wb-empty-note">Nothing published yet. The first publish is version 1.</p>
      ) : null}
    </div>
  )
}

function SubmissionsPane({ path }: { path: string }) {
  const [submissions, setSubmissions] = useState<SubmissionEntry[]>([])
  useEffect(() => {
    fetchSubmissions(path).then(setSubmissions).catch(() => setSubmissions([]))
  }, [path])
  return (
    <div className="wb-page">
      <p className="wb-page-actions">
        <a className="wb-button" href={exportUrl(path)}>
          Download CSV (columns unioned across versions)
        </a>
      </p>
      <table className="wb-table">
        <thead>
          <tr>
            <th>Submitted</th>
            <th>Version</th>
            <th>Data</th>
          </tr>
        </thead>
        <tbody>
          {submissions.map((submission) => (
            <tr key={submission.id}>
              <td className="wb-nowrap">{submission.submittedAt}</td>
              <td>
                <span className="wb-version">v{submission.version}</span>
              </td>
              <td>
                <code className="wb-data">{JSON.stringify(submission.data)}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {submissions.length === 0 ? (
        <p className="wb-empty-note">No submissions yet.</p>
      ) : null}
    </div>
  )
}

/**
 * The JSON editor, in the admin's colours: Monaco draws its own surface, and
 * a stock light editor inside a dark workbench reads as two products.
 */
function defineNightTheme(monaco: Monaco): void {
  monaco.editor.defineTheme('formancy-night', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'string.key.json', foreground: 'c3b9ff' },
      { token: 'string.value.json', foreground: '9ee8c9' },
      { token: 'number', foreground: 'ff9ecf' },
      { token: 'keyword.json', foreground: 'ff9ecf' },
    ],
    colors: {
      'editor.background': '#0b0f18',
      'editor.lineHighlightBackground': '#141a29',
      'editorLineNumber.foreground': '#3a445a',
      'editorLineNumber.activeForeground': '#95a0b4',
      'editor.selectionBackground': '#3b3470',
      'editorCursor.foreground': '#3fe0d5',
    },
  })
}
