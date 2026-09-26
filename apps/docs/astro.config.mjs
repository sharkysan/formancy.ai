// @ts-check
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

export default defineConfig({
  // Where these pages actually live. formancy.ai is one static deployment: the
  // landing page at `/`, the playground at `/playground/`, these at `/docs/`.
  // Without `base` every link Starlight generates points at the landing page's
  // root, and without `site` the sitemap is silently skipped.
  site: 'https://formancy.ai',
  base: '/docs',
  integrations: [
    starlight({
      title: 'formancy.ai',
      favicon: '/favicon.svg',
      // Starlight writes the title, description and URL for each page; the
      // preview image is the landing page's, so a shared docs link looks like
      // the rest of formancy.ai rather than a bare text card.
      head: [
        { tag: 'meta', attrs: { property: 'og:image', content: 'https://formancy.ai/og.png' } },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
        { tag: 'meta', attrs: { name: 'twitter:image', content: 'https://formancy.ai/og.png' } },
      ],
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
            { label: 'Quickstart: coding agents', slug: 'start/agents' },
          ],
        },
        {
          label: 'Concepts',
          items: [
            { label: 'The schema', slug: 'concepts/schema' },
            { label: 'Logic and expressions', slug: 'concepts/logic' },
            { label: 'Versioning', slug: 'concepts/versioning' },
            { label: 'Files', slug: 'concepts/files' },
            { label: 'Conformance', slug: 'concepts/conformance' },
          ],
        },
        {
          label: 'Reference',
          items: [{ label: 'Spec reference (v2)', slug: 'reference/spec' }],
        },
        {
          label: 'Project',
          items: [{ label: 'Roadmap and status', slug: 'project/roadmap' }],
        },
      ],
    }),
  ],
})
