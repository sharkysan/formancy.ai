/** Navigation is present on the landing page even when the demo is never used. */
export function SiteFooter({ packageVersion }: { packageVersion: string }) {
  return (
    <footer>
      <span>Apache-2.0</span>
      <a href="https://github.com/sharkysan/formancy.ai" rel="noreferrer noopener">Source</a>
      <a href="/docs">Documentation</a>
      <a href="/privacy/" lang="de">Datenschutz</a>
      <a href="/imprint/" lang="de">Impressum</a>
      <span className="spacer">{`Spec version 2 · packages ${packageVersion}, beta`}</span>
    </footer>
  )
}
