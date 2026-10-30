import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import { BuildPane } from './build-pane.js'
import { useKeptExamples } from './examples-pane.js'
import { PublishNote } from './publish-note.js'
import { FillPane } from './fill-pane.js'
import { TranslationsTab } from './translations-tab.js'
import { WebhooksPane } from './webhooks-pane.js'
import { SignIn } from './sign-in.js'
import { SubmissionAnswers } from './submission-answers.js'
import { ResponsesSummary } from './responses-summary.js'
import '@formancy/themes/workbench.css'
// After the workbench, whose light defaults its --wb-* recolour: both say :root.
import '@formancy/themes/room.css'
import '@formancy/themes/blueprint.css'
import './admin.css'
import { Mark } from './mark.js'
import { createFormEngine } from '@formancy/core'
import { validateSchema } from '@formancy/spec/validate'
import { CURRENT_SPEC_VERSION } from '@formancy/spec'
import type { FormSchema } from '@formancy/spec'
import { ErrorSummary, FormancyForm, FormancyProvider } from '@formancy/react'
import {
  Unauthorized,
  currentToken,
  exportUrl,
  fetchForm,
  fetchForms,
  fetchModel,
  fetchSubmissionPage,
  fetchSummary,
  fetchVersion,
  fetchVersions,
  publish,
  setToken,
} from './api.js'
import type { FormListEntry, PublishResult, ServerModel, SubmissionEntry, VersionEntry, VersionSummary } from './api.js'

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
  // Whether the server has a model for the builders, asked once per sign-in (0165).
  const [model, setModel] = useState<ServerModel | undefined>(undefined)

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

  useEffect(() => {
    if (!signedIn) return
    // None, rather than an error: a viewer is refused the answer, and a server without
    // the route has no model to offer either. A server with none says so in a 200 (0183).
    void fetchModel()
      .then(setModel)
      .catch(() => setModel(undefined))
  }, [signedIn])

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
              <button aria-current={form.path === selected} onClick={() => setSelected(form.path)}>
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
            New form path <input value={creating} onChange={(event) => setCreating(event.target.value)} placeholder="contact-us" />
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
          <FormWorkspace key={selected} path={selected} onPublished={reloadForms} model={model} />
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

function FormWorkspace({ path, onPublished, model }: { path: string; onPublished: () => Promise<void>; model: ServerModel | undefined }) {
  const [tab, setTab] = useState<'build' | 'editor' | 'translations' | 'fill in' | 'versions' | 'submissions' | 'webhooks'>('build')
  const [source, setSource] = useState<string | undefined>(undefined)
  const [serverHash, setServerHash] = useState<string | undefined>(undefined)
  const [publishState, setPublishState] = useState<PublishResult | undefined>(undefined)
  // The form's examples are the server's, beside a form it has: none before the first publish (0166).
  const kept = useKeptExamples(path, serverHash !== undefined)

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
      // `serverHash` is the version this editor OPENED, which is what the
      // server compares against — not the hash of what is being sent. Holding it
      // and not sending it is how the second of two editors used to win in
      // silence.
      const outcome = await publish(path, JSON.parse(source), serverHash)
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
          {(['build', 'editor', 'translations', 'fill in', 'versions', 'submissions', 'webhooks'] as const).map((candidate) => (
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
          onPublish={() => {
            void publishSource()
          }}
          formPath={path}
          model={model}
          kept={kept}
          published={serverHash !== undefined}
        />
      ) : tab === 'editor' ? (
        <EditorPane
          source={source}
          onChange={setSource}
          publishState={publishState}
          onPublish={() => {
            void publishSource()
          }}
        />
      ) : tab === 'translations' ? (
        <TranslationsTab source={source ?? ''} onChange={setSource} model={model} />
      ) : tab === 'fill in' ? (
        // The published form, filled in against the server, with a draft behind
        // it. Here because this is where the server already is: the playground
        // has no backend and the marketing site must not depend on one.
        <FillPane path={path} />
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
          {/* The same component the builder uses. These two had drifted into
              wording the same success differently, which nobody using one tab
              could see. */}
          <PublishNote state={publishState} />
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
    fetchVersions(path)
      .then(setVersions)
      .catch(() => setVersions([]))
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
      {versions.length === 0 ? <p className="wb-empty-note">Nothing published yet. The first publish is version 1.</p> : null}
    </div>
  )
}

function SubmissionsPane({ path }: { path: string }) {
  const [submissions, setSubmissions] = useState<SubmissionEntry[]>([])
  // What the responses say together, counted by the server per version (0223), where the pane
  // counted the submissions it had listed.
  const [summaries, setSummaries] = useState<readonly VersionSummary[]>([])
  useEffect(() => {
    let live = true
    fetchSummary(path)
      .then((counted) => {
        if (live) setSummaries(counted)
      })
      .catch(() => setSummaries([]))
    return () => {
      live = false
    }
  }, [path])
  // Each version's document that has submissions, to read them back through (0193): a submission
  // answered its own version's questions, which may not be the current one's (0207). A version
  // whose document could not be fetched leaves its submissions as stored.
  const [documents, setDocuments] = useState<ReadonlyMap<number, FormSchema>>(new Map())
  // A page at a time, the next when the person asks for more (0222): the listing was every
  // submission of the form. `next` asks for the page after the last one shown, `null` at the end.
  const [next, setNext] = useState<string | null>(null)
  const asked = useRef(new Set<number>())
  const take = useCallback(
    async (page: { submissions: SubmissionEntry[]; next: string | null }, first: boolean, live: () => boolean) => {
      if (first) asked.current = new Set()
      setSubmissions((held) => (first ? page.submissions : [...held, ...page.submissions]))
      setNext(page.next)
      // Each version's document once, as its first submission arrives.
      const numbers = [...new Set(page.submissions.map((submission) => submission.version))].filter((version) => !asked.current.has(version))
      for (const version of numbers) asked.current.add(version)
      const fetched = await Promise.allSettled(numbers.map((version) => fetchVersion(path, version)))
      const read = fetched.flatMap((outcome) => (outcome.status === 'fulfilled' ? [[outcome.value.version, outcome.value.schema] as const] : []))
      if (live()) setDocuments((held) => new Map([...(first ? [] : held), ...read]))
    },
    [path],
  )
  useEffect(() => {
    let live = true
    fetchSubmissionPage(path)
      .then((page) => (live ? take(page, true, () => live) : undefined))
      .catch(() => setSubmissions([]))
    return () => {
      live = false
    }
  }, [path, take])
  const more = (): void => {
    if (next === null) return
    void fetchSubmissionPage(path, next)
      .then((page) => take(page, false, () => true))
      .catch(() => undefined)
  }
  return (
    <div className="wb-page">
      <p className="wb-page-actions">
        <a className="wb-button" href={exportUrl(path)}>
          Download CSV (columns unioned across versions)
        </a>
      </p>
      {summaries.map((summary) => (
        <ResponsesSummary key={summary.version} summary={summary} />
      ))}
      <table className="wb-table">
        <thead>
          <tr>
            <th>Submitted</th>
            <th>Version</th>
            <th>Answers</th>
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
                {documents.has(submission.version) ? (
                  <SubmissionAnswers schema={documents.get(submission.version)!} data={submission.data} />
                ) : (
                  <code className="wb-data">{JSON.stringify(submission.data)}</code>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {submissions.length === 0 ? <p className="wb-empty-note">No submissions yet.</p> : null}
      {next === null ? null : (
        <p className="wb-page-actions">
          <button type="button" className="wb-button" onClick={more}>
            Show more submissions
          </button>
        </p>
      )}
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
