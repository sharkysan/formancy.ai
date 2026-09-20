// @ts-check
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

export default defineConfig({
  integrations: [
    starlight({
      title: 'formancy',
      favicon: '/favicon.svg',
      description:
        'A self-hostable form engine and backend for React and Angular: one engine in browser and server, headless renderers, Apache-2.0.',
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'What is formancy?', slug: 'index' },
            { label: 'Quickstart: React', slug: 'start/react' },
            { label: 'Quickstart: Angular', slug: 'start/angular' },
            { label: 'Quickstart: self-hosting', slug: 'start/self-hosting' },
          ],
        },
        {
          label: 'Concepts',
          items: [
            { label: 'The schema', slug: 'concepts/schema' },
            { label: 'Logic and expressions', slug: 'concepts/logic' },
            { label: 'Versioning', slug: 'concepts/versioning' },
            { label: 'Conformance', slug: 'concepts/conformance' },
          ],
        },
        {
          label: 'Reference',
          items: [{ label: 'Spec reference (v0)', slug: 'reference/spec' }],
        },
        {
          label: 'Project',
          items: [{ label: 'Roadmap and status', slug: 'project/roadmap' }],
        },
      ],
    }),
  ],
})
