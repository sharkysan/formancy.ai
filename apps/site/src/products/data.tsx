import { PLAYGROUND } from '../chrome.js'
import { DataExample } from '../module-examples/data.js'
import type { Product } from './product.js'
import { github } from './product.js'

/**
 * `/products/data/` (0242), read from formancy.ai-data on 2026-11-25 at 0.5.0's `main`:
 * each capability names what its README, `docs/guide/capabilities.md` and the files under
 * `packages/data-core/src` and `packages/data-server/src` do today. Each is said as a buyer
 * would ask it; the guide that `further` links says it in full. What it does not do yet its
 * README says under that heading, and what is not tested the guide's tested-on page, which
 * `further` links; this page leaves both there (0245). If the module changes, this changes by
 * hand.
 */

const REPOSITORY = 'formancy.ai-data'
const DEMO = 'https://formancy.ai/data/demo/'

export const DATA: Product = {
  page: 'data',
  name: 'Formancy Data',
  repository: REPOSITORY,
  title: 'Formancy Data: forms over your PostgreSQL or SQL Server',
  description:
    'Turn an existing PostgreSQL or SQL Server database into forms in your React or Angular app, generated from what an account may do, under your rules.',
  h1: (
    <>
      Your existing database, <em>as forms in your own application</em>
    </>
  ),
  lede:
    'Formancy Data turns the tables of your PostgreSQL or SQL Server database into forms inside your React or Angular application. It generates each ' +
    'form from what the connected account may do, checks your rules on every request, and knows people by the token your application already ' +
    'issues. You host it.',
  ctas: [
    { label: 'Try the live demo', href: DEMO },
    { label: 'See generated forms in React and Angular', href: 'https://formancy.ai/data/examples/' },
    { label: 'Read the getting-started guide', href: github(REPOSITORY, 'docs/getting-started.md') },
    { label: 'Source on GitHub', href: github(REPOSITORY) },
  ],
  example: {
    figure: <DataExample variant="page" />,
    real: { label: 'Try the live demo: the real server and PostgreSQL, over sample data', href: DEMO },
  },
  capabilities: [
    {
      label: 'Forms from the database you already run',
      detail:
        'Point it at a table and it generates the form and its lookups from what the connected account may read and write. It says what it ' +
        'inferred, made read-only or left out, and why.',
    },
    {
      label: 'Your rules, checked on every request',
      detail:
        'A policy says who may read, create, change and delete which fields and which rows, and the server checks it on every request. People ' +
        'sign in with your application’s own token: Formancy Data keeps no users or passwords of its own.',
    },
    {
      label: 'Lists, lookups and child records',
      detail:
        'People page, search, sort and filter the records they may see, and keep views of their own. A lookup offers only the rows a person may ' +
        'choose, and child rows sit in tabs beside their parent.',
    },
    {
      label: 'Saves that overwrite nobody',
      detail:
        'A save made over somebody else’s newer change is refused, not written over it. A record and its child rows are saved together or not ' +
        'at all, and exact numbers stay exact to the last digit.',
    },
    {
      label: 'Buttons that run your own procedures',
      detail:
        'Bind a PostgreSQL function or a SQL Server procedure to a form, and the roles the policy names can run it over the open record or the ' +
        'ones they chose, in one transaction and never twice for one request.',
    },
    {
      label: 'CSV exports, bulk changes and deletes',
      detail:
        'People download what their list shows as one CSV file, whole or not at all, and change or delete the records they chose on a page in ' +
        'one go. They are told what became of each.',
    },
    {
      label: 'Schema changes caught before they break a form',
      detail:
        'A fresh read of the schema is compared with what each published form relies on, and the server refuses what a change breaks rather ' +
        'than writing past it.',
    },
    {
      label: 'A studio for the administrator',
      detail:
        'Connect, generate, set the policy, arrange, publish and review changes in one place, with every version kept and a second person’s ' +
        'approval when you want one. Every request is audited, and the server ships as one signed image.',
    },
  ],
  further: {
    lede: 'Formancy Data’s own guide says each of these in full, every line linking the decision record whose test fails when it stops being true.',
    links: [
      { label: 'What it does, in full', href: github(REPOSITORY, 'docs/guide/capabilities.md') },
      { label: 'What it is tested on', href: github(REPOSITORY, 'docs/guide/tested-on.md') },
      { label: 'The studio', href: github(REPOSITORY, 'docs/guide/studio.md') },
      { label: 'The host page', href: github(REPOSITORY, 'docs/guide/host.md') },
      { label: 'The live demo', href: github(REPOSITORY, 'docs/guide/live-demo.md') },
    ],
  },
  jobs: [
    'Order entry and order lists over the database an ERP or a shop already writes',
    'Customer master data kept by clerks, each tenant seeing only its own rows',
    'Back-office screens for a SaaS product’s own PostgreSQL, inside the product’s React or Angular app',
    'An order with its lines and deliveries, saved together in one transaction',
    'Status workflows such as draft, placed, shipped, where each move is allowed only to named roles',
    'An “approve” or “ship” button that runs a stored procedure your DBA already wrote',
    'A clerk downloading exactly the records they may see as CSV',
    'Checking what a schema migration does to every published form before it goes live',
    'An administrator browsing any table or view’s rows as the connection’s account sees them',
  ],
  whoFor:
    'Teams and software vendors whose data already lives in PostgreSQL or Microsoft SQL Server and whose staff need to list, search, enter and change ' +
    'it inside their own React or Angular application. They want this without hand-writing a form, an endpoint and a permission check for every ' +
    'table, and without the module bringing a schema, users or passwords of its own. The administrator works in the studio. The people filling in ' +
    'forms use your application, signed in with the token it already issues.',
  fits: [
    'formancy — the spec, the engine, the renderers, the builder and the backend — is Apache-2.0 and free, and stays so. Formancy Data depends on ' +
      'its released packages at exact versions and copies none of their code.',
    <>
      Your application draws each form with formancy’s own renderer, <code>@formancy/react</code> or <code>@formancy/angular</code>, and reads and saves records
      through Formancy Data’s browser client. Formancy Data’s server runs as one signed image beside your database. Its getting-started guide, at the top of
      this page, names each package.
    </>,
    <>
      To see formancy on its own first, open the <a href={PLAYGROUND}>playground</a>, or the <a href="/angular-form-builder/">Angular form builder</a>.
    </>,
  ],
  release: {
    version: '0.5.0',
    date: '2026-11-22',
    preview: false,
    said: 'Its fifth release. The examples page and the live demo are deployed from the repository’s main branch, not from a release.',
  },
  licence: {
    line: 'Formancy Data Source-Available Licence, Version 1.1, in force from 11 October 2026. Not reviewed by a lawyer.',
    rows: [
      ['Read the source and fork the repository', 'Free'],
      ['Evaluate, develop and test — including in companies', 'Free'],
      ['Run in production, internally or customer-facing', 'Paid licence'],
      ['Redistribute inside another software product', 'Separate commercial agreement'],
      ['Customer data and generated form definitions', 'Remain the customer’s'],
    ],
    howToBuy:
      'Production licences are requested from the Rightsholder at info@formancy.ai, as section 9 of the licence says, and so is the separate agreement ' +
      'redistribution needs. There is no published price: it will be set after the first design partners.',
  },
}
